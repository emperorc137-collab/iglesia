import { useState, useEffect, useMemo, useRef } from "react";
import {
  MapPin, Search, Calendar, Mic, Shield, Plus, X, Check, ChevronLeft, ChevronRight,
  Trees, Users, Clock, ArrowLeft, MessageCircle, Image as ImageIcon, Droplet,
  Key, LogIn, LogOut, Send, Upload, UserCircle, Copy, Trash2, AlertCircle,
  Compass, Pencil, Network, ExternalLink, Globe, Download, Lock,
  BookOpen, GitBranch, Cake, ArrowRightLeft, Filter, ShieldCheck, History,
} from "lucide-react";
import { supabase } from "./supabaseClient";

const CENTRAL_API_URL = "https://api.tu-dominio.org"; // reemplazar por el dominio real del túnel

const STORAGE_KEYS = {
  BRANCHES: "branches",
  EVENTS: "events",
  SPEAKERS: "speakers",
  ORDINANCES: "ordinances",
  MEMBERS: "members",
  PHOTOS: "photos",
  MESSAGES: "messages",
  ACCOUNTS: "accounts",
  SESSION: "activeSession",
  WELCOME_PAGE: "welcome_page",
  ROLES: "roles",
  MISSIONARIES: "missionaries",
  COMPANIONSHIPS: "companionships",
  ADMIN_CODES: "admin_codes",
  BRANCH_CREDENTIALS: "branch_credentials",
};

const SUPABASE_STORE_KEYS = new Set([
  STORAGE_KEYS.EVENTS, STORAGE_KEYS.SPEAKERS, STORAGE_KEYS.ORDINANCES, STORAGE_KEYS.MEMBERS,
  STORAGE_KEYS.PHOTOS, STORAGE_KEYS.MESSAGES, STORAGE_KEYS.MISSIONARIES,
  STORAGE_KEYS.COMPANIONSHIPS, STORAGE_KEYS.ADMIN_CODES, STORAGE_KEYS.BRANCH_CREDENTIALS,
  STORAGE_KEYS.WELCOME_PAGE,
  STORAGE_KEYS.ROLES,
]);

const PROFILE_FIELDS = ['id', 'email', 'name', 'role', 'branch_id', 'invited_by_branch_id', 'active', 'expires_at', 'created_at'];

function normalizeProfileRow(row) {
  if (!row) return row;
  return {
    ...row,
    branchId: row.branch_id ?? row.branchId ?? null,
    invitedByBranchId: row.invited_by_branch_id ?? row.invitedByBranchId ?? null,
    expiresAt: row.expires_at ?? row.expiresAt ?? null,
    createdAt: row.created_at ?? row.createdAt ?? null,
  };
}

function profileToDb(profile) {
  const row = { ...profile };
  delete row.localPassword;
  delete row.localOnly;
  delete row.password;
  if (row.branchId !== undefined) { row.branch_id = row.branchId; delete row.branchId; }
  if (row.invitedByBranchId !== undefined) { row.invited_by_branch_id = row.invitedByBranchId; delete row.invitedByBranchId; }
  if (row.expiresAt !== undefined) { row.expires_at = row.expiresAt; delete row.expiresAt; }
  if (row.createdAt !== undefined) { row.created_at = row.createdAt; delete row.createdAt; }
  return row;
}

const LEADERSHIP_ROLES = ["Presidente de Rama", "Primer Consejero", "Segundo Consejero", "Secretario de Rama"];
function hasLeadershipRole(session, members) {
  if (!session) return false;
  return members.some((m) => m.accountId === session.id && LEADERSHIP_ROLES.includes(m.role));
}
function canManageRecords(session, members) {
  return isActiveSession(session) && (session.role === "admin" || hasLeadershipRole(session, members));
}

const seedBranch = {
  id: "bosque-sincelejo",
  name: "Rama Bosque",
  location: "Sincelejo, Sucre, Colombia",
  district: "Distrito Sincelejo",
  lat: 9.3047,
  lng: -75.3978,
  symbol: "tree",
  status: "approved",
  verification: "verified",
  meetingTime: "Domingo 9:00 AM",
  adminId: null,
  parentBranchId: null,
  serverBranchId: null,
  siteUrl: "",
  createdAt: new Date().toISOString(),
};

const SEED_ADMIN_CREDENTIALS = { email: "admin@ramabosque.org", password: "bosque2026" };

const CHURCH_ROLES = [
  "Presidente de Rama", "Primer Consejero", "Segundo Consejero", "Secretario de Rama",
  "Sociedad de Socorro", "Quorum de Élderes", "Mujeres Jóvenes", "Hombres Jóvenes",
  "Primaria", "Escuela Dominical", "Miembro",
];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}
function secureCode(length = 6) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(length);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}
function codePrefix(branchName) {
  return branchName.split(" ")[0].slice(0, 6).toUpperCase().replace(/[^A-Z]/g, "");
}
function genInviteCode(branchName) {
  return `${codePrefix(branchName)}-${secureCode(6)}`;
}
function genMissionaryCode(branchName) {
  return `MIS-${codePrefix(branchName)}-${secureCode(6)}`;
}
function genVisitorCode(branchName) {
  return `VIS-${codePrefix(branchName)}-${secureCode(6)}`;
}
function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}
function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function monthsSince(dateStr) {
  if (!dateStr) return 0;
  const start = new Date(dateStr);
  if (isNaN(start.getTime())) return 0;
  const now = new Date();
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months -= 1;
  return Math.max(0, months);
}
function isActiveSession(session) {
  return !!session && session.active !== false;
}

function authSessionToAccount(authSession, accounts = []) {
  if (!authSession?.user) return null;
  const user = authSession.user;
  const metadata = user.user_metadata || {};
  const existing = accounts.find((a) => a.email === user.email || a.id === user.id);
  return {
    id: existing?.id || user.id,
    authUserId: user.id,
    name: metadata.name || existing?.name || user.email,
    email: user.email,
    role: metadata.role || existing?.role || "member",
    branchId: metadata.branchId || existing?.branchId || null,
    invitedByBranchId: metadata.invitedByBranchId || existing?.invitedByBranchId || null,
    active: metadata.active !== false && (existing?.active !== false),
    expiresAt: metadata.expiresAt || existing?.expiresAt || null,
    createdAt: metadata.createdAt || existing?.createdAt || new Date().toISOString(),
  };
}

/* ---------- API central ---------- */
async function centralApi(path, options = {}) {
  const res = await fetch(`${CENTRAL_API_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  let body = null;
  try { body = await res.json(); } catch (e) { /* respuesta vacía */ }
  if (!res.ok) throw new Error(body?.error || `Error del servidor central (${res.status})`);
  return body;
}
function registerBranchCentral({ name, location, district, lat, lng, inviteCode }) {
  return centralApi("/branches/register", {
    method: "POST",
    body: JSON.stringify({ name, location, district, lat, lng, inviteCode }),
  });
}
function verifyBranchCentral(apiKey) {
  return centralApi("/branches/verify", { headers: { "X-Branch-Api-Key": apiKey } });
}
function createInviteCodeCentral(apiKey) {
  return centralApi("/invite-codes", { method: "POST", headers: { "X-Branch-Api-Key": apiKey } });
}
function listInviteCodesCentral(apiKey) {
  return centralApi("/invite-codes", { headers: { "X-Branch-Api-Key": apiKey } });
}

const GLOBAL_CSS = `
  * { box-sizing: border-box; }
  .btn-primary, .btn-secondary, .card-item { transition: transform .12s ease, box-shadow .12s ease, background .12s ease, border-color .12s ease; }
  .btn-primary:hover { filter: brightness(1.08); box-shadow: 0 3px 10px rgba(31,92,63,0.25); }
  .btn-secondary:hover { border-color: #1f5c3f; color: #1f5c3f; }
  .card-item:hover { box-shadow: 0 4px 14px rgba(0,0,0,0.08); transform: translateY(-1px); }
  .map-node:hover circle { filter: brightness(1.15); }
  .nav-tabs { scrollbar-width: none; }
  .nav-tabs::-webkit-scrollbar { display: none; }
  input, select, textarea, button { font-family: inherit; }
  @media (max-width: 680px) {
    .container-page { padding: 14px !important; }
    .app-header { padding: 10px 12px !important; }
    .brand-subtitle { display: none !important; }
    .brand-title { font-size: 13px !important; }
    .nav-tabs { flex-wrap: nowrap !important; overflow-x: auto !important; width: 100%; -webkit-overflow-scrolling: touch; }
    .nav-tab-label { display: none !important; }
    .nav-tab-btn { padding: 8px !important; flex-shrink: 0; }
    .card-grid { grid-template-columns: 1fr !important; }
    .modal-box { width: 94vw !important; padding: 16px !important; max-height: 86vh !important; overflow-y: auto !important; }
    .type-select-row { gap: 5px !important; }
    .code-grid { grid-template-columns: 1fr !important; }
  }
`;

function useStore(key, initial, shared = true) {
  const [value, setValue] = useState(initial);
  const [loaded, setLoaded] = useState(false);

  // Keep writes limited to the columns defined by the branches table.
  const SUPABASE_BRANCH_FIELDS = ['id', 'name', 'location', 'district', 'lat', 'lng', 'status', 'created_at'];

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // Si es branches, leer de Supabase
        if (key === "branches") {
          const { data, error } = await supabase.from("branches").select("*");
          if (error) throw error;
          if (mounted && data && data.length > 0) {
            setValue(data.map((branch) => ({ ...seedBranch, ...branch })));
          } else if (mounted && data && data.length === 0) {
            // Si no hay ramas, insertar la rama inicial
            const seedBranch = {
              id: "bosque-sincelejo",
              name: "Rama Bosque",
              location: "Sincelejo, Sucre, Colombia",
              district: "Distrito Sincelejo",
              lat: 9.3047,
              lng: -75.3978,
              status: "approved",
            };
            const { data: inserted, error: insertError } = await supabase
              .from("branches")
              .insert([seedBranch])
              .select();
              if (insertError) throw insertError;
            if (mounted && inserted) setValue(inserted);
          }
        } else if (key === STORAGE_KEYS.ACCOUNTS) {
          const stored = localStorage.getItem(key);
          const localAccounts = stored ? JSON.parse(stored) : [];
          try {
            const { data, error } = await supabase.from("profiles").select("*");
            if (error) throw error;
            if (mounted && data) {
              const remoteAccounts = data.map(normalizeProfileRow);
              const merged = remoteAccounts.slice();
              localAccounts.forEach((item) => {
                if (!remoteAccounts.some((r) => r.id === item.id || (item.email && item.email === r.email))) {
                  merged.push(item);
                }
              });
              setValue(merged);
              if (mounted) setLoaded(true);
              return;
            }
          } catch (e) {
            console.warn("No se pudo leer public.profiles, usando localStorage:", e.message);
          }
          if (mounted) setValue(localAccounts);
        } else if (shared && SUPABASE_STORE_KEYS.has(key)) {
          const { data, error } = await supabase.from("app_store").select("value").eq("key", key).maybeSingle();
          if (error) throw error;
          if (mounted && data?.value) setValue(data.value);
        } else {
          const stored = localStorage.getItem(key);
          if (mounted && stored) setValue(JSON.parse(stored));
        }
      } catch (e) {
        console.warn("Supabase branches unavailable; using local storage.", e.message);
        const stored = localStorage.getItem(key);
        if (mounted && stored) setValue(JSON.parse(stored));
      }
      if (mounted) setLoaded(true);
    })();
    return () => { mounted = false; };
  }, [key]);

  const persist = async (next) => {
    setValue(next);
    try {
      if (key === "branches") {
        // Guardar en Supabase - filtrar solo los campos permitidos
        for (const branch of next) {
          const filtered = {};
          SUPABASE_BRANCH_FIELDS.forEach(field => {
            if (field in branch) filtered[field] = branch[field];
          });
          const { error } = await supabase
            .from("branches")
            .upsert(filtered);
          if (error) throw error;
        }
      } else if (key === STORAGE_KEYS.ACCOUNTS) {
        localStorage.setItem(key, JSON.stringify(next));
        const supabaseAccounts = next.filter((item) => item.email && item.email.trim() && !item.localOnly);
        if (supabaseAccounts.length > 0) {
          try {
            const profiles = supabaseAccounts.map((item) => profileToDb(item));
            const { error } = await supabase.from("profiles").upsert(profiles);
            if (error) throw error;
          } catch (e) {
            console.warn("No se pudo guardar en public.profiles, usando localStorage:", e.message);
          }
        }
        return;
      } else {
        if (shared && SUPABASE_STORE_KEYS.has(key)) {
          const { error } = await supabase.from("app_store").upsert({ key, value: next });
          if (error) throw error;
        } else {
          localStorage.setItem(key, JSON.stringify(next));
        }
      }
    } catch (e) {
      console.warn("Supabase store unavailable; using local storage.", e.message);
      localStorage.setItem(key, JSON.stringify(next));
    }
  };

  return [value, persist, loaded];
}

function BranchSymbol({ symbol = "tree", size = 48 }) {
  const Icon = symbol === "tree" ? Trees : Users;
  return (
    <div style={{
      width: size, height: size, borderRadius: 12, background: "#1f5c3f",
      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
    }}>
      <Icon size={size * 0.52} color="#0a0a0a" strokeWidth={2.2} />
    </div>
  );
}

function Badge({ children, tone = "neutral" }) {
  const tones = {
    neutral: { bg: "#eef1ee", color: "#334033" },
    pending: { bg: "#fdf3e2", color: "#8a5a10" },
    approved: { bg: "#e2f3e8", color: "#1f5c3f" },
    muted: { bg: "#f1eaea", color: "#8a4040" },
  };
  const t = tones[tone] || tones.neutral;
  return (
    <span style={{ background: t.bg, color: t.color, fontSize: 12, fontWeight: 500, padding: "3px 10px", borderRadius: 999, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

const inputStyle = {
  width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #e4e4e0",
  fontSize: 13, boxSizing: "border-box", fontFamily: "inherit",
};
const primaryBtn = {
  padding: "9px 14px", borderRadius: 8, border: "none", background: "#1f5c3f",
  color: "#fff", fontWeight: 500, cursor: "pointer", fontSize: 13,
};
const secondaryBtn = {
  padding: "9px 14px", borderRadius: 8, border: "1px solid #e4e4e0", background: "#fff",
  color: "#334033", fontWeight: 500, cursor: "pointer", fontSize: 13,
};
const iconBtnStyle = {
  width: 30, height: 30, borderRadius: 8, border: "1px solid #e4e4e0", background: "#fff",
  display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
};

const defaultWelcome = {
  mapImage: "",
  address: "Calle Principal, Sincelejo, Sucre, Colombia",
  contacts: ["+57 300 0000000"],
  missionariesA: "Misioneros A",
  missionariesB: "Misioneros B",
  welcomeMessage: "Bienvenidos a la comunidad de la Rama. ¡Nos alegra tenerte aquí!",
};

function WelcomePage({ onClose }) {
  const [welcome, setWelcome] = useStore(STORAGE_KEYS.WELCOME_PAGE, defaultWelcome);
  const [allPhotos] = useStore(STORAGE_KEYS.PHOTOS, []);
  const [editing, setEditing] = useState(false);
  const [selectedMissionary, setSelectedMissionary] = useState("A");

  const isAdmin = (typeof window !== 'undefined' && window.__session__ && window.__session__.role === 'admin');

  const save = () => {
    setWelcome(welcome);
    setEditing(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1200 }}>
      <div style={{ width: 920, maxWidth: "96%", background: "#fff", borderRadius: 12, padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Bienvenida — {welcome.address}</div>
            <div style={{ color: "#6b6b6b", fontSize: 13 }}>{welcome.welcomeMessage}</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {isAdmin && <button onClick={() => setEditing(!editing)} style={secondaryBtn}>{editing ? 'Cancelar' : 'Editar'}</button>}
            <button onClick={() => { localStorage.setItem('seen_welcome','true'); onClose?.(); }} style={primaryBtn}>Cerrar</button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16 }}>
          <div style={{ minHeight: 220, background: "#f3f3f3", borderRadius: 8, padding: 12 }}>
            {welcome.mapImage ? (
              <img src={welcome.mapImage} alt="Mapa" style={{ width: "100%", borderRadius: 8 }} />
            ) : (
              <div style={{ width: "100%", height: 220, display: "flex", alignItems: "center", justifyContent: "center", color: "#9a9a92" }}>Mapa de Sincelejo (sin imagen)</div>
            )}

            <div style={{ marginTop: 10 }}>
              <div style={{ fontWeight: 600 }}>Dirección</div>
              <div style={{ color: "#444" }}>{welcome.address}</div>
              <div style={{ fontWeight: 600, marginTop: 8 }}>Contactos</div>
              {welcome.contacts && welcome.contacts.map((c, i) => <div key={i} style={{ color: "#444" }}>{c}</div>)}
            </div>
          </div>

          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <button onClick={() => setSelectedMissionary('A')} style={{ ...(selectedMissionary==='A' ? primaryBtn : secondaryBtn) }}>{welcome.missionariesA}</button>
              <button onClick={() => setSelectedMissionary('B')} style={{ ...(selectedMissionary==='B' ? primaryBtn : secondaryBtn) }}>{welcome.missionariesB}</button>
            </div>
            <div style={{ padding: 12, borderRadius: 8, background: selectedMissionary === 'A' ? '#e8f6f0' : '#fff' }}>
              {selectedMissionary === 'A' ? (
                <div>Zona resaltada para {welcome.missionariesA}.</div>
              ) : (
                <div>Zona resaltada para {welcome.missionariesB}.</div>
              )}
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 600 }}>Fotos de la comunidad</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  {(() => {
                    const approved = (allPhotos || []).filter(p => p.status === 'approved');
                    if (approved.length === 0) return <div style={{ color: '#9a9a92' }}>Sin fotos aún</div>;
                    const shuffled = approved.slice().sort(() => 0.5 - Math.random());
                    return shuffled.slice(0,6).map((p, i) => (
                      <img key={p.id || i} src={p.dataUrl || p.src} alt={p.caption || ''} style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 6 }} />
                    ));
                  })()}
                </div>
            </div>
          </div>
        </div>

        {editing && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <label style={{ fontSize: 13 }}>Dirección</label>
                <input style={inputStyle} value={welcome.address || ''} onChange={(e) => setWelcome({ ...welcome, address: e.target.value })} />
              </div>
              <div>
                <label style={{ fontSize: 13 }}>Mapa (URL de imagen)</label>
                <input style={inputStyle} value={welcome.mapImage || ''} onChange={(e) => setWelcome({ ...welcome, mapImage: e.target.value })} />
              </div>
            </div>
            <div style={{ marginTop: 8 }}>
              <label style={{ fontSize: 13 }}>Contactos (separados por coma)</label>
              <input style={inputStyle} value={(welcome.contacts || []).join(', ')} onChange={(e) => setWelcome({ ...welcome, contacts: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
              <div>
                <label style={{ fontSize: 13 }}>Nombre Misioneros A</label>
                <input style={inputStyle} value={welcome.missionariesA || ''} onChange={(e) => setWelcome({ ...welcome, missionariesA: e.target.value })} />
              </div>
              <div>
                <label style={{ fontSize: 13 }}>Nombre Misioneros B</label>
                <input style={inputStyle} value={welcome.missionariesB || ''} onChange={(e) => setWelcome({ ...welcome, missionariesB: e.target.value })} />
              </div>
            </div>
            <div style={{ marginTop: 8 }}>
              <label style={{ fontSize: 13 }}>Mensaje de bienvenida</label>
              <textarea style={{ ...inputStyle, minHeight: 80 }} value={welcome.welcomeMessage || ''} onChange={(e) => setWelcome({ ...welcome, welcomeMessage: e.target.value })} />
            </div>
            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
              <button onClick={save} style={primaryBtn}>Guardar</button>
              <button onClick={() => setEditing(false)} style={secondaryBtn}>Cancelar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

async function geocodeAddress(address) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
    const res = await fetch(url, { headers: { "Accept-Language": "es" } });
    const data = await res.json();
    if (data && data[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    return null;
  } catch (e) {
    return null;
  }
}

function layoutTree(branches, width, height, padding) {
  const byId = {};
  branches.forEach((b) => { byId[b.id] = b; });
  const children = {};
  branches.forEach((b) => {
    const parent = b.parentBranchId && byId[b.parentBranchId] ? b.parentBranchId : "__root__";
    children[parent] = children[parent] || [];
    children[parent].push(b.id);
  });
  const levels = [];
  const visited = new Set();
  let frontier = children["__root__"] || [];
  branches.forEach((b) => {
    if ((!b.parentBranchId || !byId[b.parentBranchId]) && !frontier.includes(b.id)) frontier.push(b.id);
  });
  while (frontier.length > 0) {
    levels.push(frontier);
    frontier.forEach((id) => visited.add(id));
    const next = [];
    frontier.forEach((id) => (children[id] || []).forEach((cid) => { if (!visited.has(cid)) next.push(cid); }));
    frontier = next;
  }
  const points = {};
  const rowH = levels.length > 1 ? (height - padding * 2) / (levels.length - 1) : 0;
  levels.forEach((row, li) => {
    const colW = (width - padding * 2) / (row.length + 1);
    row.forEach((id, ci) => {
      points[id] = { ...byId[id], x: padding + colW * (ci + 1), y: padding + rowH * li };
    });
  });
  return points;
}

function NetworkMap({ branches, onSelect, highlightId, height = 340, mode = "geo" }) {
  const width = 900;
  const padding = 46;
  const valid = mode === "tree" ? branches : branches.filter((b) => typeof b.lat === "number" && typeof b.lng === "number" && !isNaN(b.lat) && !isNaN(b.lng));

  if (valid.length === 0) {
    return (
      <div style={{ border: "1px solid #e4e4e0", borderRadius: 12, height, display: "flex", alignItems: "center", justifyContent: "center", background: "#eef3ee", color: "#767670", fontSize: 13 }}>
        Aún no hay ramas ubicadas en el mapa.
      </div>
    );
  }

  let points;
  if (mode === "tree") {
    points = layoutTree(valid, width, height, padding + 10);
  } else {
    let minLat = Math.min(...valid.map((b) => b.lat));
    let maxLat = Math.max(...valid.map((b) => b.lat));
    let minLng = Math.min(...valid.map((b) => b.lng));
    let maxLng = Math.max(...valid.map((b) => b.lng));
    if (minLat === maxLat) { minLat -= 0.6; maxLat += 0.6; }
    if (minLng === maxLng) { minLng -= 0.6; maxLng += 0.6; }
    points = {};
    valid.forEach((b) => {
      points[b.id] = {
        ...b,
        x: padding + ((b.lng - minLng) / (maxLng - minLng)) * (width - padding * 2),
        y: padding + (1 - (b.lat - minLat) / (maxLat - minLat)) * (height - padding * 2),
      };
    });
  }

  const invitationLines = [];
  const serverLines = [];
  valid.forEach((b) => {
    if (b.parentBranchId && points[b.parentBranchId]) {
      invitationLines.push({ key: `inv-${b.id}`, from: points[b.parentBranchId], to: points[b.id] });
    }
    if (b.serverBranchId && b.serverBranchId !== b.id && points[b.serverBranchId]) {
      serverLines.push({ key: `srv-${b.id}`, from: points[b.serverBranchId], to: points[b.id] });
    }
  });

  const curve = (from, to) => {
    const mx = (from.x + to.x) / 2;
    const my = (from.y + to.y) / 2 - 20;
    return `M ${from.x} ${from.y} Q ${mx} ${my} ${to.x} ${to.y}`;
  };

  return (
    <div style={{ border: "1px solid #e4e4e0", borderRadius: 12, overflow: "hidden", background: "#eef3ee" }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height, display: "block" }}>
        <defs>
          <pattern id="dotgrid" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="1.4" fill="#d7e3da" />
          </pattern>
        </defs>
        <rect x="0" y="0" width={width} height={height} fill="url(#dotgrid)" />
        {invitationLines.map((l) => (
          <path key={l.key} d={curve(l.from, l.to)} fill="none" stroke="#1f5c3f" strokeWidth="1.8" strokeDasharray="6 5" opacity="0.55" />
        ))}
        {serverLines.map((l) => (
          <path key={l.key} d={curve(l.from, l.to)} fill="none" stroke="#0c447c" strokeWidth="1.8" strokeDasharray="1.5 6" strokeLinecap="round" opacity="0.6" />
        ))}
        {Object.values(points).map((p) => (
          <g key={p.id} className="map-node" onClick={() => onSelect && onSelect(p)} style={{ cursor: onSelect ? "pointer" : "default" }}>
            <circle cx={p.x} cy={p.y} r={p.id === highlightId ? 11 : 7.5} fill="#1f5c3f" stroke="#fff" strokeWidth="2.2" />
            <text x={p.x} y={p.y + 21} textAnchor="middle" fontSize="11" fill="#334033" fontFamily="system-ui, sans-serif">{p.name}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function MapLegend() {
  return (
    <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 11, color: "#767670", marginTop: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 18, height: 0, borderTop: "2px dashed #1f5c3f" }} /> Invitación
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 18, height: 0, borderTop: "2px dotted #0c447c" }} /> Servidor
      </div>
    </div>
  );
}

function ManifestoView() {
  const sections = [
    { icon: GitBranch, title: "Cada rama es dueña de su copia", body: "Todas las ramas corren el mismo código base, pero cada una aloja su propia copia en su propio dominio." },
    { icon: Network, title: "Conectadas por invitación", body: "Una rama nueva se une porque el administrador de una rama existente le entrega un código de invitación." },
    { icon: ShieldCheck, title: "Verificación central", body: "Un servidor central valida la API key y el código de invitación de cada rama antes de que aparezca en el directorio público." },
    { icon: Download, title: "Tus datos son tuyos", body: "Desde el panel de administración puedes exportar todos tus datos en JSON en cualquier momento." },
  ];
  return (
    <div className="container-page" style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <BookOpen size={22} color="#1f5c3f" />
        <div style={{ fontSize: 20, fontWeight: 500 }}>Cómo funciona la Red de Ramas</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 18 }}>
        {sections.map((s, i) => (
          <div key={i} style={{ border: "1px solid #e4e4e0", borderRadius: 12, padding: 16, display: "flex", gap: 12, background: "#fff" }}>
            <s.icon size={20} color="#1f5c3f" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 4 }}>{s.title}</div>
              <div style={{ fontSize: 13, color: "#334033", lineHeight: 1.5 }}>{s.body}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Header({ view, setView, session, onLogout, chatUnread = 0, speakerGaps = 0 }) {
  const tabs = [
    { id: "directory", label: "Directorio", icon: MapPin },
    { id: "red", label: "La Red", icon: BookOpen },
    { id: "calendar", label: "Calendario", icon: Calendar },
    { id: "speakers", label: "Discursos", icon: Mic, badge: speakerGaps },
    { id: "members", label: "Miembros", icon: Users },
    { id: "missionaries", label: "Misioneros", icon: Compass },
    { id: "photos", label: "Fotos", icon: ImageIcon },
    { id: "chat", label: "Chat", icon: MessageCircle, badge: chatUnread },
    { id: "admin", label: "Admin", icon: Shield },
  ];
  const visibleTabs = tabs.filter(t => !(t.id === 'admin' && !(session && session.role === 'admin')));
  return (
    <div className="app-header" style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "12px 20px", borderBottom: "1px solid #e4e4e0", background: "#ffffff",
      flexWrap: "wrap", gap: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <BranchSymbol size={34} />
        <div>
          <div className="brand-title" style={{ fontWeight: 500, fontSize: 15, color: "#1a1a18" }}>Red de Ramas</div>
          <div className="brand-subtitle" style={{ fontSize: 12, color: "#767670" }}>La Iglesia de Jesucristo de los Últimos Días</div>
        </div>
      </div>
      <div className="nav-tabs" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {visibleTabs.map((t) => (
          <button key={t.id} className="nav-tab-btn btn-secondary" onClick={() => setView(t.id)} style={{
            display: "flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: 8, position: "relative",
            border: "1px solid " + (view === t.id ? "#1f5c3f" : "#e4e4e0"),
            background: view === t.id ? "#1f5c3f" : "#fff",
            color: view === t.id ? "#fff" : "#334033", fontSize: 12, fontWeight: 500, cursor: "pointer",
          }}>
            <t.icon size={13} />
            <span className="nav-tab-label">{t.label}</span>
            {!!t.badge && t.badge > 0 && (
              <span style={{
                background: "#c0392b", color: "#fff", fontSize: 9, fontWeight: 700, borderRadius: 999,
                minWidth: 14, height: 14, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px",
              }}>{t.badge > 9 ? "9+" : t.badge}</span>
            )}
          </button>
        ))}
        {session ? (
          <button onClick={onLogout} className="btn-secondary" style={{ ...secondaryBtn, display: "flex", alignItems: "center", gap: 5, padding: "6px 10px" }}>
            <LogOut size={13} /> <span className="nav-tab-label">{session.name}</span>
          </button>
        ) : (
          <button onClick={() => setView("login")} className="btn-primary" style={{ ...primaryBtn, display: "flex", alignItems: "center", gap: 5, padding: "6px 10px" }}>
            <LogIn size={13} /> Ingresar
          </button>
        )}
      </div>
    </div>
  );
}

function LoginView({ accounts, setAccounts, branches, adminCodes, setAdminCodes, onLogin }) {
  const [mode, setMode] = useState("login");
  const [accountType, setAccountType] = useState("member");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState("");
  const [visitorBranchId, setVisitorBranchId] = useState(branches.find((b) => b.status === "approved")?.id || "");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const formatAuthError = (error) => {
    const message = typeof error === "string" ? error : error?.message || "Error de autenticación.";
    const lower = message.toLowerCase();
    if (lower.includes("rate limit")) {
      return "Se alcanzó el límite de envío de correo. Usa Iniciar sesión si ya tienes cuenta o espera unos minutos.";
    }
    if (lower.includes("already registered") || lower.includes("user already exists") || lower.includes("duplicate") || lower.includes("already been used")) {
      return "Ese correo ya está registrado. Usa Iniciar sesión en lugar de crear una cuenta.";
    }
    return message;
  };

  const existingEmailError = (message) => {
    const lower = String(message || "").toLowerCase();
    return lower.includes("already registered") || lower.includes("user already exists") || lower.includes("duplicate") || lower.includes("already been used") || lower.includes("email rate limit");
  };

  const TYPE_LABELS = {
    member: "Miembro",
    missionary: "Misionero",
    visitor: "Visitante / investigador",
    admin: "Admin de nueva rama",
  };

  const handleRegister = async () => {
    setError("");
    const isLocal = !regEmail?.trim();
    if (!username || !password) { setError("Completa nombre de usuario y contraseña."); return; }
    if (password !== passwordConfirm) { setError("Las contraseñas no coinciden."); return; }
    if (!isLocal && accounts.find((a) => a.email?.toLowerCase() === regEmail.toLowerCase())) {
      setError("Ese correo ya está registrado. Usa Iniciar sesión en lugar de crear una cuenta.");
      return;
    }
    if (accounts.find((a) => a.username && a.username.toLowerCase() === username.toLowerCase())) {
      setError("Ese nombre de usuario ya está en uso. Elige otro.");
      return;
    }

    if (!isLocal) {
      try {
        const { data: existingProfile, error: profileError } = await supabase.from("profiles").select("id").eq("email", email).maybeSingle();
        if (!profileError && existingProfile) {
          setError("Ese correo ya está registrado. Usa Iniciar sesión en lugar de crear una cuenta.");
          return;
        }
      } catch (e) {
        console.warn("No se pudo verificar si el correo existe:", e.message);
      }
    }

    if (accountType === "admin") {
      if (!code) { setError("Ingresa el código de invitación de una rama ya aceptada en la red."); return; }
      const adminCode = adminCodes.find((c) => c.code === code.trim().toUpperCase() && !c.used);
      if (!adminCode) { setError("Código inválido o ya utilizado."); return; }
      if (adminCode.expiresAt && new Date(adminCode.expiresAt) < new Date()) {
        setError("Este código de invitación venció.");
        return;
      }
      const account = {
        id: uid(), name, username, email: isLocal ? "" : regEmail, phone: phone || "", password: null,
        localOnly: isLocal, localPassword: isLocal ? password : null,
        branchId: null, role: "admin",
        invitedByBranchId: adminCode.issuerBranchId || null,
        active: true,
        createdAt: new Date().toISOString(),
      };
      try {
        setSubmitting(true);
        if (isLocal) {
          setAccounts([...accounts, account]);
          setAdminCodes(adminCodes.map((c) => (c.code === adminCode.code ? { ...c, used: true, usedBy: account.email || "local" } : c)));
          localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(account));
          onLogin(account);
          return;
        }

        const { data, error } = await supabase.auth.signUp({
          email: account.email,
          password: password,
          options: {
            data: {
              name: account.name,
              username: account.username,
              phone: account.phone,
              role: account.role,
              branchId: account.branchId,
              invitedByBranchId: account.invitedByBranchId,
              active: account.active,
              expiresAt: account.expiresAt,
              createdAt: account.createdAt,
            },
          },
        });
        if (error) throw error;
        const authAccount = { ...account, id: data.user?.id || account.id, password: null };
        const profileRow = {
          id: data.user?.id || account.id,
          email: authAccount.email,
          name: authAccount.name,
          username: authAccount.username || account.username,
          phone: authAccount.phone || account.phone,
          role: authAccount.role,
          branchId: authAccount.branchId,
          invitedByBranchId: authAccount.invitedByBranchId,
          active: authAccount.active,
          expiresAt: authAccount.expiresAt,
          createdAt: authAccount.createdAt,
        };
        const { error: profileError } = await supabase.from("profiles").upsert([profileRow]);
        if (profileError) throw profileError;
        setAccounts([...accounts, profileRow]);
        setAdminCodes(adminCodes.map((c) => (c.code === adminCode.code ? { ...c, used: true, usedBy: account.email || account.username || 'local' } : c)));
        if (data.session) {
          onLogin(profileRow);
        } else {
          setError("Cuenta creada. Revisa tu correo para confirmar el acceso si es necesario.");
        }
      } catch (e) {
        console.warn("Supabase Auth registro (admin):", e.message);
        setError(formatAuthError(e));
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (accountType === "visitor") {
      const branch = branches.find((b) => b.id === visitorBranchId && b.status === "approved");
      if (!branch) { setError("Selecciona la rama que deseas observar."); return; }
      const account = {
        id: uid(), name, username, email: isLocal ? "" : regEmail, phone: phone || "", password: null,
        localOnly: isLocal, localPassword: isLocal ? password : null,
        branchId: branch.id, role: "visitor",
        active: true, expiresAt: addMonths(new Date(), 3).toISOString(),
        createdAt: new Date().toISOString(),
      };
      try {
        setSubmitting(true);
        if (isLocal) {
          setAccounts([...accounts, account]);
          localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(account));
          onLogin(account);
          return;
        }
        const { data, error } = await supabase.auth.signUp({
          email: account.email,
          password: password,
          options: {
            data: {
              name: account.name,
              username: account.username,
              phone: account.phone,
              role: account.role,
              branchId: account.branchId,
              active: account.active,
              expiresAt: account.expiresAt,
              createdAt: account.createdAt,
            },
          },
        });
        if (error) throw error;
        const profileRow = {
          id: data.user?.id || account.id,
          email: account.email,
          name: account.name,
          username: account.username,
          phone: account.phone,
          role: account.role,
          branchId: account.branchId,
          invitedByBranchId: account.invitedByBranchId,
          active: account.active,
          expiresAt: account.expiresAt,
          createdAt: account.createdAt,
        };
        const { error: profileError } = await supabase.from("profiles").upsert([profileRow]);
        if (profileError) throw profileError;
        setAccounts([...accounts, profileRow]);
        if (data.session) {
          onLogin(profileRow);
        } else {
          setError("Cuenta creada. Revisa tu correo para confirmar el acceso si es necesario.");
        }
      } catch (e) {
        console.warn("Supabase Auth registro (visitor):", e.message);
        setError(formatAuthError(e));
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (!code) { setError("Ingresa el código asignado por las oficinas de tu rama."); return; }
    const upperCode = code.trim().toUpperCase();
    const branch = branches.find((b) => b.status === "approved" && (
      (accountType === "member" && b.inviteCode === upperCode) ||
      (accountType === "missionary" && b.missionaryCode === upperCode) ||
      (accountType === "visitor" && b.visitorCode === upperCode)
    ));
    if (!branch) { setError("Código de invitación inválido para el tipo de cuenta seleccionado."); return; }
    if (accountType === "visitor" && branch.visitorCodeExpiresAt && new Date(branch.visitorCodeExpiresAt) < new Date()) {
      setError("Este código de visitante venció.");
      return;
    }
    const account = {
      id: uid(), name, username, email: isLocal ? "" : regEmail, phone: phone || "", password: null, localOnly: isLocal,
      localPassword: isLocal ? password : null, branchId: branch.id,
      role: accountType === "missionary" ? "missionary" : accountType === "visitor" ? "visitor" : "member",
      active: true,
      expiresAt: accountType === "visitor" ? addMonths(new Date(), 3).toISOString() : null,
      createdAt: new Date().toISOString(),
    };
    try {
      setSubmitting(true);
      if (isLocal) {
        setAccounts([...accounts, account]);
        localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(account));
        onLogin(account);
        return;
      }
      const { data, error } = await supabase.auth.signUp({
        email: account.email,
        password: password,
        options: {
          data: {
            name: account.name,
            username: account.username,
            phone: account.phone,
            role: account.role,
            branchId: account.branchId,
            active: account.active,
            expiresAt: account.expiresAt,
            createdAt: account.createdAt,
          },
        },
      });
      if (error) throw error;
      const profileRow = profileToDb({
        id: data.user?.id || account.id,
        email: account.email,
        name: account.name,
        role: account.role,
        branchId: account.branchId,
        invitedByBranchId: account.invitedByBranchId,
        active: account.active,
        expiresAt: account.expiresAt,
        createdAt: account.createdAt,
      });
      const { error: profileError } = await supabase.from("profiles").upsert([profileRow]);
      if (profileError) throw profileError;
      setAccounts([...accounts, profileRow]);
      if (data.session) {
        onLogin(profileRow);
      } else {
        setError("Cuenta creada. Revisa tu correo para confirmar el acceso si es necesario.");
      }
    } catch (e) {
      console.warn("Supabase Auth registro:", e.message);
      setError(formatAuthError(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogin = async () => {
    setError("");
    setSubmitting(true);
    const tryLocalLogin = () => {
      const account = accounts.find((a) => a.localOnly && a.localPassword === password && (
        (identifier && ((a.email && a.email.toLowerCase() === identifier.toLowerCase()) || (a.username && a.username.toLowerCase() === identifier.toLowerCase()) || (a.phone && a.phone === identifier))) || (!identifier && a.localOnly)
      ));
      if (account) {
        onLogin(account);
        localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(account));
        return true;
      }
      return false;
    };

    try {
      if (!identifier?.trim()) {
        if (tryLocalLogin()) return;
        setError("Ingresa tu identificador (usuario, teléfono o correo) para iniciar sesión localmente.");
        return;
      }

      try {
        // Resolve identifier to an email if possible (username or phone -> email)
        let loginEmail = null;
        if (identifier.includes("@")) loginEmail = identifier.trim();
        else {
          const found = accounts.find((a) => (a.username && a.username.toLowerCase() === identifier.toLowerCase()) || (a.phone && a.phone === identifier));
          if (found && found.email) loginEmail = found.email;
        }
        if (!loginEmail) {
          // Try local login fallback
          if (tryLocalLogin()) return;
          setError("No se encontró una cuenta asociada a ese identificador.");
          return;
        }

        const { data, error } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
        if (!error && data) {
          const authUser = data.user || data.session?.user;
          if (authUser) {
            const { data: profile, error: profileError } = await supabase.from("profiles").select("*").eq("id", authUser.id).maybeSingle();
            if (profileError) throw profileError;
            if (!profile) {
              setError("No se encontró el perfil asociado a esta cuenta.");
              return;
            }
            const persisted = accounts.find((a) => a.id === profile.id);
            if (!persisted) setAccounts([...accounts, profile]);
            onLogin(profile);
            return;
          }
        }
      } catch (remoteError) {
        console.warn("Supabase Auth login falló, probando local:", remoteError.message);
      }

      if (tryLocalLogin()) return;
      setError("Identificador o contraseña incorrectos.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container-page" style={{ padding: 40, maxWidth: 400, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
        <button onClick={() => setMode("login")} className="btn-primary" style={mode === "login" ? primaryBtn : secondaryBtn}>Iniciar sesión</button>
        <button onClick={() => setMode("register")} className="btn-primary" style={mode === "register" ? primaryBtn : secondaryBtn}>Crear cuenta</button>
      </div>

      {mode === "register" && (
        <>
          <div style={{ fontSize: 12, color: "#767670", marginBottom: 8 }}>Tipo de cuenta</div>
          <div className="type-select-row" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
            {Object.entries(TYPE_LABELS).map(([key, label]) => (
              <button key={key} onClick={() => { setAccountType(key); setCode(""); setError(""); }} style={{
                padding: "6px 10px", borderRadius: 8, fontSize: 11.5, fontWeight: 500, cursor: "pointer",
                border: "1px solid " + (accountType === key ? "#1f5c3f" : "#e4e4e0"),
                background: accountType === key ? "#1f5c3f" : "#fff", color: accountType === key ? "#fff" : "#334033",
              }}>{label}</button>
            ))}
          </div>
          <div style={{ fontSize: 12, color: "#767670", marginBottom: 14, display: "flex", gap: 6, alignItems: "flex-start" }}>
            <Key size={14} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>
              {accountType === "member" && "Necesitas el código de invitación de tu rama."}
              {accountType === "missionary" && "Necesitas el código de misioneros de tu rama."}
              {accountType === "visitor" && "Puedes solicitar acceso como observador durante 3 meses."}
              {accountType === "admin" && "Necesitas un código de invitación emitido por el administrador de una rama ya aceptada en la red."}
            </span>
          </div>
        </>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {mode === "register" && (
          <>
            <input placeholder="Nombre completo (opcional)" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
            <input placeholder="Nombre de usuario (requerido)" value={username} onChange={(e) => setUsername(e.target.value)} style={inputStyle} />
            <input placeholder="Teléfono (opcional)" value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} />
            <input placeholder="Correo electrónico (opcional)" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} style={inputStyle} />
            <div style={{ fontSize: 11, color: "#6a6a6a", marginTop: -2, marginBottom: 10 }}>
              Deja el correo vacío para crear una cuenta local sin usar Supabase.
            </div>
          </>
        )}
        {mode === "login" && (
          <input placeholder="Usuario, teléfono o correo" value={identifier} onChange={(e) => setIdentifier(e.target.value)} style={inputStyle} />
        )}
        <div style={{ position: 'relative' }}>
          <input type={showPassword ? 'text' : 'password'} placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} style={{ ...inputStyle, paddingRight: 90 }} />
          <button onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: 8, top: 6, height: 34, padding: '6px 10px', borderRadius: 8, border: '1px solid #e4e4e0', background: '#fff', cursor: 'pointer' }}>{showPassword ? 'Ocultar' : 'Mostrar'}</button>
        </div>
        {mode === "register" && (
          <input type="password" placeholder="Confirmar contraseña" value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} style={inputStyle} />
        )}
        {mode === "register" && accountType === "visitor" && (
          <select value={visitorBranchId} onChange={(e) => setVisitorBranchId(e.target.value)} style={inputStyle}>
            <option value="">Selecciona una rama para observar</option>
            {branches.filter((b) => b.status === "approved").map((b) => <option key={b.id} value={b.id}>{b.name} — {b.location}</option>)}
          </select>
        )}
        {mode === "register" && accountType !== "visitor" && (
          <input placeholder="Código asignado por las oficinas" value={code} onChange={(e) => setCode(e.target.value)} style={inputStyle} />
        )}
        {error && (
          <div style={{ fontSize: 12, color: "#a33", display: "flex", gap: 6, alignItems: "flex-start" }}>
            <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} /> {error}
          </div>
        )}
        <button onClick={mode === "login" ? handleLogin : handleRegister} className="btn-primary" style={primaryBtn} disabled={submitting}>
          {submitting ? "Procesando…" : mode === "login" ? "Iniciar sesión" : "Crear cuenta"}
        </button>
      </div>
    </div>
  );
}

function DirectoryView({ branches, onOpenBranch, onGoJoin, session }) {
  const [query, setQuery] = useState("");
  const [districtFilter, setDistrictFilter] = useState("");
  const [mapMode, setMapMode] = useState("geo");
  const approved = branches.filter((b) => b.status === "approved");
  const districts = useMemo(() => Array.from(new Set(approved.map((b) => b.district).filter(Boolean))).sort(), [approved]);
  const filtered = approved.filter((b) =>
    (b.name + b.location + b.district).toLowerCase().includes(query.toLowerCase()) &&
    (!districtFilter || b.district === districtFilter)
  );

  return (
    <div className="container-page" style={{ padding: 24, maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
          <Search size={16} color="#9a9a92" style={{ position: "absolute", left: 12, top: 11 }} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar rama por nombre, ciudad o distrito..."
            style={{ ...inputStyle, padding: "10px 12px 10px 34px" }} />
        </div>
        {districts.length > 1 && (
          <div style={{ position: "relative", minWidth: 160 }}>
            <Filter size={14} color="#9a9a92" style={{ position: "absolute", left: 10, top: 12 }} />
            <select value={districtFilter} onChange={(e) => setDistrictFilter(e.target.value)} style={{ ...inputStyle, padding: "10px 10px 10px 30px" }}>
              <option value="">Todos los distritos</option>
              {districts.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <div style={{ display: "flex", border: "1px solid #e4e4e0", borderRadius: 8, overflow: "hidden" }}>
          <button onClick={() => setMapMode("geo")} style={{ border: "none", padding: "5px 10px", fontSize: 11, cursor: "pointer", background: mapMode === "geo" ? "#1f5c3f" : "#fff", color: mapMode === "geo" ? "#fff" : "#334033", display: "flex", alignItems: "center", gap: 4 }}>
            <MapPin size={11} /> Mapa
          </button>
          <button onClick={() => setMapMode("tree")} style={{ border: "none", padding: "5px 10px", fontSize: 11, cursor: "pointer", background: mapMode === "tree" ? "#1f5c3f" : "#fff", color: mapMode === "tree" ? "#fff" : "#334033", display: "flex", alignItems: "center", gap: 4 }}>
            <GitBranch size={11} /> Árbol
          </button>
        </div>
      </div>
      <div style={{ marginBottom: 6 }}>
        <NetworkMap branches={filtered} onSelect={onOpenBranch} mode={mapMode} />
      </div>
      <div style={{ marginBottom: 20 }}>
        <MapLegend />
      </div>

      <div className="card-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
        {filtered.map((b) => (
          <div key={b.id} className="card-item" onClick={() => onOpenBranch(b)} style={{ border: "1px solid #e4e4e0", borderRadius: 12, padding: 16, cursor: "pointer", background: "#fff" }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <BranchSymbol symbol={b.symbol} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{b.name}</div>
                  {b.verification === "verified" && <ShieldCheck size={13} color="#1f5c3f" />}
                </div>
                <div style={{ fontSize: 12, color: "#767670" }}>{b.location}</div>
              </div>
            </div>
            <div style={{ marginTop: 10, fontSize: 12, color: "#767670" }}>{b.district} · {b.meetingTime}</div>
            <div style={{ marginTop: 3, fontSize: 11, color: b.siteUrl ? "#1f5c3f" : "#9a9a92", display: "flex", alignItems: "center", gap: 4 }}>
              {b.siteUrl ? <><ExternalLink size={11} /> Abre en su propio sitio</> : <><Globe size={11} /> Usa este directorio compartido</>}
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div style={{ color: "#9a9a92", fontSize: 13, padding: 20 }}>No se encontraron ramas con ese criterio.</div>}
      </div>
    </div>
  );
}

function RequestBranchModal({ onClose, onSubmit, otherBranches }) {
  const [form, setForm] = useState({ name: "", location: "", district: "", meetingTime: "", address: "", symbol: "users", serverBranchId: "", siteUrl: "", inviteCode: "" });
  const [manual, setManual] = useState(false);
  const [manualLat, setManualLat] = useState("");
  const [manualLng, setManualLng] = useState("");
  const [geocoding, setGeocoding] = useState(false);
  const [geoError, setGeoError] = useState("");

  const handleSubmit = async () => {
    if (!form.name || !form.address) { setGeoError("Completa al menos el nombre y la dirección."); return; }
    if (!form.inviteCode.trim()) { setGeoError("Se requiere el código de invitación entregado por una rama ya aceptada en la red."); return; }
    let coords = null;
    if (manual && manualLat && manualLng) {
      coords = { lat: parseFloat(manualLat), lng: parseFloat(manualLng) };
    } else {
      setGeocoding(true);
      setGeoError("");
      coords = await geocodeAddress(form.address);
      setGeocoding(false);
    }
    if (!coords || isNaN(coords.lat) || isNaN(coords.lng)) {
      setGeoError("No pudimos ubicar esa dirección automáticamente. Activa \"ingresar coordenadas manualmente\" abajo.");
      return;
    }
    onSubmit({ ...form, lat: coords.lat, lng: coords.lng, serverBranchId: form.serverBranchId || null });
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: 24, width: 440, maxWidth: "90vw" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontWeight: 500, fontSize: 16 }}>Registrar mi rama</div>
          <X size={18} style={{ cursor: "pointer" }} onClick={onClose} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[["name", "Nombre de la rama"], ["location", "Ciudad / Departamento"], ["district", "Distrito o Estaca"], ["meetingTime", "Horario de reunión (ej: Domingo 9:00 AM)"]].map(([key, label]) => (
            <div key={key}>
              <div style={{ fontSize: 12, color: "#767670", marginBottom: 4 }}>{label}</div>
              <input value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} style={inputStyle} />
            </div>
          ))}
          <div>
            <div style={{ fontSize: 12, color: "#767670", marginBottom: 4 }}>Dirección completa (para ubicar en el mapa)</div>
            <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="Calle, ciudad, país" style={inputStyle} />
          </div>

          <div>
            <div style={{ fontSize: 12, color: "#767670", marginBottom: 4 }}>Código de invitación</div>
            <input value={form.inviteCode} onChange={(e) => setForm({ ...form, inviteCode: e.target.value })}
              placeholder="RED-XXXXXXXX" style={inputStyle} />
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#767670", cursor: "pointer" }}>
            <input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} />
            Ingresar coordenadas manualmente
          </label>
          {manual && (
            <div style={{ display: "flex", gap: 8 }}>
              <input placeholder="Latitud" value={manualLat} onChange={(e) => setManualLat(e.target.value)} style={inputStyle} />
              <input placeholder="Longitud" value={manualLng} onChange={(e) => setManualLng(e.target.value)} style={inputStyle} />
            </div>
          )}

          <div>
            <div style={{ fontSize: 12, color: "#767670", marginBottom: 4 }}>Dominio o enlace propio (opcional)</div>
            <input value={form.siteUrl} onChange={(e) => setForm({ ...form, siteUrl: e.target.value })}
              placeholder="https://mi-rama.ejemplo.org" style={inputStyle} />
          </div>

          {geoError && <div style={{ fontSize: 12, color: "#a33" }}>{geoError}</div>}
          <button onClick={handleSubmit} disabled={geocoding} className="btn-primary" style={{ ...primaryBtn, marginTop: 6, opacity: geocoding ? 0.6 : 1 }}>
            {geocoding ? "Ubicando dirección..." : "Registrar rama"}
          </button>
        </div>
      </div>
    </div>
  );
}

function BranchDetail({ branch, branches, events, ordinances, onBack, primaryBranchId, onGoMissionaries, onSelectBranch }) {
  const branchEvents = events.filter((e) => e.branchId === branch.id);
  const serverBranch = branch.serverBranchId ? branches.find((b) => b.id === branch.serverBranchId) : null;
  const parentBranch = branch.parentBranchId ? branches.find((b) => b.id === branch.parentBranchId) : null;

  return (
    <div className="container-page" style={{ padding: 24, maxWidth: 700, margin: "0 auto" }}>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, border: "none", background: "none", color: "#767670", fontSize: 13, cursor: "pointer", marginBottom: 16 }}>
        <ArrowLeft size={14} /> Volver al directorio
      </button>
      <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 20 }}>
        <BranchSymbol size={64} symbol={branch.symbol} />
        <div>
          <div style={{ fontSize: 20, fontWeight: 500, display: "flex", alignItems: "center", gap: 8 }}>
            {branch.name}
            {branch.verification === "verified" && <ShieldCheck size={16} color="#1f5c3f" />}
          </div>
          <div style={{ fontSize: 13, color: "#767670" }}>{branch.location} · {branch.district}</div>
        </div>
      </div>
      <div style={{ marginBottom: 8 }}>
        <NetworkMap branches={branches.filter((b) => b.status === "approved")} highlightId={branch.id} onSelect={onSelectBranch} />
      </div>
      <div style={{ marginBottom: 20 }}>
        <MapLegend />
      </div>
      <div style={{ border: "1px solid #e4e4e0", borderRadius: 12, padding: 16, marginBottom: 20, fontSize: 13, color: "#334033" }}>
        <div style={{ marginBottom: 6 }}><b style={{ fontWeight: 500 }}>Horario:</b> {branch.meetingTime}</div>
        <div style={{ marginBottom: 6 }}><b style={{ fontWeight: 500 }}>Dirección:</b> {branch.address}</div>
        <div style={{ marginBottom: branch.siteUrl ? 6 : 0 }}><b style={{ fontWeight: 500 }}>Invitada por:</b> {parentBranch ? parentBranch.name : "rama fundadora"}</div>
        {branch.siteUrl && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <b style={{ fontWeight: 500 }}>Sitio propio:</b>
            <a href={branch.siteUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#1f5c3f", display: "inline-flex", alignItems: "center", gap: 4 }}>
              {branch.siteUrl} <ExternalLink size={12} />
            </a>
          </div>
        )}
      </div>
      {branch.id === primaryBranchId && (
        <div className="card-item" onClick={onGoMissionaries} style={{ border: "1px solid #e4e4e0", borderRadius: 12, padding: 14, marginBottom: 20, cursor: "pointer", display: "flex", alignItems: "center", gap: 10, background: "#fff" }}>
          <Compass size={18} color="#1f5c3f" />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500, fontSize: 13 }}>Misioneros de esta rama</div>
            <div style={{ fontSize: 11, color: "#767670" }}>Perfiles, sectores y bautismos</div>
          </div>
          <ChevronRight size={16} color="#9a9a92" />
        </div>
      )}
      <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 10 }}>Próximas actividades</div>
      {branchEvents.length === 0 && <div style={{ fontSize: 13, color: "#9a9a92" }}>Sin actividades programadas.</div>}
      {branchEvents.map((ev) => (
        <div key={ev.id} style={{ border: "1px solid #e4e4e0", borderRadius: 8, padding: 10, marginBottom: 8, fontSize: 13 }}>
          <div style={{ fontWeight: 500 }}>{ev.title}</div>
          <div style={{ color: "#767670" }}>{ev.date}</div>
        </div>
      ))}
    </div>
  );
}

const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DAYS = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];

function fmtDate(year, month, d) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function MonthGrid({ cursor, setCursor, itemsByDate, onDayClick, renderItem }) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ fontWeight: 500, fontSize: 16 }}>{MONTHS[month]} {year}</div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => setCursor(new Date(year, month - 1, 1))} style={iconBtnStyle}><ChevronLeft size={16} /></button>
          <button onClick={() => setCursor(new Date())} style={{ ...iconBtnStyle, width: "auto", padding: "0 10px", fontSize: 12 }}>Hoy</button>
          <button onClick={() => setCursor(new Date(year, month + 1, 1))} style={iconBtnStyle}><ChevronRight size={16} /></button>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {DAYS.map((d) => <div key={d} style={{ fontSize: 11, color: "#9a9a92", textAlign: "center", padding: 4 }}>{d}</div>)}
        {cells.map((d, i) => {
          const dateStr = d ? fmtDate(year, month, d) : null;
          const dayItems = dateStr ? itemsByDate[dateStr] || [] : [];
          return (
            <div key={i} onClick={() => d && onDayClick(dateStr)} style={{
              minHeight: 70, borderRadius: 8, border: d ? "1px solid #e4e4e0" : "none",
              padding: 6, cursor: d ? "pointer" : "default", background: "#fff",
            }}>
              {d && (
                <>
                  <div style={{ fontSize: 12, color: "#767670" }}>{d}</div>
                  {dayItems.slice(0, 2).map((it, idx) => <div key={idx}>{renderItem(it)}</div>)}
                </>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

function buildAnniversaries(members, year) {
  const items = {};
  const push = (dateStr, label, kind) => {
    if (!dateStr) return;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return;
    const key = fmtDate(year, d.getMonth(), d.getDate());
    items[key] = items[key] || [];
    items[key].push({ id: `${kind}-${dateStr}-${label}`, title: label, kind });
  };
  members.forEach((m) => {
    if (m.birthDate) push(m.birthDate, `Cumpleaños de ${m.name}`, "birthday");
    if (m.baptismDate) push(m.baptismDate, `Aniversario de bautismo de ${m.name}`, "anniversary");
  });
  return items;
}

function CalendarView({ events, setEvents, branchId, session, members = [] }) {
  const [cursor, setCursor] = useState(new Date());
  const [showModal, setShowModal] = useState(null);
  const [calendarView, setCalendarView] = useState('monthly'); // monthly, weekly, daily, annual

  const eventsByDate = useMemo(() => {
    const map = {};
    events.forEach((e) => { map[e.date] = map[e.date] || []; map[e.date].push(e); });
    return map;
  }, [events]);

  const anniversariesByDate = useMemo(() => buildAnniversaries(members, cursor.getFullYear()), [members, cursor]);

  const combinedByDate = useMemo(() => {
    const map = {};
    Object.keys(eventsByDate).forEach((k) => { map[k] = [...eventsByDate[k]]; });
    Object.keys(anniversariesByDate).forEach((k) => { map[k] = [...(map[k] || []), ...anniversariesByDate[k]]; });
    return map;
  }, [eventsByDate, anniversariesByDate]);

  const injectDefaultSundayEvents = (dateStr) => {
    const d = new Date(dateStr);
    if (d.getDay() !== 0) return [];
    const defaults = [
      { id: `default-santa-${dateStr}`, title: 'Santa Cena y sermones', time: '09:00-10:00', kind: 'service' },
      { id: `default-escuela-${dateStr}`, title: 'Escuela Dominical', time: '10:00-11:00', kind: 'class' },
    ];
    const existing = combinedByDate[dateStr] || [];
    return defaults.filter(def => !existing.some(e => e.title === def.title));
  };

  const renderMonth = () => (
    <MonthGrid cursor={cursor} setCursor={setCursor} itemsByDate={combinedByDate} onDayClick={setShowModal}
      renderItem={(ev) => (
        <div style={{ fontSize: 10, background: ev.kind ? "#fbeaea" : "#e2f3e8", color: ev.kind ? "#8a4040" : "#1f5c3f", borderRadius: 4, padding: "2px 4px", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 3 }}>
          {ev.kind && <Cake size={9} />} {ev.title}
        </div>
      )} />
  );

  const renderWeekly = () => {
    const start = new Date(cursor);
    const day = start.getDay();
    start.setDate(start.getDate() - day);
    const days = Array.from({length:7}).map((_,i)=>{ const d=new Date(start); d.setDate(start.getDate()+i); return d; });
    return (
      <div>
        {days.map((d)=>{
          const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
          const dayEvents = [...(combinedByDate[key] || []), ...injectDefaultSundayEvents(key)];
          return (
            <div key={key} style={{ border: '1px solid #e4e4e0', padding: 10, borderRadius: 8, marginBottom: 8 }}>
              <div style={{ fontWeight: 600 }}>{d.toDateString()}</div>
              {dayEvents.length === 0 && <div style={{ color: '#9a9a92' }}>Sin actividades</div>}
              {dayEvents.map((ev)=> <div key={ev.id} style={{ marginTop: 6 }}>{ev.time ? `${ev.time} — ` : ''}{ev.title}</div>)}
            </div>
          );
        })}
      </div>
    );
  };

  const renderDaily = () => {
    const d = cursor;
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const dayEvents = [...(combinedByDate[key] || []), ...injectDefaultSundayEvents(key)];
    return (
      <div>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>{d.toDateString()}</div>
        {dayEvents.length === 0 && <div style={{ color: '#9a9a92' }}>Sin actividades</div>}
        {dayEvents.map((ev)=> <div key={ev.id} style={{ marginTop: 6 }}>{ev.time ? `${ev.time} — ` : ''}{ev.title}</div>)}
      </div>
    );
  };

  const renderAnnual = () => {
    const year = cursor.getFullYear();
    const counts = {};
    Object.keys(combinedByDate).forEach((k)=>{ if (k.startsWith(String(year))) { const m = Number(k.split('-')[1]); counts[m] = (counts[m]||0) + (combinedByDate[k]||[]).length; } });
    return (
      <div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{Array.from({length:12}).map((_,i)=> <div key={i} style={{ border: '1px solid #e4e4e0', padding: 10, borderRadius: 8, minWidth:120 }}>{MONTHS[i]}<div style={{ fontSize: 18, fontWeight: 600 }}>{counts[i+1]||0}</div></div>)}</div>
      </div>
    );
  };

  return (
    <div className="container-page" style={{ padding: 24, maxWidth: 800, margin: "0 auto" }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <button onClick={() => setCalendarView('monthly')} style={calendarView==='monthly'?primaryBtn:secondaryBtn}>Mensual</button>
        <button onClick={() => setCalendarView('weekly')} style={calendarView==='weekly'?primaryBtn:secondaryBtn}>Semanal</button>
        <button onClick={() => setCalendarView('daily')} style={calendarView==='daily'?primaryBtn:secondaryBtn}>Diaria</button>
        <button onClick={() => setCalendarView('annual')} style={calendarView==='annual'?primaryBtn:secondaryBtn}>Anual</button>
      </div>
      {calendarView === 'monthly' && renderMonth()}
      {calendarView === 'weekly' && renderWeekly()}
      {calendarView === 'daily' && renderDaily()}
      {calendarView === 'annual' && renderAnnual()}
      {showModal && (
        <DayEventModal date={showModal} events={eventsByDate[showModal] || []} anniversaries={anniversariesByDate[showModal] || []}
          onClose={() => setShowModal(null)} session={session}
          onAdd={(title, time) => setEvents([...events, { id: uid(), title, date: showModal, time, branchId, createdBy: session?.id || null, createdByName: session?.name || "Anónimo" }])}
          onDelete={(id) => setEvents(events.filter((e) => e.id !== id))} />
      )}
    </div>
  );
}

function DayEventModal({ date, events, anniversaries = [], onClose, onAdd, onDelete, session }) {
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("10:00");
  const canManage = (ev) => session?.role === "admin" || (session && ev.createdBy === session.id);
  const canCreate = isActiveSession(session);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: 24, width: 380, maxWidth: "90vw" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ fontWeight: 500 }}>{date}</div>
          <X size={18} style={{ cursor: "pointer" }} onClick={onClose} />
        </div>
        {anniversaries.map((a) => (
          <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 6, border: "1px solid #f1dede", background: "#fdfaf9", borderRadius: 8, padding: 8, marginBottom: 6, fontSize: 13, color: "#8a4040" }}>
            <Cake size={13} /> {a.title}
          </div>
        ))}
        {events.map((ev) => (
          <div key={ev.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid #e4e4e0", borderRadius: 8, padding: 8, marginBottom: 6, fontSize: 13 }}>
            <div>
              <div style={{ fontWeight: 500 }}>{ev.title}</div>
              <div style={{ color: "#767670", fontSize: 11 }}>{ev.time}{ev.createdByName ? ` · agregado por ${ev.createdByName}` : ""}</div>
            </div>
            {canManage(ev) && isActiveSession(session) && <X size={14} style={{ cursor: "pointer", color: "#9a9a92" }} onClick={() => onDelete(ev.id)} />}
          </div>
        ))}
        {canCreate ? (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            <input placeholder="Nombre de la actividad" value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={inputStyle} />
            <button onClick={() => { if (title) { onAdd(title, time); setTitle(""); } }} className="btn-primary" style={primaryBtn}>Agregar actividad</button>
          </div>
        ) : session && (
          <div style={{ marginTop: 12, fontSize: 11, color: "#9a9a92", display: "flex", alignItems: "center", gap: 6 }}>
            <Lock size={12} /> Tu cuenta es de solo lectura.
          </div>
        )}
      </div>
    </div>
  );
}

const ORDINANCE_TYPES = [
  { id: "bautismo", label: "Bautismo", color: "#1f5c3f", bg: "#e2f3e8" },
  { id: "confirmacion", label: "Confirmación", color: "#0c447c", bg: "#e6f1fb" },
  { id: "bendicion", label: "Bendición de niño", color: "#993556", bg: "#fbeaf0" },
  { id: "ordenacion", label: "Ordenación al sacerdocio", color: "#854f0b", bg: "#faeeda" },
];

function OrdinanceModal({ date, items, onClose, onAdd, onDelete, session, members }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("bautismo");
  const canManage = (it) => session?.role === "admin" || (session && it.createdBy === session.id);
  const canCreate = canManageRecords(session, members);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: 24, width: 400, maxWidth: "90vw" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ fontWeight: 500 }}>{date}</div>
          <X size={18} style={{ cursor: "pointer" }} onClick={onClose} />
        </div>
        {items.map((it) => {
          const t = ORDINANCE_TYPES.find((x) => x.id === it.type);
          return (
            <div key={it.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid #e4e4e0", borderRadius: 8, padding: 8, marginBottom: 6 }}>
              <div>
                <span style={{ background: t.bg, color: t.color, fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 999, marginRight: 8 }}>{t.label}</span>
                <span style={{ fontSize: 13 }}>{it.name}</span>
              </div>
              {canManage(it) && isActiveSession(session) && <X size={14} style={{ cursor: "pointer", color: "#9a9a92" }} onClick={() => onDelete(it.id)} />}
            </div>
          );
        })}
        {canCreate ? (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            <select value={type} onChange={(e) => setType(e.target.value)} style={inputStyle}>
              {ORDINANCE_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            <input placeholder="Nombre de la persona" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
            <button onClick={() => { if (name) { onAdd(type, name); setName(""); } }} className="btn-primary" style={primaryBtn}>Agregar</button>
          </div>
        ) : session && (
          <div style={{ marginTop: 12, fontSize: 11, color: "#9a9a92", display: "flex", alignItems: "center", gap: 6 }}>
            <Lock size={12} /> Requiere llamamiento de liderazgo o ser administrador.
          </div>
        )}
      </div>
    </div>
  );
}

function OrdinancesView({ ordinances, setOrdinances, branchId, session, members }) {
  const [cursor, setCursor] = useState(new Date());
  const [showModal, setShowModal] = useState(null);

  const byDate = useMemo(() => {
    const map = {};
    ordinances.forEach((o) => { map[o.date] = map[o.date] || []; map[o.date].push(o); });
    return map;
  }, [ordinances]);

  return (
    <div className="container-page" style={{ padding: 24, maxWidth: 800, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        {ORDINANCE_TYPES.map((t) => (
          <span key={t.id} style={{ background: t.bg, color: t.color, fontSize: 12, fontWeight: 500, padding: "3px 10px", borderRadius: 999 }}>{t.label}</span>
        ))}
      </div>
      <MonthGrid cursor={cursor} setCursor={setCursor} itemsByDate={byDate} onDayClick={setShowModal}
        renderItem={(it) => {
          const t = ORDINANCE_TYPES.find((x) => x.id === it.type);
          return (
            <div style={{ fontSize: 10, background: t.bg, color: t.color, borderRadius: 4, padding: "2px 4px", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {it.name}
            </div>
          );
        }} />
      {showModal && (
        <OrdinanceModal date={showModal} items={byDate[showModal] || []} onClose={() => setShowModal(null)} session={session} members={members}
          onAdd={(type, name) => setOrdinances([...ordinances, { id: uid(), type, name, date: showModal, branchId, createdBy: session?.id || null, createdByName: session?.name || "Anónimo" }])}
          onDelete={(id) => setOrdinances(ordinances.filter((o) => o.id !== id))} />
      )}
    </div>
  );
}

function nextSundays(count = 8) {
  const result = [];
  let d = new Date();
  while (result.length < count) {
    d = new Date(d);
    d.setDate(d.getDate() + 1);
    if (d.getDay() === 0) result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  return result;
}

function SpeakersView({ speakers, setSpeakers, branchId, session }) {
  const sundays = useMemo(() => nextSundays(8), []);
  const SLOTS_PER_SUNDAY = 6;
  const [nameInput, setNameInput] = useState("");
  const [pendingSlot, setPendingSlot] = useState(null);
  const branchSpeakers = speakers.filter((s) => s.branchId === branchId);
  const takenBySlot = (date, idx) => branchSpeakers.find((s) => s.date === date && s.slot === idx);

  return (
    <div className="container-page" style={{ padding: 24, maxWidth: 700, margin: "0 auto" }}>
      <div style={{ fontWeight: 500, fontSize: 16, marginBottom: 4 }}>Agenda de discursos dominicales</div>
      <div style={{ fontSize: 13, color: "#767670", marginBottom: 20 }}>Elige un domingo disponible y reserva tu turno.</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {sundays.map((date) => (
          <div key={date} style={{ border: "1px solid #e4e4e0", borderRadius: 12, padding: 14 }}>
            <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 8 }}>Domingo {date}</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {Array.from({ length: SLOTS_PER_SUNDAY }).map((_, idx) => {
                const taken = takenBySlot(date, idx);
                return (
                  <div key={idx} style={{ flex: "1 1 200px", borderRadius: 8, border: "1px solid " + (taken ? "#e4e4e0" : "#1f5c3f"), padding: 10, background: taken ? "#f7f7f5" : "#fff" }}>
                    <div style={{ fontSize: 11, color: "#9a9a92", marginBottom: 4 }}>Espacio {idx + 1}</div>
                    {taken ? (
                      <div style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}><Check size={14} color="#1f5c3f" /> {taken.name} {taken.status === "pending" && <Badge tone="pending">Pendiente</Badge>}</div>
                    ) : pendingSlot === `${date}-${idx}` ? (
                      <div style={{ display: "flex", gap: 6 }}>
                        <input autoFocus value={nameInput} onChange={(e) => setNameInput(e.target.value)} placeholder="Tu nombre"
                          style={{ flex: 1, padding: "6px 8px", borderRadius: 6, border: "1px solid #e4e4e0", fontSize: 12 }} />
                        <button onClick={() => {
                          if (nameInput.trim() && session) { setSpeakers([...speakers, { id: uid(), date, slot: idx, name: nameInput.trim(), branchId, status: "pending", createdBy: session.id, createdByName: session.name }]); setNameInput(""); setPendingSlot(null); }
                        }} style={{ border: "none", background: "#1f5c3f", color: "#fff", borderRadius: 6, padding: "0 10px", fontSize: 12, cursor: "pointer" }}>OK</button>
                      </div>
                    ) : (
                      <button onClick={() => setPendingSlot(`${date}-${idx}`)} style={{ fontSize: 12, border: "1px dashed #b8c9bc", background: "none", borderRadius: 6, padding: "6px 8px", cursor: "pointer", color: "#1f5c3f", width: "100%" }}>
                        <Clock size={12} style={{ verticalAlign: -2, marginRight: 4 }} /> Reservar
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MembersView({ members, setMembers, branchId, session }) {
  const [roles, setRoles] = useStore(STORAGE_KEYS.ROLES, CHURCH_ROLES);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", role: "Miembro", phone: "", birthDate: "", baptismDate: "" });
  const [linkToMe, setLinkToMe] = useState(false);
  const branchMembers = members.filter((m) => m.branchId === branchId);
  const canAdd = session && session.role === "member";
  const canLinkSelf = session && session.role === "member";

  return (
    <div className="container-page" style={{ padding: 24, maxWidth: 800, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ fontWeight: 500, fontSize: 16 }}>Directorio de miembros</div>
        {canAdd && (
          <button onClick={() => setShowForm(true)} className="btn-primary" style={{ ...primaryBtn, display: "flex", alignItems: "center", gap: 6 }}>
            <Plus size={14} /> Agregar miembro
          </button>
        )}
      </div>
      {!session && (
        <div style={{ fontSize: 12, color: "#767670", marginBottom: 16, display: "flex", gap: 6 }}>
          <AlertCircle size={14} /> Inicia sesión con el código de tu rama para agregar miembros.
        </div>
      )}
      <div className="card-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        {branchMembers.map((m) => (
          <div key={m.id} className="card-item" style={{ border: "1px solid #e4e4e0", borderRadius: 12, padding: 14, display: "flex", gap: 10, alignItems: "center" }}>
            <UserCircle size={32} color="#1f5c3f" />
            <div>
              <div style={{ fontWeight: 500, fontSize: 13 }}>{m.name}</div>
              <div style={{ fontSize: 11, color: "#767670" }}>{m.role}</div>
            </div>
          </div>
        ))}
        {branchMembers.length === 0 && <div style={{ color: "#9a9a92", fontSize: 13 }}>Aún no hay miembros registrados.</div>}
      </div>
      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={() => setShowForm(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: 24, width: 380, maxWidth: "90vw" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ fontWeight: 500 }}>Agregar miembro</div>
              <X size={18} style={{ cursor: "pointer" }} onClick={() => setShowForm(false)} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <input placeholder="Nombre completo" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} />
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} style={inputStyle}>
                {roles.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <div>
                <div style={{ fontSize: 11, color: "#767670", marginBottom: 3 }}>Cumpleaños (opcional)</div>
                <input type="date" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: "#767670", marginBottom: 3 }}>Fecha de bautismo (opcional)</div>
                <input type="date" value={form.baptismDate} onChange={(e) => setForm({ ...form, baptismDate: e.target.value })} style={inputStyle} />
              </div>
              {canLinkSelf && (
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#767670", cursor: "pointer" }}>
                  <input type="checkbox" checked={linkToMe} onChange={(e) => setLinkToMe(e.target.checked)} />
                  Esta ficha soy yo
                </label>
              )}
              <button onClick={() => {
                if (form.name) {
                  setMembers([...members, { id: uid(), ...form, branchId, accountId: linkToMe ? session.id : null }]);
                  setForm({ name: "", role: "Miembro", phone: "", birthDate: "", baptismDate: "" });
                  setLinkToMe(false);
                  setShowForm(false);
                }
              }} className="btn-primary" style={primaryBtn}>Agregar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MissionaryTimeline({ missionary, isOwner, onAddEntry }) {
  const [open, setOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [text, setText] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [photo, setPhoto] = useState(null);
  const fileRef = useRef(null);
  const entries = (missionary.timeline || []).slice().sort((a, b) => b.date.localeCompare(a.date));

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(reader.result);
    reader.readAsDataURL(file);
  };

  const submit = () => {
    if (!text.trim()) return;
    onAddEntry({ id: uid(), date, text: text.trim(), photo, createdAt: new Date().toISOString() });
    setText(""); setPhoto(null); setShowForm(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div style={{ marginTop: 8, borderTop: "1px solid #eef1ee", paddingTop: 8 }}>
      <button onClick={() => setOpen(!open)} style={{ border: "none", background: "none", padding: 0, cursor: "pointer", fontSize: 11, color: "#1f5c3f", display: "flex", alignItems: "center", gap: 4 }}>
        <Clock size={11} /> {open ? "Ocultar" : "Ver"} línea de tiempo ({entries.length})
      </button>
      {open && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
          {entries.length === 0 && <div style={{ fontSize: 11, color: "#9a9a92" }}>Sin entradas todavía.</div>}
          {entries.map((e) => (
            <div key={e.id} style={{ fontSize: 11, borderLeft: "2px solid #e2f3e8", paddingLeft: 8 }}>
              <div style={{ color: "#9a9a92", marginBottom: 2 }}>{e.date}</div>
              {e.photo && <img src={e.photo} alt="" style={{ width: "100%", maxHeight: 130, objectFit: "cover", borderRadius: 6, marginBottom: 4, display: "block" }} />}
              <div style={{ color: "#334033" }}>{e.text}</div>
            </div>
          ))}
          {isOwner && (
            showForm ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, background: "#f7f7f5", padding: 8, borderRadius: 8 }}>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...inputStyle, fontSize: 11 }} />
                <textarea placeholder="Nota del diario de misión" value={text} onChange={(e) => setText(e.target.value)} style={{ ...inputStyle, minHeight: 50, fontSize: 11 }} />
                <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ fontSize: 11 }} />
                {photo && <img src={photo} alt="" style={{ width: 50, height: 50, borderRadius: 6, objectFit: "cover" }} />}
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={submit} style={{ flex: 1, border: "none", background: "#1f5c3f", color: "#fff", borderRadius: 6, padding: "6px 8px", fontSize: 11, cursor: "pointer" }}>Guardar</button>
                  <button onClick={() => setShowForm(false)} style={{ border: "1px solid #e4e4e0", background: "#fff", borderRadius: 6, padding: "6px 8px", fontSize: 11, cursor: "pointer" }}>Cancelar</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowForm(true)} style={{ fontSize: 11, border: "1px dashed #b8c9bc", background: "none", borderRadius: 6, padding: "6px 8px", cursor: "pointer", color: "#1f5c3f" }}>
                <Plus size={11} style={{ verticalAlign: -1, marginRight: 3 }} /> Agregar nota
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

function MissionaryCard({ m, isOwner, isReplaced, onAddEntry }) {
  return (
    <div className="card-item" style={{ border: "1px solid " + (isReplaced ? "#f1dede" : "#e4e4e0"), borderRadius: 14, padding: 14, background: isReplaced ? "#fdfaf9" : "#fff", display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", gap: 12 }}>
        {m.photo ? (
          <img src={m.photo} alt={m.name} style={{ width: 64, height: 64, borderRadius: 12, objectFit: "cover", flexShrink: 0, filter: isReplaced ? "grayscale(60%)" : "none" }} />
        ) : (
          <div style={{ width: 64, height: 64, borderRadius: 12, background: "#eef1ee", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <UserCircle size={30} color="#1f5c3f" />
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 500, fontSize: 14 }}>{m.gender === "Hermana" ? "Hermana" : "Élder"} {m.name}</div>
          <div style={{ fontSize: 11, color: "#767670", marginBottom: 6 }}>
            {m.age ? `${m.age} años · ` : ""}{m.hometown || "Origen no especificado"}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Badge>{monthsSince(m.startDate)} meses en la misión</Badge>
            {isReplaced && <Badge tone="muted"><Lock size={9} style={{ verticalAlign: -1, marginRight: 3 }} />Reemplazado</Badge>}
          </div>
          {m.description && <div style={{ fontSize: 12, color: "#334033", marginTop: 6 }}>{m.description}</div>}
        </div>
      </div>
      <MissionaryTimeline missionary={m} isOwner={isOwner} onAddEntry={onAddEntry} />
    </div>
  );
}

function CompanionshipHeader({ companionship, canEdit, onSave }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(companionship.baptisms || 0);

  const save = () => {
    onSave(Number(value) || 0);
    setEditing(false);
  };

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 500, color: "#1f5c3f", display: "flex", alignItems: "center", gap: 6 }}>
        <Compass size={13} /> {companionship.name}
        {companionship.sectors && <span style={{ color: "#767670", fontWeight: 400 }}>— {companionship.sectors}</span>}
      </div>
      {editing ? (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input type="number" value={value} onChange={(e) => setValue(e.target.value)} style={{ ...inputStyle, width: 70, padding: "4px 6px", fontSize: 12 }} />
          <button onClick={save} style={{ border: "none", background: "#1f5c3f", color: "#fff", borderRadius: 6, padding: "4px 8px", fontSize: 11, cursor: "pointer" }}>Guardar</button>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Badge tone="approved">{companionship.baptisms || 0} bautismos</Badge>
          {canEdit && <Pencil size={12} color="#767670" style={{ cursor: "pointer" }} onClick={() => setEditing(true)} />}
        </div>
      )}
    </div>
  );
}

function MissionaryProfileModal({ initial, branchId, accountId, companionships, onClose, onSave }) {
  const [form, setForm] = useState(initial || {
    name: "", gender: "Élder", age: "", hometown: "", startDate: "", description: "", photo: null,
  });
  const [companionshipChoice, setCompanionshipChoice] = useState(initial?.companionshipId || (companionships[0]?.id || "__new__"));
  const [newCompName, setNewCompName] = useState("");
  const [newCompSectors, setNewCompSectors] = useState("");
  const fileRef = useRef(null);

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, photo: reader.result }));
    reader.readAsDataURL(file);
  };

  const submit = () => {
    if (!form.name) return;
    let companionshipId = companionshipChoice;
    let newCompanionship = null;
    if (companionshipChoice === "__new__") {
      if (!newCompName.trim()) return;
      newCompanionship = { id: uid(), branchId, name: newCompName.trim(), sectors: newCompSectors.trim(), baptisms: 0, createdAt: new Date().toISOString() };
      companionshipId = newCompanionship.id;
    }
    const missionary = {
      ...form, id: initial?.id || uid(), branchId, accountId, companionshipId,
      age: form.age === "" ? "" : Number(form.age) || "",
      timeline: initial?.timeline || [],
    };
    onSave(missionary, newCompanionship);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: 24, width: 440, maxWidth: "90vw" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ fontWeight: 500 }}>{initial ? "Editar mi perfil de misionero" : "Crear mi perfil de misionero"}</div>
          <X size={18} style={{ cursor: "pointer" }} onClick={onClose} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <input placeholder="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} />
          <div style={{ display: "flex", gap: 8 }}>
            <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} style={{ ...inputStyle, flex: 1 }}>
              <option value="Élder">Élder (hombre)</option>
              <option value="Hermana">Hermana (mujer)</option>
            </select>
            <input type="number" placeholder="Edad" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} style={{ ...inputStyle, width: 90 }} />
          </div>
          <input placeholder="Ciudad / país de origen" value={form.hometown} onChange={(e) => setForm({ ...form, hometown: e.target.value })} style={inputStyle} />
          <div>
            <div style={{ fontSize: 11, color: "#767670", marginBottom: 3 }}>Fecha en que inició su misión</div>
            <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} style={inputStyle} />
          </div>
          <textarea placeholder="Descripción breve" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} style={{ ...inputStyle, minHeight: 70, resize: "vertical" }} />
          <div>
            <div style={{ fontSize: 11, color: "#767670", marginBottom: 3 }}>Foto</div>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ fontSize: 12 }} />
            {form.photo && <img src={form.photo} alt="preview" style={{ width: 60, height: 60, borderRadius: 10, objectFit: "cover", marginTop: 6 }} />}
          </div>
          <select value={companionshipChoice} onChange={(e) => setCompanionshipChoice(e.target.value)} style={inputStyle}>
            {companionships.map((c) => <option key={c.id} value={c.id}>{c.name}{c.sectors ? ` — ${c.sectors}` : ""}</option>)}
            <option value="__new__">+ Crear nuevo compañerismo</option>
          </select>
          {companionshipChoice === "__new__" && (
            <>
              <input placeholder="Nombre del compañerismo" value={newCompName} onChange={(e) => setNewCompName(e.target.value)} style={inputStyle} />
              <input placeholder="Sectores que cubren" value={newCompSectors} onChange={(e) => setNewCompSectors(e.target.value)} style={inputStyle} />
            </>
          )}
          <button onClick={submit} className="btn-primary" style={{ ...primaryBtn, marginTop: 6 }}>Guardar perfil</button>
        </div>
      </div>
    </div>
  );
}

function MissionariesView({ missionaries, setMissionaries, companionships, setCompanionships, session, primaryBranchId }) {
  const [showModal, setShowModal] = useState(false);
  const branchMissionaries = missionaries.filter((m) => m.branchId === primaryBranchId);
  const branchCompanionships = companionships.filter((c) => c.branchId === primaryBranchId);
  const myProfile = session ? branchMissionaries.find((m) => m.accountId === session.id) : null;
  const isMissionary = session && session.role === "missionary" && session.branchId === primaryBranchId;
  const canEditProfile = isMissionary && isActiveSession(session);

  const grouped = useMemo(() => {
    const map = {};
    branchMissionaries.forEach((m) => {
      const key = m.companionshipId || "none";
      map[key] = map[key] || [];
      map[key].push(m);
    });
    return map;
  }, [branchMissionaries]);

  const saveMissionary = (missionary, newCompanionship) => {
    if (newCompanionship) setCompanionships([...companionships, newCompanionship]);
    const exists = missionaries.find((m) => m.id === missionary.id);
    setMissionaries(exists ? missionaries.map((m) => (m.id === missionary.id ? missionary : m)) : [...missionaries, missionary]);
    setShowModal(false);
  };

  const addTimelineEntry = (missionaryId, entry) => {
    setMissionaries(missionaries.map((m) => (m.id === missionaryId ? { ...m, timeline: [...(m.timeline || []), entry] } : m)));
  };

  const saveBaptisms = (companionshipId, baptisms) => {
    setCompanionships(companionships.map((c) => (c.id === companionshipId ? { ...c, baptisms } : c)));
  };

  return (
    <div className="container-page" style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontWeight: 500, fontSize: 16 }}>Misioneros de la rama</div>
        {isMissionary && canEditProfile && (
          <button onClick={() => setShowModal(true)} className="btn-primary" style={{ ...primaryBtn, display: "flex", alignItems: "center", gap: 6 }}>
            <Pencil size={13} /> {myProfile ? "Editar mi perfil" : "Crear mi perfil"}
          </button>
        )}
      </div>
      {!session && (
        <div style={{ fontSize: 12, color: "#767670", marginBottom: 16, display: "flex", gap: 6 }}>
          <AlertCircle size={14} /> Los misioneros inician sesión con su código especial para crear su perfil.
        </div>
      )}
      {isMissionary && !isActiveSession(session) && (
        <div style={{ fontSize: 12, color: "#8a4040", marginBottom: 16, display: "flex", gap: 6, alignItems: "flex-start", background: "#fbeaea", border: "1px solid #f1dede", borderRadius: 10, padding: 10 }}>
          <Lock size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          Tu servicio en esta rama fue marcado como finalizado. Puedes ver todo, pero no editar.
        </div>
      )}
      {Object.keys(grouped).length === 0 && <div style={{ color: "#9a9a92", fontSize: 13 }}>Aún no hay misioneros registrados.</div>}
      {Object.entries(grouped).map(([companionshipId, group]) => {
        const companionship = branchCompanionships.find((c) => c.id === companionshipId);
        const canEditBaptisms = canEditProfile && group.some((m) => m.accountId === session.id);
        return (
          <div key={companionshipId} style={{ marginBottom: 22 }}>
            {companionship ? (
              <CompanionshipHeader companionship={companionship} canEdit={canEditBaptisms} onSave={(v) => saveBaptisms(companionship.id, v)} />
            ) : (
              <div style={{ fontSize: 12, fontWeight: 500, color: "#1f5c3f", marginBottom: 8 }}>Sin compañerismo asignado</div>
            )}
            <div className="card-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
              {group.map((m) => (
                <MissionaryCard key={m.id} m={m} isOwner={session && session.id === m.accountId && isActiveSession(session)}
                  isReplaced={m.accountActive === false} onAddEntry={(entry) => addTimelineEntry(m.id, entry)} />
              ))}
            </div>
          </div>
        );
      })}
      {showModal && (
        <MissionaryProfileModal initial={myProfile} branchId={primaryBranchId} accountId={session.id} companionships={branchCompanionships}
          onClose={() => setShowModal(false)} onSave={saveMissionary} />
      )}
    </div>
  );
}

function PhotosView({ photos, setPhotos, branchId, session }) {
  const [caption, setCaption] = useState("");
  const [preview, setPreview] = useState(null);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const fileRef = useRef(null);
  const approved = photos.filter((p) => p.branchId === branchId && p.status === "approved");

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const maxDimension = 1800;
        const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
        setPreview(canvas.toDataURL("image/jpeg", 0.88));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  const submit = () => {
    if (!preview) return;
    setPhotos([...photos, { id: uid(), branchId, dataUrl: preview, caption, status: "pending", author: session.name, createdAt: new Date().toISOString() }]);
    setPreview(null);
    setCaption("");
    if (fileRef.current) fileRef.current.value = "";
  };

  if (!session) {
    return (
      <div className="container-page" style={{ padding: 40, maxWidth: 500, margin: "0 auto", textAlign: "center" }}>
        <ImageIcon size={28} color="#1f5c3f" style={{ marginBottom: 10 }} />
        <div style={{ fontWeight: 500, marginBottom: 6 }}>Galería de fotos</div>
        <div style={{ fontSize: 13, color: "#767670" }}>Inicia sesión para subir y ver fotos.</div>
      </div>
    );
  }

  return (
    <div className="container-page" style={{ padding: 24, maxWidth: 800, margin: "0 auto" }}>
      <div style={{ fontWeight: 500, fontSize: 16, marginBottom: 16 }}>Galería de fotos — {approved.length} publicadas</div>

      {isActiveSession(session) ? (
        <div style={{ border: "1px dashed #b8c9bc", borderRadius: 12, padding: 16, marginBottom: 20 }}>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ fontSize: 12, marginBottom: 10 }} />
          {preview && <img src={preview} alt="preview" style={{ maxWidth: "100%", maxHeight: 200, borderRadius: 8, display: "block", marginBottom: 10 }} />}
          <input placeholder="Descripción (opcional)" value={caption} onChange={(e) => setCaption(e.target.value)} style={{ ...inputStyle, marginBottom: 10 }} />
          <button onClick={submit} disabled={!preview} className="btn-primary" style={{ ...primaryBtn, display: "flex", alignItems: "center", gap: 6, opacity: preview ? 1 : 0.5 }}>
            <Upload size={14} /> Enviar para aprobación
          </button>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: "#9a9a92", marginBottom: 16, display: "flex", gap: 6 }}>
          <Lock size={14} /> Tu cuenta es de solo lectura.
        </div>
      )}

      <div className="card-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        {approved.map((p) => (
          <div key={p.id} style={{ border: "1px solid #e4e4e0", borderRadius: 12, overflow: "hidden" }}>
            <img src={p.dataUrl} alt={p.caption} onClick={() => setSelectedPhoto(p)} style={{ width: "100%", height: 220, objectFit: "contain", background: "#f4f4f1", display: "block", cursor: "zoom-in" }} />
            <div style={{ padding: 8 }}>
              {p.caption && <div style={{ fontSize: 12 }}>{p.caption}</div>}
              <div style={{ fontSize: 10, color: "#9a9a92" }}>{p.author} · {new Date(p.createdAt).toLocaleString()}</div>
            </div>
          </div>
        ))}
        {approved.length === 0 && <div style={{ color: "#9a9a92", fontSize: 13 }}>Aún no hay fotos publicadas.</div>}
      </div>
      {selectedPhoto && (
        <div onClick={() => setSelectedPhoto(null)} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.82)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, cursor: "zoom-out" }}>
          <img src={selectedPhoto.dataUrl} alt={selectedPhoto.caption} style={{ maxWidth: "96vw", maxHeight: "92vh", objectFit: "contain" }} />
        </div>
      )}
    </div>
  );
}

function ChatView({ messages, setMessages, branchId, session }) {
  const [text, setText] = useState("");
  const branchMessages = messages.filter((m) => m.branchId === branchId);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [branchMessages.length]);

  if (!session) {
    return (
      <div className="container-page" style={{ padding: 40, maxWidth: 500, margin: "0 auto", textAlign: "center" }}>
        <MessageCircle size={28} color="#1f5c3f" style={{ marginBottom: 10 }} />
        <div style={{ fontWeight: 500, marginBottom: 6 }}>Chat de rama</div>
        <div style={{ fontSize: 13, color: "#767670" }}>Inicia sesión para participar en el chat.</div>
      </div>
    );
  }

  const send = () => {
    if (!text.trim() || !isActiveSession(session)) return;
    setMessages([...messages, { id: uid(), branchId, author: session.name, text: text.trim(), createdAt: new Date().toISOString() }]);
    setText("");
  };

  return (
    <div className="container-page" style={{ padding: 24, maxWidth: 600, margin: "0 auto" }}>
      <div style={{ border: "1px solid #e4e4e0", borderRadius: 12, height: 360, display: "flex", flexDirection: "column" }}>
        <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          {branchMessages.map((m) => (
            <div key={m.id} style={{ maxWidth: "80%", alignSelf: m.author === session.name ? "flex-end" : "flex-start" }}>
              <div style={{ fontSize: 10, color: "#9a9a92", marginBottom: 2 }}>{m.author}</div>
              <div style={{
                background: m.author === session.name ? "#1f5c3f" : "#eef1ee",
                color: m.author === session.name ? "#fff" : "#334033",
                padding: "8px 12px", borderRadius: 12, fontSize: 13,
              }}>{m.text}</div>
            </div>
          ))}
          {branchMessages.length === 0 && <div style={{ color: "#9a9a92", fontSize: 13, textAlign: "center", marginTop: 20 }}>Sé el primero en escribir.</div>}
          <div ref={endRef} />
        </div>
        <div style={{ display: "flex", gap: 8, padding: 10, borderTop: "1px solid #e4e4e0" }}>
          {isActiveSession(session) ? (
            <>
              <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder="Escribe un mensaje..." style={{ ...inputStyle, flex: 1 }} />
              <button onClick={send} className="btn-primary" style={{ ...primaryBtn, display: "flex", alignItems: "center", justifyContent: "center", width: 40, padding: 0 }}>
                <Send size={15} />
              </button>
            </>
          ) : (
            <div style={{ fontSize: 11, color: "#9a9a92", display: "flex", alignItems: "center", gap: 6, padding: "6px 4px" }}>
              <Lock size={12} /> Solo lectura.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- Panel de invitaciones, respaldado por el servidor central ---------- */
function FederationCodesCard({ myBranch, branchApiKey }) {
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copiedCode, setCopiedCode] = useState(null);

  const refresh = async () => {
    if (!branchApiKey) return;
    try {
      const data = await listInviteCodesCentral(branchApiKey);
      setCodes(data.codes || []);
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => { refresh(); }, [branchApiKey]);

  const generate = async () => {
    setLoading(true);
    setError("");
    try {
      await createInviteCodeCentral(branchApiKey);
      await refresh();
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  const copy = (code) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 1500);
  };

  const isExpired = (c) => c.expires_at && new Date(c.expires_at) < new Date();

  return (
    <div style={{ border: "1px solid #e4e4e0", borderRadius: 12, padding: 14, marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 2, display: "flex", alignItems: "center", gap: 6 }}>
            <Network size={14} color="#1f5c3f" /> Invitar a otra rama
          </div>
          <div style={{ fontSize: 11, color: "#767670" }}>El código lo emite y valida el servidor central. Vence a los 30 días.</div>
        </div>
        <button onClick={generate} disabled={loading || !branchApiKey} className="btn-primary" style={{ ...primaryBtn, display: "flex", alignItems: "center", gap: 6, opacity: branchApiKey ? 1 : 0.5 }}>
          <Plus size={14} /> {loading ? "Generando..." : "Generar código"}
        </button>
      </div>
      {!branchApiKey && (
        <div style={{ fontSize: 11, color: "#8a5a10", marginTop: 10, display: "flex", gap: 6 }}>
          <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} /> Tu rama aún no tiene API key del servidor central.
        </div>
      )}
      {error && <div style={{ fontSize: 11, color: "#a33", marginTop: 8 }}>{error}</div>}
      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
        {codes.length === 0 && <div style={{ fontSize: 12, color: "#9a9a92" }}>Aún no has generado códigos.</div>}
        {codes.map((c) => (
          <div key={c.code} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid #e4e4e0", borderRadius: 8, padding: "8px 10px", flexWrap: "wrap", gap: 8 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, letterSpacing: 0.5 }}>{c.code}</div>
              {c.expires_at && <div style={{ fontSize: 10, color: isExpired(c) ? "#a33" : "#9a9a92" }}>Vence: {new Date(c.expires_at).toLocaleDateString()}</div>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Badge tone={c.used_by_branch_id ? "neutral" : isExpired(c) ? "muted" : "approved"}>{c.used_by_branch_id ? "usado" : isExpired(c) ? "vencido" : "disponible"}</Badge>
              {!c.used_by_branch_id && !isExpired(c) && (
                <button onClick={() => copy(c.code)} className="btn-secondary" style={{ ...secondaryBtn, padding: "5px 8px", display: "flex", alignItems: "center", gap: 4 }}>
                  <Copy size={12} /> {copiedCode === c.code ? "Copiado" : "Copiar"}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ServerConfigCard({ myBranch, branches, setBranches }) {
  const [value, setValue] = useState(myBranch.serverBranchId || "");
  const [saved, setSaved] = useState(false);
  const others = branches.filter((b) => b.status === "approved" && b.id !== myBranch.id);

  const save = () => {
    setBranches(branches.map((b) => (b.id === myBranch.id ? { ...b, serverBranchId: value || null } : b)));
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div style={{ border: "1px solid #e4e4e0", borderRadius: 12, padding: 14, marginBottom: 20 }}>
      <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 2, display: "flex", alignItems: "center", gap: 6 }}>
        <Server size={14} color="#1f5c3f" /> Servidor de tu rama
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        <select value={value} onChange={(e) => setValue(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 200 }}>
          <option value="">Servidor propio de mi rama</option>
          {others.map((b) => <option key={b.id} value={b.id}>Usar el servidor de: {b.name}</option>)}
        </select>
        <button onClick={save} className="btn-secondary" style={secondaryBtn}>{saved ? "Guardado" : "Guardar"}</button>
      </div>
    </div>
  );
}

function SiteConfigCard({ myBranch, branches, setBranches }) {
  const [value, setValue] = useState(myBranch.siteUrl || "");
  const [saved, setSaved] = useState(false);

  const save = () => {
    setBranches(branches.map((b) => (b.id === myBranch.id ? { ...b, siteUrl: value.trim() } : b)));
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div style={{ border: "1px solid #e4e4e0", borderRadius: 12, padding: 14, marginBottom: 20 }}>
      <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 2, display: "flex", alignItems: "center", gap: 6 }}>
        <Globe size={14} color="#1f5c3f" /> Dominio propio de tu rama
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="https://mi-rama.ejemplo.org" style={{ ...inputStyle, flex: 1, minWidth: 200 }} />
        <button onClick={save} className="btn-secondary" style={secondaryBtn}>{saved ? "Guardado" : "Guardar"}</button>
      </div>
      {myBranch.siteUrl && (
        <div style={{ marginTop: 8, fontSize: 11 }}>
          <a href={myBranch.siteUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#1f5c3f", display: "inline-flex", alignItems: "center", gap: 4 }}>
            Visitar sitio <ExternalLink size={11} />
          </a>
        </div>
      )}
    </div>
  );
}

function ExportDataCard({ myBranch, allData }) {
  const download = () => {
    const payload = {};
    Object.entries(allData).forEach(([key, list]) => {
      payload[key] = list.filter((item) => item.branchId === myBranch.id || item.id === myBranch.id);
    });
    payload.branch = myBranch;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${myBranch.name.replace(/\s+/g, "-").toLowerCase()}-datos.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ border: "1px solid #e4e4e0", borderRadius: 12, padding: 14, marginBottom: 20 }}>
      <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 2, display: "flex", alignItems: "center", gap: 6 }}>
        <Download size={14} color="#1f5c3f" /> Exportar los datos de tu rama
      </div>
      <div style={{ marginTop: 10 }}>
        <button onClick={download} className="btn-secondary" style={{ ...secondaryBtn, display: "flex", alignItems: "center", gap: 6 }}>
          <Download size={13} /> Descargar mis datos (.json)
        </button>
      </div>
    </div>
  );
}

function TransferMissionaryModal({ missionary, branches, onClose, onConfirm }) {
  const [target, setTarget] = useState(branches[0]?.id || "");
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: 24, width: 380, maxWidth: "90vw" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ fontWeight: 500 }}>Transferir a {missionary.name}</div>
          <X size={18} style={{ cursor: "pointer" }} onClick={onClose} />
        </div>
        <div style={{ fontSize: 12, color: "#767670", marginBottom: 10 }}>
          Su tiempo en esta rama quedará guardado como historial de servicio.
        </div>
        <select value={target} onChange={(e) => setTarget(e.target.value)} style={inputStyle}>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <button onClick={() => target && onConfirm(target)} className="btn-primary" style={{ ...primaryBtn, marginTop: 10 }}>Confirmar transferencia</button>
      </div>
    </div>
  );
}

/* ---------- Registro de rama nueva: verificado contra el servidor central ---------- */
function CentralRegisterCard({ onSubmit, otherBranches }) {
  const [showForm, setShowForm] = useState(false);
  const [status, setStatus] = useState("idle"); // idle | working | error
  const [error, setError] = useState("");
  const [issuedKey, setIssuedKey] = useState(null);

  const handleSubmit = async (formData) => {
    setStatus("working");
    setError("");
    try {
      const result = await registerBranchCentral({
        name: formData.name,
        location: formData.location,
        district: formData.district,
        lat: formData.lat,
        lng: formData.lng,
        inviteCode: formData.inviteCode,
      });
      setIssuedKey({ apiKey: result.apiKey, branchId: result.branchId });
      onSubmit(formData, result);
      setShowForm(false);
      setStatus("idle");
    } catch (e) {
      setError(e.message);
      setStatus("error");
    }
  };

  return (
    <div className="container-page" style={{ padding: 40, maxWidth: 480, margin: "0 auto", textAlign: "center" }}>
      <Shield size={28} color="#1f5c3f" style={{ marginBottom: 10 }} />
      <div style={{ fontWeight: 500, marginBottom: 6 }}>Registrar rama en la red</div>
      <div style={{ fontSize: 13, color: "#767670", marginBottom: 16 }}>
        El servidor central valida tu código de invitación y emite la API key de tu rama. Un administrador de la red revisa y aprueba manualmente.
      </div>
      <button onClick={() => setShowForm(true)} className="btn-primary" style={primaryBtn}>Registrar mi rama</button>
      {status === "error" && (
        <div style={{ fontSize: 12, color: "#a33", marginTop: 12, display: "flex", gap: 6, justifyContent: "center" }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}
      {issuedKey && (
        <div style={{ border: "1px solid #e4e4e0", borderRadius: 12, padding: 14, marginTop: 16, textAlign: "left" }}>
          <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
            <Key size={13} color="#1f5c3f" /> Guarda esta API key ahora
          </div>
          <div style={{ fontSize: 11, color: "#767670", marginBottom: 8 }}>No se volverá a mostrar. Sin ella no podrás administrar tu rama.</div>
          <code style={{ display: "block", background: "#f7f7f5", borderRadius: 8, padding: 10, fontSize: 12, wordBreak: "break-all" }}>{issuedKey.apiKey}</code>
        </div>
      )}
      {showForm && (
        <RequestBranchModal otherBranches={otherBranches} onClose={() => setShowForm(false)} onSubmit={handleSubmit} />
      )}
    </div>
  );
}

function AdminView({ branches, setBranches, speakers, photos, setPhotos, missionaries, setMissionaries, accounts, setAccounts, session, events, ordinances, members, companionships, messages, setMessages, branchCredentials, setBranchCredentials }) {
  const [copiedCode, setCopiedCode] = useState(null);
  const [transferTarget, setTransferTarget] = useState(null);
  const [verification, setVerification] = useState({ status: "idle", message: "" });
  const myBranch = branches.find((b) => b.adminId === session.id);
  const myCredential = myBranch ? branchCredentials.find((c) => c.branchId === myBranch.id) : null;
  const branchPhotos = myBranch ? photos.filter((p) => p.branchId === myBranch.id) : [];
  const branchMessages = myBranch ? messages.filter((m) => m.branchId === myBranch.id) : [];
  const branchSpeakers = myBranch ? speakers.filter((s) => s.branchId === myBranch.id) : [];
  const branchMissionaries = myBranch ? missionaries.filter((m) => m.branchId === myBranch.id) : [];
  const parentBranch = myBranch?.parentBranchId ? branches.find((b) => b.id === myBranch.parentBranchId) : null;
  const otherApprovedBranches = branches.filter((b) => b.status === "approved" && b.id !== myBranch?.id);

  const copy = (label, value) => {
    navigator.clipboard.writeText(value);
    setCopiedCode(label);
    setTimeout(() => setCopiedCode(null), 1500);
  };

  const regenerateVisitorCode = () => {
    setBranches(branches.map((b) => (b.id === myBranch.id ? {
      ...b, visitorCode: genVisitorCode(b.name), visitorCodeExpiresAt: addMonths(new Date(), 3).toISOString(),
    } : b)));
  };

  const toggleMissionaryActive = (m) => {
    const account = accounts.find((a) => a.id === m.accountId);
    if (!account) return;
    setAccounts(accounts.map((a) => (a.id === account.id ? { ...a, active: a.active === false ? true : false } : a)));
  };

  const runVerification = async () => {
    if (!myCredential) return;
    setVerification({ status: "working", message: "" });
    try {
      const result = await verifyBranchCentral(myCredential.apiKey);
      setBranches(branches.map((b) => (b.id === myBranch.id ? { ...b, status: result.approved ? "approved" : "pending", verification: result.approved ? "verified" : "pending" } : b)));
      setVerification({ status: "done", message: result.approved ? "Tu rama está verificada y aprobada." : "Tu rama sigue pendiente de aprobación por el administrador de la red." });
    } catch (e) {
      setVerification({ status: "error", message: e.message });
    }
  };

  const transferMissionary = (missionary, targetBranchId) => {
    const targetBranch = branches.find((b) => b.id === targetBranchId);
    if (!targetBranch) return;
    const today = new Date().toISOString().slice(0, 10);
    const historyEntry = {
      branchId: missionary.branchId, branchName: myBranch.name,
      from: missionary.branchServiceStart || missionary.startDate || missionary.createdAt?.slice(0, 10) || null,
      to: today,
    };
    setMissionaries(missionaries.map((m) => (m.id === missionary.id ? {
      ...m, branchId: targetBranchId, branchServiceStart: today,
      companionshipId: null,
      serviceHistory: [...(m.serviceHistory || []), historyEntry],
    } : m)));
    setTransferTarget(null);
  };

  const handleRegisterSubmit = (formData, centralResult) => {
    const newBranch = {
      id: centralResult.branchId, ...formData, status: "pending", verification: "pending",
      adminId: session.id,
      parentBranchId: session.invitedByBranchId || null,
      serverBranchId: formData.serverBranchId || null,
      inviteCode: genInviteCode(formData.name),
      missionaryCode: genMissionaryCode(formData.name),
      visitorCode: genVisitorCode(formData.name),
      visitorCodeExpiresAt: addMonths(new Date(), 3).toISOString(),
      createdAt: new Date().toISOString(),
    };
    setBranches([...branches, newBranch]);
    setBranchCredentials([...branchCredentials, { branchId: centralResult.branchId, apiKey: centralResult.apiKey }]);
  };

  if (!myBranch) {
    return <CentralRegisterCard onSubmit={handleRegisterSubmit} otherBranches={branches.filter((b) => b.status === "approved")} />;
  }

  if (myBranch.status !== "approved") {
    return (
      <div className="container-page" style={{ padding: 40, maxWidth: 480, margin: "0 auto", textAlign: "center" }}>
        <ShieldCheck size={28} color="#1f5c3f" style={{ marginBottom: 10 }} />
        <div style={{ fontWeight: 500, marginBottom: 6 }}>{myBranch.name} está pendiente de verificación</div>
        <div style={{ fontSize: 13, color: "#767670", marginBottom: 16 }}>
          Tu rama no aparece todavía en el directorio público. El servidor central debe aprobarla.
        </div>
        <button onClick={runVerification} disabled={verification.status === "working"} className="btn-primary" style={primaryBtn}>
          {verification.status === "working" ? "Consultando..." : "Verificar estado ahora"}
        </button>
        {verification.message && (
          <div style={{ fontSize: 12, color: verification.status === "error" ? "#a33" : "#334033", marginTop: 12 }}>{verification.message}</div>
        )}
      </div>
    );
  }

  const visitorExpired = myBranch.visitorCodeExpiresAt && new Date(myBranch.visitorCodeExpiresAt) < new Date();

  return (
    <div className="container-page" style={{ padding: 24, maxWidth: 800, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <div style={{ fontWeight: 500, fontSize: 16 }}>Panel de administración — {myBranch.name}</div>
        {myBranch.verification === "verified" && <ShieldCheck size={16} color="#1f5c3f" />}
      </div>
      <div style={{ fontSize: 12, color: "#767670", marginBottom: 16 }}>
        {parentBranch ? `Invitada por ${parentBranch.name}.` : "Rama fundadora de la red."}
      </div>

      <div className="code-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginBottom: 20 }}>
        <div style={{ border: "1px solid #e4e4e0", borderRadius: 12, padding: 14 }}>
          <div style={{ fontSize: 11, color: "#767670", marginBottom: 4 }}>Código de miembros</div>
          <div style={{ fontWeight: 500, fontSize: 15, marginBottom: 8, wordBreak: "break-all" }}>{myBranch.inviteCode}</div>
          <button onClick={() => copy("member", myBranch.inviteCode)} className="btn-secondary" style={{ ...secondaryBtn, display: "flex", alignItems: "center", gap: 5, fontSize: 11, padding: "5px 8px" }}>
            <Copy size={12} /> {copiedCode === "member" ? "Copiado" : "Copiar"}
          </button>
        </div>
        <div style={{ border: "1px solid #e4e4e0", borderRadius: 12, padding: 14 }}>
          <div style={{ fontSize: 11, color: "#767670", marginBottom: 4 }}>Código de misioneros</div>
          <div style={{ fontWeight: 500, fontSize: 15, marginBottom: 8, wordBreak: "break-all" }}>{myBranch.missionaryCode}</div>
          <button onClick={() => copy("missionary", myBranch.missionaryCode)} className="btn-secondary" style={{ ...secondaryBtn, display: "flex", alignItems: "center", gap: 5, fontSize: 11, padding: "5px 8px" }}>
            <Copy size={12} /> {copiedCode === "missionary" ? "Copiado" : "Copiar"}
          </button>
        </div>
        <div style={{ border: "1px solid #e4e4e0", borderRadius: 12, padding: 14 }}>
          <div style={{ fontSize: 11, color: "#767670", marginBottom: 4 }}>Código de visitantes (3 meses)</div>
          <div style={{ fontWeight: 500, fontSize: 15, marginBottom: 4, wordBreak: "break-all" }}>{myBranch.visitorCode}</div>
          <div style={{ fontSize: 10, color: visitorExpired ? "#a33" : "#9a9a92", marginBottom: 8 }}>
            {visitorExpired ? "Vencido" : `Vence: ${new Date(myBranch.visitorCodeExpiresAt).toLocaleDateString()}`}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button onClick={() => copy("visitor", myBranch.visitorCode)} className="btn-secondary" style={{ ...secondaryBtn, display: "flex", alignItems: "center", gap: 5, fontSize: 11, padding: "5px 8px" }}>
              <Copy size={12} /> {copiedCode === "visitor" ? "Copiado" : "Copiar"}
            </button>
            <button onClick={regenerateVisitorCode} className="btn-secondary" style={{ ...secondaryBtn, fontSize: 11, padding: "5px 8px" }}>Regenerar</button>
          </div>
        </div>
      </div>

      <FederationCodesCard myBranch={myBranch} branchApiKey={myCredential?.apiKey} />
      <ServerConfigCard key={myBranch.id} myBranch={myBranch} branches={branches} setBranches={setBranches} />
      <SiteConfigCard key={`site-${myBranch.id}`} myBranch={myBranch} branches={branches} setBranches={setBranches} />
      <ExportDataCard myBranch={myBranch} allData={{ events, ordinances, members, missionaries, companionships, photos: photos.filter((p) => p.status === "approved"), messages, branches }} />

      <div style={{ fontWeight: 500, fontSize: 14, margin: "20px 0 8px" }}>Misioneros de tu rama ({branchMissionaries.length})</div>
      {branchMissionaries.length === 0 && <div style={{ fontSize: 13, color: "#9a9a92", marginBottom: 20 }}>Aún no hay misioneros con perfil creado.</div>}
      <div className="card-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10, marginBottom: 20 }}>
        {branchMissionaries.map((m) => {
          const account = accounts.find((a) => a.id === m.accountId);
          const active = !account || account.active !== false;
          return (
            <div key={m.id} style={{ border: "1px solid #e4e4e0", borderRadius: 10, padding: 10, fontSize: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {m.photo ? <img src={m.photo} alt={m.name} style={{ width: 36, height: 36, borderRadius: 8, objectFit: "cover" }} /> : <UserCircle size={28} color="#1f5c3f" />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500 }}>{m.gender} {m.name}</div>
                  <div style={{ color: "#767670", fontSize: 11, marginBottom: 4 }}>{monthsSince(m.startDate)} meses en la misión</div>
                  <Badge tone={active ? "approved" : "muted"}>{active ? "Sirviendo" : "Reemplazado"}</Badge>
                </div>
              </div>
              {(m.serviceHistory || []).length > 0 && (
                <div style={{ fontSize: 10, color: "#9a9a92", borderTop: "1px solid #eef1ee", paddingTop: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 3 }}><History size={10} /> Historial de transferencias</div>
                  {m.serviceHistory.map((h, i) => <div key={i}>Sirvió en {h.branchName} {h.from ? `de ${h.from} ` : ""}a {h.to}</div>)}
                </div>
              )}
              {account && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button onClick={() => toggleMissionaryActive(m)} className="btn-secondary" style={{ ...secondaryBtn, fontSize: 10, padding: "5px 7px", whiteSpace: "nowrap" }}>
                    {active ? "Marcar reemplazado" : "Reactivar"}
                  </button>
                  {otherApprovedBranches.length > 0 && (
                    <button onClick={() => setTransferTarget(m)} className="btn-secondary" style={{ ...secondaryBtn, fontSize: 10, padding: "5px 7px", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 4 }}>
                      <ArrowRightLeft size={10} /> Transferir
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {transferTarget && (
        <TransferMissionaryModal missionary={transferTarget} branches={otherApprovedBranches}
          onClose={() => setTransferTarget(null)} onConfirm={(targetId) => transferMissionary(transferTarget, targetId)} />
      )}

      <div style={{ fontWeight: 500, fontSize: 14, margin: "24px 0 8px" }}>Fotos de la rama ({branchPhotos.length})</div>
      {branchPhotos.length === 0 && <div style={{ fontSize: 13, color: "#9a9a92", marginBottom: 20 }}>No hay fotos.</div>}
      <div className="card-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 20 }}>
        {branchPhotos.map((p) => (
          <div key={p.id} style={{ border: "1px solid #e4e4e0", borderRadius: 10, overflow: "hidden" }}>
            <img src={p.dataUrl} alt={p.caption} style={{ width: "100%", height: 180, objectFit: "contain", background: "#f4f4f1", display: "block" }} />
            <div style={{ padding: 6, fontSize: 11 }}>
              <div style={{ color: "#767670", marginBottom: 4 }}>{p.author}</div>
              <div style={{ display: "flex", gap: 6 }}>
                {p.status === "pending" && <button onClick={() => setPhotos(photos.map((x) => (x.id === p.id ? { ...x, status: "approved" } : x)))}
                  style={{ border: "none", background: "#1f5c3f", color: "#fff", borderRadius: 6, padding: "4px 8px", fontSize: 11, cursor: "pointer", flex: 1 }}>Aprobar</button>}
                <button onClick={() => setPhotos(photos.filter((x) => x.id !== p.id))}
                  style={{ border: "1px solid #e4e4e0", background: "#fff", borderRadius: 6, padding: "4px 8px", fontSize: 11, cursor: "pointer" }}><Trash2 size={12} /></button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ fontWeight: 500, fontSize: 14, margin: "24px 0 8px" }}>Mensajes del chat ({branchMessages.length})</div>
      {branchMessages.length === 0 && <div style={{ fontSize: 13, color: "#9a9a92" }}>No hay mensajes.</div>}
      {branchMessages.map((message) => (
        <div key={message.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, borderBottom: "1px solid #eef1ee", padding: "8px 0", fontSize: 12 }}>
          <div><strong>{message.author}</strong><div style={{ color: "#767670" }}>{message.text}</div></div>
          <button onClick={() => setMessages(messages.filter((item) => item.id !== message.id))} title="Eliminar mensaje" style={{ ...iconBtnStyle, color: "#a33" }}><Trash2 size={13} /></button>
        </div>
      ))}

      <div style={{ fontWeight: 500, fontSize: 14, margin: "24px 0 8px" }}>Discursos ({branchSpeakers.length})</div>
      {branchSpeakers.length === 0 && <div style={{ fontSize: 13, color: "#9a9a92" }}>No hay discursos reservados.</div>}
      {branchSpeakers.map((speaker) => (
        <div key={speaker.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, borderBottom: "1px solid #eef1ee", padding: "8px 0", fontSize: 12 }}>
          <div><strong>{speaker.name}</strong><div style={{ color: "#767670" }}>{speaker.date} · {speaker.status === "approved" ? "Aprobado" : "Pendiente"}</div></div>
          <div style={{ display: "flex", gap: 6 }}>
            {speaker.status !== "approved" && <button onClick={() => setSpeakers(speakers.map((item) => item.id === speaker.id ? { ...item, status: "approved" } : item))} style={{ ...secondaryBtn, padding: "5px 8px", fontSize: 11 }}>Aprobar</button>}
            <button onClick={() => setSpeakers(speakers.filter((item) => item.id !== speaker.id))} title="Eliminar discurso" style={{ ...iconBtnStyle, color: "#a33" }}><Trash2 size={13} /></button>
          </div>
        </div>
      ))}

      <div style={{ fontWeight: 500, fontSize: 14, margin: "24px 0 8px" }}>Usuarios ({accounts.length})</div>
      {accounts.map((account) => (
        <div key={account.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, borderBottom: "1px solid #eef1ee", padding: "8px 0", fontSize: 12 }}>
          <div><strong>{account.name}</strong><div style={{ color: "#767670" }}>{account.email} · {account.role}</div></div>
          <div style={{ display: "flex", gap: 6 }}>
            {account.id !== session.id && <>
              <button onClick={() => setAccounts(accounts.map((item) => item.id === account.id ? { ...item, active: item.active === false } : item))} style={{ ...secondaryBtn, padding: "5px 8px", fontSize: 11 }}>{account.active === false ? "Activar" : "Desactivar"}</button>
              <button onClick={() => setAccounts(accounts.filter((item) => item.id !== account.id))} title="Eliminar usuario" style={{ ...iconBtnStyle, color: "#a33" }}><Trash2 size={13} /></button>
            </>}
          </div>
        </div>
      ))}

      <div style={{ fontWeight: 500, fontSize: 14, margin: "24px 0 8px" }}>Discursos agendados ({speakers.length})</div>
      {speakers.length === 0 && <div style={{ fontSize: 13, color: "#9a9a92" }}>Aún no hay discursos agendados.</div>}
      {speakers.slice().sort((a, b) => a.date.localeCompare(b.date)).map((s) => (
        <div key={s.id} style={{ fontSize: 12, color: "#334033", marginBottom: 4 }}>{s.date} — {s.name}</div>
      ))}
    </div>
  );
}

export default function App() {
  const [branches, setBranches, branchesLoaded] = useStore(STORAGE_KEYS.BRANCHES, [seedBranch]);
  const [events, setEvents] = useStore(STORAGE_KEYS.EVENTS, []);
  const [speakers, setSpeakers] = useStore(STORAGE_KEYS.SPEAKERS, []);
  const [ordinances, setOrdinances] = useStore(STORAGE_KEYS.ORDINANCES, []);
  const [members, setMembers] = useStore(STORAGE_KEYS.MEMBERS, []);
  const [photos, setPhotos] = useStore(STORAGE_KEYS.PHOTOS, []);
  const [messages, setMessages] = useStore(STORAGE_KEYS.MESSAGES, []);
  const [accounts, setAccounts, accountsLoaded] = useStore(STORAGE_KEYS.ACCOUNTS, []);
  const [missionaries, setMissionaries] = useStore(STORAGE_KEYS.MISSIONARIES, []);
  const [companionships, setCompanionships] = useStore(STORAGE_KEYS.COMPANIONSHIPS, []);
  const [adminCodes, setAdminCodes] = useStore(STORAGE_KEYS.ADMIN_CODES, []);
  const [branchCredentials, setBranchCredentials] = useStore(STORAGE_KEYS.BRANCH_CREDENTIALS, [], false);

  const [view, setView] = useState("directory");
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [session, setSession] = useState(null);
  const [showWelcome, setShowWelcome] = useState(() => {
    try { return localStorage.getItem('seen_welcome') !== 'true'; } catch { return true; }
  });
  const [authChecked, setAuthChecked] = useState(false);
  const accountsRef = useRef(accounts);

  useEffect(() => {
    accountsRef.current = accounts;
  }, [accounts]);

  useEffect(() => {
    let mounted = true;

    const normalizeSession = async (sessionObj) => {
      const authUser = sessionObj?.user;
      if (!authUser || !mounted) return null;

      const { data: profile, error: profileError } = await supabase.from("profiles").select("*").eq("id", authUser.id).maybeSingle();
      if (profileError) {
        console.warn("No se pudo leer el perfil de Supabase:", profileError.message);
      }
      if (!mounted) return null;

      if (profile) {
        const normalized = normalizeProfileRow(profile);
        const persisted = accountsRef.current.find((a) => a.id === normalized.id);
        if (!persisted) setAccounts([...accountsRef.current, normalized]);
        return normalized;
      }

      const authAccount = authSessionToAccount(sessionObj, accountsRef.current);
      if (authAccount) {
        setAccounts([...accountsRef.current, authAccount]);
        return authAccount;
      }

      return null;
    };

    const restoreLocalSession = () => {
      const stored = localStorage.getItem(STORAGE_KEYS.SESSION);
      if (!stored) return null;
      try {
        return JSON.parse(stored);
      } catch {
        return null;
      }
    };

    const restoreAuthSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!mounted) return;
        if (error) {
          console.warn("No se pudo restaurar sesión Supabase:", error.message);
        }

        const sessionObj = data?.session ?? data;
        if (sessionObj?.user) {
          const restored = await normalizeSession(sessionObj);
          if (mounted && restored) setSession(restored);
        } else {
          const localSession = restoreLocalSession();
          if (mounted && localSession) {
            setSession(localSession);
          } else if (mounted) {
            setSession(null);
          }
        }
      } catch (e) {
        console.warn("Error al restaurar sesión Supabase:", e.message);
        if (mounted) {
          const localSession = restoreLocalSession();
          setSession(localSession);
        }
      } finally {
        if (mounted) setAuthChecked(true);
      }
    };

    restoreAuthSession();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, sessionData) => {
      if (!mounted) return;
      const sessionObj = sessionData?.session ?? sessionData;
      if (sessionObj?.user) {
        normalizeSession(sessionObj).then((normalized) => {
          if (mounted && normalized) setSession(normalized);
        });
      } else {
        setSession(null);
      }
    });

    return () => {
      mounted = false;
      listener?.subscription?.unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (!branchesLoaded) return;
    if (branches.length === 0) {
      const b = { ...seedBranch, adminId: null };
      b.inviteCode = genInviteCode(b.name);
      b.missionaryCode = genMissionaryCode(b.name);
      b.visitorCode = genVisitorCode(b.name);
      b.visitorCodeExpiresAt = addMonths(new Date(), 3).toISOString();
      setBranches([b]);
      return;
    }
    let changed = false;
    const next = branches.map((b) => {
      const patch = {};
      if (!b.inviteCode) { patch.inviteCode = genInviteCode(b.name); changed = true; }
      if (!b.missionaryCode) { patch.missionaryCode = genMissionaryCode(b.name); changed = true; }
      if (!b.visitorCode) {
        patch.visitorCode = genVisitorCode(b.name);
        patch.visitorCodeExpiresAt = addMonths(new Date(), 3).toISOString();
        changed = true;
      }
      if (b.parentBranchId === undefined) { patch.parentBranchId = null; changed = true; }
      if (b.serverBranchId === undefined) { patch.serverBranchId = null; changed = true; }
      if (b.siteUrl === undefined) { patch.siteUrl = ""; changed = true; }
      if (b.status === undefined) { patch.status = "approved"; changed = true; }
      if (b.verification === undefined) { patch.verification = b.id === seedBranch.id ? "verified" : "pending"; changed = true; }
      if (b.adminId === undefined) { patch.adminId = null; changed = true; }
      return Object.keys(patch).length ? { ...b, ...patch } : b;
    });
    if (changed) setBranches(next);
  }, [branchesLoaded]);

  useEffect(() => {
    if (session?.role === "visitor" && session.expiresAt && new Date(session.expiresAt) < new Date()) {
      setSession(null);
    }
  }, [session]);

  useEffect(() => {
    if (!session) return;
    const latest = accounts.find((a) => a.id === session.id);
    if (latest && latest.active !== session.active) {
      setSession({ ...session, active: latest.active });
    }
  }, [accounts]);

  const primaryBranchId = seedBranch.id;

  const handleSelectBranch = (branch) => {
    if (branch.siteUrl && branch.siteUrl.trim()) {
      window.open(branch.siteUrl.trim(), "_blank", "noopener,noreferrer");
    } else {
      setSelectedBranch(branch);
    }
  };

  const missionariesWithStatus = useMemo(() => {
    return missionaries.map((m) => {
      const account = accounts.find((a) => a.id === m.accountId);
      return { ...m, accountActive: account ? account.active !== false : true };
    });
  }, [missionaries, accounts]);

  const chatUnread = 0;
  const speakerGaps = 0;

  if (!authChecked) {
    return (
      <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", background: "#f7f7f5", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <style dangerouslySetInnerHTML={{ __html: GLOBAL_CSS }} />
        <div style={{ background: "#fff", borderRadius: 18, padding: 32, boxShadow: "0 18px 45px rgba(0,0,0,0.08)", textAlign: "center", maxWidth: 340, width: "100%" }}>
          <div style={{ fontSize: 18, fontWeight: 600, color: "#1f5c3f", marginBottom: 10 }}>Cargando sesión...</div>
          <div style={{ fontSize: 14, color: "#5f5f5f" }}>Restaurando tu sesión con Supabase.</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", background: "#f7f7f5", minHeight: "100%" }}>
      <style dangerouslySetInnerHTML={{ __html: GLOBAL_CSS }} />
      <Header view={view} setView={setView} session={session} onLogout={async () => {
        await supabase.auth.signOut();
        localStorage.removeItem(STORAGE_KEYS.SESSION);
        setSession(null);
        setView("directory");
      }}
        chatUnread={chatUnread} speakerGaps={speakerGaps} />

      {showWelcome && (
        <WelcomePage onClose={() => { try { localStorage.setItem('seen_welcome','true'); } catch {} setShowWelcome(false); }} />
      )}

      {view === "login" && (
        <LoginView accounts={accounts} setAccounts={setAccounts} branches={branches}
          adminCodes={adminCodes} setAdminCodes={setAdminCodes}
          onLogin={(acc) => { setSession(acc); setView("directory"); }} />
      )}

      {view === "directory" && (
        selectedBranch ? (
          <BranchDetail branch={selectedBranch} branches={branches} events={events} ordinances={ordinances} onBack={() => setSelectedBranch(null)}
            primaryBranchId={primaryBranchId} onGoMissionaries={() => { setSelectedBranch(null); setView("missionaries"); }}
            onSelectBranch={handleSelectBranch} />
        ) : (
          <DirectoryView branches={branches} onOpenBranch={handleSelectBranch} onGoJoin={() => setView("login")} session={session} />
        )
      )}

      {view === "red" && <ManifestoView />}
      {view === "calendar" && <CalendarView events={events} setEvents={setEvents} branchId={primaryBranchId} session={session} members={members} />}
      {view === "ordinances" && <OrdinancesView ordinances={ordinances} setOrdinances={setOrdinances} branchId={primaryBranchId} session={session} members={members} />}
      {view === "speakers" && <SpeakersView speakers={speakers} setSpeakers={setSpeakers} branchId={primaryBranchId} session={session} />}
      {view === "members" && <MembersView members={members} setMembers={setMembers} branchId={primaryBranchId} session={session} />}
      {view === "missionaries" && (
        <MissionariesView missionaries={missionariesWithStatus} setMissionaries={setMissionaries} companionships={companionships}
          setCompanionships={setCompanionships} session={session} primaryBranchId={primaryBranchId} />
      )}
      {view === "photos" && <PhotosView photos={photos} setPhotos={setPhotos} branchId={primaryBranchId} session={session} />}
      {view === "chat" && <ChatView messages={messages} setMessages={setMessages} branchId={primaryBranchId} session={session} />}
      {view === "admin" && (
        !session ? (
          <div className="container-page" style={{ padding: 60, textAlign: "center" }}>
            <Shield size={28} color="#1f5c3f" style={{ marginBottom: 10 }} />
            <div style={{ fontWeight: 500, marginBottom: 6 }}>Acceso restringido</div>
            <div style={{ fontSize: 13, color: "#767670" }}>Inicia sesión con una cuenta de administrador de rama.</div>
          </div>
        ) : session.role === "admin" ? (
          <AdminView branches={branches} setBranches={setBranches} speakers={speakers} photos={photos} setPhotos={setPhotos}
            missionaries={missionaries} setMissionaries={setMissionaries} accounts={accounts} setAccounts={setAccounts}
            session={session} events={events} ordinances={ordinances} members={members} companionships={companionships}
            messages={messages} setMessages={setMessages} branchCredentials={branchCredentials} setBranchCredentials={setBranchCredentials} />
        ) : (
          <div className="container-page" style={{ padding: 60, textAlign: "center" }}>
            <AlertCircle size={24} color="#9a9a92" style={{ marginBottom: 10 }} />
            <div style={{ fontSize: 13, color: "#767670" }}>No tienes permisos de administrador.</div>
          </div>
        )
      )}

      <div style={{ textAlign: "center", padding: 20, fontSize: 11, color: "#9a9a92" }}>
        Red de Ramas — Rama Bosque, Sincelejo, Sucre
      </div>
    </div>
  );
}
