-- Crear tabla branches
CREATE TABLE IF NOT EXISTS branches (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  location TEXT,
  district TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  symbol TEXT DEFAULT 'tree',
  status TEXT DEFAULT 'pending',
  verification TEXT DEFAULT 'unverified',
  meetingTime TEXT,
  address TEXT,
  adminId TEXT,
  parentBranchId TEXT,
  serverBranchId TEXT,
  siteUrl TEXT,
  api_key_hash TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  approved_at TIMESTAMP WITH TIME ZONE
);

-- Crear tabla members
CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  branchId TEXT NOT NULL REFERENCES branches(id),
  accountId TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role TEXT DEFAULT 'Miembro',
  joinDate TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  birthDate TEXT,
  gender TEXT,
  address TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Crear tabla events
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  branchId TEXT NOT NULL REFERENCES branches(id),
  date TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Crear tabla speakers
CREATE TABLE IF NOT EXISTS speakers (
  id TEXT PRIMARY KEY,
  branchId TEXT NOT NULL REFERENCES branches(id),
  date TEXT NOT NULL,
  name TEXT NOT NULL,
  topic TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Crear tabla ordinances
CREATE TABLE IF NOT EXISTS ordinances (
  id TEXT PRIMARY KEY,
  branchId TEXT NOT NULL REFERENCES branches(id),
  date TEXT NOT NULL,
  type TEXT NOT NULL,
  memberName TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Crear tabla photos
CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY,
  branchId TEXT NOT NULL REFERENCES branches(id),
  url TEXT NOT NULL,
  description TEXT,
  uploadedBy TEXT,
  missionaryId TEXT REFERENCES missionaries(id),
  missionaryName TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Crear tabla messages
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  branchId TEXT NOT NULL REFERENCES branches(id),
  senderName TEXT NOT NULL,
  senderEmail TEXT,
  text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Crear tabla missionaries
CREATE TABLE IF NOT EXISTS missionaries (
  id TEXT PRIMARY KEY,
  branchId TEXT NOT NULL REFERENCES branches(id),
  name TEXT NOT NULL,
  startDate TEXT,
  endDate TEXT,
  location TEXT,
  phone TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Crear tabla companionships
CREATE TABLE IF NOT EXISTS companionships (
  id TEXT PRIMARY KEY,
  branchId TEXT NOT NULL REFERENCES branches(id),
  name TEXT NOT NULL,
  missionary1Id TEXT,
  missionary2Id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Crear tabla accounts
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  password TEXT NOT NULL,
  accountType TEXT DEFAULT 'member',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de perfiles de usuario gestionada por Supabase Auth.
CREATE TABLE IF NOT EXISTS public.profiles (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  branch_id TEXT REFERENCES branches(id),
  invited_by_branch_id TEXT REFERENCES branches(id),
  active BOOLEAN DEFAULT TRUE,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_self" ON public.profiles;
DROP POLICY IF EXISTS "branches_read" ON public.branches;
DROP POLICY IF EXISTS "branches_admin" ON public.branches;
DROP POLICY IF EXISTS "members_select" ON public.members;
DROP POLICY IF EXISTS "members_insert" ON public.members;
DROP POLICY IF EXISTS "members_update_admin" ON public.members;
DROP POLICY IF EXISTS "members_delete_admin" ON public.members;
DROP POLICY IF EXISTS "events_select" ON public.events;
DROP POLICY IF EXISTS "events_insert" ON public.events;
DROP POLICY IF EXISTS "events_update_admin" ON public.events;
DROP POLICY IF EXISTS "events_delete_admin" ON public.events;
DROP POLICY IF EXISTS "speakers_select" ON public.speakers;
DROP POLICY IF EXISTS "speakers_insert" ON public.speakers;
DROP POLICY IF EXISTS "speakers_update_admin" ON public.speakers;
DROP POLICY IF EXISTS "speakers_delete_admin" ON public.speakers;
DROP POLICY IF EXISTS "ordinances_select" ON public.ordinances;
DROP POLICY IF EXISTS "ordinances_insert" ON public.ordinances;
DROP POLICY IF EXISTS "ordinances_update_admin" ON public.ordinances;
DROP POLICY IF EXISTS "ordinances_delete_admin" ON public.ordinances;
DROP POLICY IF EXISTS "photos_select" ON public.photos;
DROP POLICY IF EXISTS "photos_insert" ON public.photos;
DROP POLICY IF EXISTS "photos_update_admin" ON public.photos;
DROP POLICY IF EXISTS "photos_delete_admin" ON public.photos;
DROP POLICY IF EXISTS "messages_select" ON public.messages;
DROP POLICY IF EXISTS "messages_insert" ON public.messages;
DROP POLICY IF EXISTS "messages_update_admin" ON public.messages;
DROP POLICY IF EXISTS "messages_delete_admin" ON public.messages;
DROP POLICY IF EXISTS "missionaries_select" ON public.missionaries;
DROP POLICY IF EXISTS "missionaries_insert" ON public.missionaries;
DROP POLICY IF EXISTS "missionaries_update_admin" ON public.missionaries;
DROP POLICY IF EXISTS "missionaries_delete_admin" ON public.missionaries;
DROP POLICY IF EXISTS "companionships_select" ON public.companionships;
DROP POLICY IF EXISTS "companionships_insert" ON public.companionships;
DROP POLICY IF EXISTS "companionships_update_admin" ON public.companionships;
DROP POLICY IF EXISTS "companionships_delete_admin" ON public.companionships;
DROP POLICY IF EXISTS "app_store_read" ON public.app_store;
DROP POLICY IF EXISTS "app_store_write" ON public.app_store;

CREATE POLICY "profiles_self" ON public.profiles
  FOR ALL
  USING (
    auth.uid()::text = id OR EXISTS(
      SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role = 'admin'
    )
  )
  WITH CHECK (
    auth.uid()::text = id OR EXISTS(
      SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role = 'admin'
    )
  );

CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
  LANGUAGE sql STABLE
AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::text AND p.role = 'admin'
  )
$$;

CREATE OR REPLACE FUNCTION public.is_branch_member(branch_id TEXT) RETURNS boolean
  LANGUAGE sql STABLE
AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()::text AND (p.role = 'admin' OR p.branch_id = branch_id)
  )
$$;

-- Políticas RLS para recursos por rama
CREATE POLICY "branches_read" ON public.branches
  FOR SELECT
  USING (status = 'approved' OR public.is_admin());

CREATE POLICY "branches_admin" ON public.branches
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "members_select" ON public.members
  FOR SELECT
  USING (public.is_branch_member(branchId));

CREATE POLICY "members_insert" ON public.members
  FOR INSERT
  WITH CHECK (public.is_branch_member(branchId));

CREATE POLICY "members_update_admin" ON public.members
  FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "members_delete_admin" ON public.members
  FOR DELETE
  USING (public.is_admin());

CREATE POLICY "events_select" ON public.events
  FOR SELECT
  USING (public.is_branch_member(branchId));

CREATE POLICY "events_insert" ON public.events
  FOR INSERT
  WITH CHECK (public.is_branch_member(branchId));

CREATE POLICY "events_update_admin" ON public.events
  FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "events_delete_admin" ON public.events
  FOR DELETE
  USING (public.is_admin());

CREATE POLICY "speakers_select" ON public.speakers
  FOR SELECT
  USING (public.is_branch_member(branchId));

CREATE POLICY "speakers_insert" ON public.speakers
  FOR INSERT
  WITH CHECK (public.is_branch_member(branchId));

CREATE POLICY "speakers_update_admin" ON public.speakers
  FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "speakers_delete_admin" ON public.speakers
  FOR DELETE
  USING (public.is_admin());

CREATE POLICY "ordinances_select" ON public.ordinances
  FOR SELECT
  USING (public.is_branch_member(branchId));

CREATE POLICY "ordinances_insert" ON public.ordinances
  FOR INSERT
  WITH CHECK (public.is_branch_member(branchId));

CREATE POLICY "ordinances_update_admin" ON public.ordinances
  FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "ordinances_delete_admin" ON public.ordinances
  FOR DELETE
  USING (public.is_admin());

CREATE POLICY "photos_select" ON public.photos
  FOR SELECT
  USING (public.is_branch_member(branchId));

CREATE POLICY "photos_insert" ON public.photos
  FOR INSERT
  WITH CHECK (public.is_branch_member(branchId));

CREATE POLICY "photos_update_admin" ON public.photos
  FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "photos_delete_admin" ON public.photos
  FOR DELETE
  USING (public.is_admin());

CREATE POLICY "messages_select" ON public.messages
  FOR SELECT
  USING (public.is_branch_member(branchId));

CREATE POLICY "messages_insert" ON public.messages
  FOR INSERT
  WITH CHECK (public.is_branch_member(branchId));

CREATE POLICY "messages_update_admin" ON public.messages
  FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "messages_delete_admin" ON public.messages
  FOR DELETE
  USING (public.is_admin());

CREATE POLICY "missionaries_select" ON public.missionaries
  FOR SELECT
  USING (public.is_branch_member(branchId));

CREATE POLICY "missionaries_insert" ON public.missionaries
  FOR INSERT
  WITH CHECK (public.is_branch_member(branchId));

CREATE POLICY "missionaries_update_admin" ON public.missionaries
  FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "missionaries_delete_admin" ON public.missionaries
  FOR DELETE
  USING (public.is_admin());

CREATE POLICY "companionships_select" ON public.companionships
  FOR SELECT
  USING (public.is_branch_member(branchId));

CREATE POLICY "companionships_insert" ON public.companionships
  FOR INSERT
  WITH CHECK (public.is_branch_member(branchId));

CREATE POLICY "companionships_update_admin" ON public.companionships
  FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "companionships_delete_admin" ON public.companionships
  FOR DELETE
  USING (public.is_admin());

-- Crear tabla admin_codes
CREATE TABLE IF NOT EXISTS admin_codes (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  branchId TEXT NOT NULL REFERENCES branches(id),
  createdBy TEXT,
  expiresAt TIMESTAMP WITH TIME ZONE,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Crear tabla invite_codes
CREATE TABLE IF NOT EXISTS invite_codes (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  branchId TEXT NOT NULL REFERENCES branches(id),
  createdBy TEXT,
  expiresAt TIMESTAMP WITH TIME ZONE,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Almacenamiento compartido para módulos de la aplicación.
-- Guarda cada colección como JSON para evitar localStorage y permitir acceso desde cualquier dispositivo.
CREATE TABLE IF NOT EXISTS public.app_store (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.app_store ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    WHERE p.polname = 'app_store_read' AND c.relname = 'app_store'
  ) THEN
    CREATE POLICY "app_store_read"
      ON public.app_store FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    WHERE p.polname = 'app_store_write' AND c.relname = 'app_store'
  ) THEN
    CREATE POLICY "app_store_write"
      ON public.app_store FOR ALL
      TO anon, authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- Habilitar RLS (Row Level Security)
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE speakers ENABLE ROW LEVEL SECURITY;
ALTER TABLE ordinances ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE missionaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE companionships ENABLE ROW LEVEL SECURITY;
