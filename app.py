"""
Servidor central de verificación - Red de Ramas
=================================================

Este servidor es la única fuente de verdad sobre qué ramas son legítimas
en la red. No aloja el contenido de cada rama (eso lo maneja cada rama en
su propia copia de la app) - solo emite y valida las API keys que
demuestran que una rama fue aceptada en la red.

Flujo de confianza:
  1. Un admin de una rama ya aceptada genera un código de invitación
     (POST /invite-codes) desde su propio panel.
  2. La persona que va a crear una rama nueva usa ese código aquí
     (POST /branches/register) junto con los datos de su rama.
  3. Este servidor crea la rama en estado "pending" y emite una API key
     (se muestra UNA sola vez; solo se guarda su hash).
  4. Un admin humano de este servidor (tú) revisa /admin y aprueba la rama.
  5. Una vez aprobada, la rama puede llamar a /branches/verify con su
     API key para demostrar que es legítima, y el frontend de cada rama
     usa esa verificación antes de mostrarse en el mapa público.

Despliegue recomendado (ver DEPLOY.md):
  Internet -> Cloudflare DNS -> Cloudflare Tunnel -> este proceso Flask,
  corriendo en una VM detrás de tu red Wi-Fi. Nunca expongas el puerto
  directamente a Internet; el túnel es el único punto de entrada.
"""

import hashlib
import os
import re
import secrets
import sqlite3
import time
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

from flask import Flask, g, jsonify, request
from flask_cors import CORS

DB_PATH = os.environ.get("RAMA_DB_PATH", os.path.join(os.path.dirname(__file__), "rama_network.db"))
ADMIN_TOKEN = os.environ.get("RAMA_ADMIN_TOKEN")  # requerido para /admin/*
INVITE_CODE_TTL_DAYS = 30
API_KEY_PREFIX = "rrk_"  # "rama registry key" - permite reconocer las keys a simple vista

app = Flask(__name__)
CORS(app)  # los orígenes concretos se filtran también en Cloudflare/Nginx; ver DEPLOY.md

# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------

def now_iso():
    return datetime.now(timezone.utc).isoformat()


def hash_secret(secret):
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()


def gen_invite_code():
    return "RED-" + secrets.token_hex(4).upper()


def gen_api_key():
    return API_KEY_PREFIX + secrets.token_urlsafe(32)


def valid_branch_name(name):
    return bool(name) and 2 <= len(name.strip()) <= 120


# ---------------------------------------------------------------------------
# Base de datos
# ---------------------------------------------------------------------------

@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with get_db() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS branches (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                location TEXT,
                district TEXT,
                lat REAL,
                lng REAL,
                status TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected | revoked
                api_key_hash TEXT NOT NULL,
                invited_by_branch_id TEXT,
                created_at TEXT NOT NULL,
                approved_at TEXT,
                last_seen_at TEXT
            );

            CREATE TABLE IF NOT EXISTS invite_codes (
                code TEXT PRIMARY KEY,
                issuer_branch_id TEXT NOT NULL,
                used_by_branch_id TEXT,
                expires_at TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event TEXT NOT NULL,
                branch_id TEXT,
                detail TEXT,
                ip TEXT,
                created_at TEXT NOT NULL
            );
            """
        )


def log_event(db, event, branch_id=None, detail=""):
    db.execute(
        "INSERT INTO audit_log (event, branch_id, detail, ip, created_at) VALUES (?, ?, ?, ?, ?)",
        (event, branch_id, detail, request.headers.get("X-Forwarded-For", request.remote_addr), now_iso()),
    )


# ---------------------------------------------------------------------------
# Rate limiting simple en memoria (por IP). Para producción real con más de
# un proceso, reemplazar por Redis; aquí basta para una VM pequeña.
# ---------------------------------------------------------------------------

_rate_buckets = {}
RATE_LIMIT_WINDOW = 60  # segundos
RATE_LIMIT_MAX = 20  # peticiones por ventana por IP


def rate_limited(key):
    bucket = _rate_buckets.setdefault(key, [])
    cutoff = time.time() - RATE_LIMIT_WINDOW
    while bucket and bucket[0] < cutoff:
        bucket.pop(0)
    if len(bucket) >= RATE_LIMIT_MAX:
        return True
    bucket.append(time.time())
    return False


@app.before_request
def enforce_rate_limit():
    ip = request.headers.get("X-Forwarded-For", request.remote_addr)
    if rate_limited(ip):
        return jsonify(error="Demasiadas solicitudes. Intenta de nuevo en un minuto."), 429


def require_admin():
    if not ADMIN_TOKEN:
        return jsonify(error="El servidor no tiene configurado RAMA_ADMIN_TOKEN."), 500
    token = request.headers.get("X-Admin-Token", "")
    if not secrets.compare_digest(token, ADMIN_TOKEN):
        return jsonify(error="No autorizado."), 401
    return None


def require_branch_api_key():
    """Devuelve la fila de la rama autenticada, o (None, response_de_error)."""
    api_key = request.headers.get("X-Branch-Api-Key", "")
    if not api_key:
        return None, (jsonify(error="Falta la API key de la rama."), 401)
    with get_db() as db:
        row = db.execute(
            "SELECT * FROM branches WHERE api_key_hash = ?", (hash_secret(api_key),)
        ).fetchone()
        if not row:
            return None, (jsonify(error="API key inválida."), 401)
        db.execute("UPDATE branches SET last_seen_at = ? WHERE id = ?", (now_iso(), row["id"]))
        return row, None


# ---------------------------------------------------------------------------
# Endpoints públicos de verificación (usados por cada instancia de la app)
# ---------------------------------------------------------------------------

@app.route("/health", methods=["GET"])
def health():
    return jsonify(status="ok", time=now_iso())


@app.route("/branches/register", methods=["POST"])
def register_branch():
    """Una rama nueva se registra con un código de invitación válido.
    Devuelve su api_key UNA sola vez. Queda en estado 'pending' hasta
    revisión manual en /admin."""
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    location = (data.get("location") or "").strip()
    district = (data.get("district") or "").strip()
    lat = data.get("lat")
    lng = data.get("lng")
    invite_code = (data.get("inviteCode") or "").strip().upper()

    if not valid_branch_name(name):
        return jsonify(error="Nombre de rama inválido."), 400
    if not invite_code:
        return jsonify(error="Se requiere un código de invitación de una rama ya aceptada en la red."), 400

    with get_db() as db:
        code_row = db.execute(
            "SELECT * FROM invite_codes WHERE code = ? AND used_by_branch_id IS NULL",
            (invite_code,),
        ).fetchone()
        if not code_row:
            log_event(db, "register_rejected_bad_code", detail=f"code={invite_code}")
            return jsonify(error="Código de invitación inválido o ya utilizado."), 403
        if datetime.fromisoformat(code_row["expires_at"]) < datetime.now(timezone.utc):
            log_event(db, "register_rejected_expired_code", detail=f"code={invite_code}")
            return jsonify(error="Este código de invitación venció."), 403

        branch_id = secrets.token_hex(8)
        api_key = gen_api_key()
        db.execute(
            """INSERT INTO branches
               (id, name, location, district, lat, lng, status, api_key_hash,
                invited_by_branch_id, created_at)
               VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)""",
            (branch_id, name, location, district, lat, lng, hash_secret(api_key),
             code_row["issuer_branch_id"], now_iso()),
        )
        db.execute(
            "UPDATE invite_codes SET used_by_branch_id = ? WHERE code = ?",
            (branch_id, invite_code),
        )
        log_event(db, "branch_registered", branch_id=branch_id, detail=name)

    return jsonify(
        branchId=branch_id,
        apiKey=api_key,
        status="pending",
        message="Rama registrada. Guarda esta API key: no se volverá a mostrar. "
                "Tu rama quedará visible en la red una vez sea aprobada.",
    ), 201


@app.route("/branches/verify", methods=["GET"])
def verify_branch():
    """Cada instancia de la app llama a esto (con su propia API key) para
    confirmar que sigue siendo una rama legítima y aprobada antes de
    publicarse en el directorio local."""
    branch, error = require_branch_api_key()
    if error:
        return error
    return jsonify(
        branchId=branch["id"],
        name=branch["name"],
        status=branch["status"],
        approved=branch["status"] == "approved",
    )


@app.route("/branches/public", methods=["GET"])
def public_branches():
    """Lista de solo-lectura de ramas APROBADAS, para pintar el mapa global.
    No expone api_key_hash ni datos internos de administración."""
    with get_db() as db:
        rows = db.execute(
            """SELECT id, name, location, district, lat, lng, invited_by_branch_id, approved_at
               FROM branches WHERE status = 'approved' ORDER BY approved_at ASC"""
        ).fetchall()
    return jsonify(branches=[dict(r) for r in rows])


@app.route("/invite-codes", methods=["POST"])
def create_invite_code():
    """Una rama YA aprobada genera un código para invitar a la siguiente.
    Requiere su propia API key -- así solo ramas legítimas pueden expandir la red."""
    branch, error = require_branch_api_key()
    if error:
        return error
    if branch["status"] != "approved":
        return jsonify(error="Solo una rama aprobada puede emitir invitaciones."), 403

    code = gen_invite_code()
    expires_at = (datetime.now(timezone.utc) + timedelta(days=INVITE_CODE_TTL_DAYS)).isoformat()
    with get_db() as db:
        db.execute(
            "INSERT INTO invite_codes (code, issuer_branch_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
            (code, branch["id"], expires_at, now_iso()),
        )
        log_event(db, "invite_code_created", branch_id=branch["id"], detail=code)

    return jsonify(code=code, expiresAt=expires_at), 201


@app.route("/invite-codes", methods=["GET"])
def list_my_invite_codes():
    branch, error = require_branch_api_key()
    if error:
        return error
    with get_db() as db:
        rows = db.execute(
            "SELECT code, used_by_branch_id, expires_at, created_at FROM invite_codes WHERE issuer_branch_id = ? ORDER BY created_at DESC",
            (branch["id"],),
        ).fetchall()
    return jsonify(codes=[dict(r) for r in rows])


# ---------------------------------------------------------------------------
# Endpoints de administración humana (protegidos con X-Admin-Token)
# ---------------------------------------------------------------------------

@app.route("/admin/branches", methods=["GET"])
def admin_list_branches():
    error = require_admin()
    if error:
        return error
    with get_db() as db:
        rows = db.execute("SELECT id, name, location, district, status, invited_by_branch_id, created_at, approved_at, last_seen_at FROM branches ORDER BY created_at DESC").fetchall()
    return jsonify(branches=[dict(r) for r in rows])


@app.route("/admin/branches/<branch_id>/approve", methods=["POST"])
def admin_approve_branch(branch_id):
    error = require_admin()
    if error:
        return error
    with get_db() as db:
        row = db.execute("SELECT * FROM branches WHERE id = ?", (branch_id,)).fetchone()
        if not row:
            return jsonify(error="Rama no encontrada."), 404
        db.execute(
            "UPDATE branches SET status = 'approved', approved_at = ? WHERE id = ?",
            (now_iso(), branch_id),
        )
        log_event(db, "branch_approved", branch_id=branch_id)
    return jsonify(ok=True)


@app.route("/admin/branches/<branch_id>/reject", methods=["POST"])
def admin_reject_branch(branch_id):
    error = require_admin()
    if error:
        return error
    with get_db() as db:
        db.execute("UPDATE branches SET status = 'rejected' WHERE id = ?", (branch_id,))
        log_event(db, "branch_rejected", branch_id=branch_id)
    return jsonify(ok=True)


@app.route("/admin/branches/<branch_id>/revoke", methods=["POST"])
def admin_revoke_branch(branch_id):
    """Para cuando una rama aprobada resulta ser fraudulenta más tarde."""
    error = require_admin()
    if error:
        return error
    with get_db() as db:
        db.execute("UPDATE branches SET status = 'revoked' WHERE id = ?", (branch_id,))
        log_event(db, "branch_revoked", branch_id=branch_id)
    return jsonify(ok=True)


@app.route("/admin/audit-log", methods=["GET"])
def admin_audit_log():
    error = require_admin()
    if error:
        return error
    with get_db() as db:
        rows = db.execute("SELECT * FROM audit_log ORDER BY id DESC LIMIT 200").fetchall()
    return jsonify(events=[dict(r) for r in rows])


if __name__ == "__main__":
    init_db()
    port = int(os.environ.get("PORT", 8420))
    app.run(host="127.0.0.1", port=port)
else:
    init_db()
