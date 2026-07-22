-- Crear tabla branches
CREATE TABLE branches (
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
CREATE TABLE members (
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
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  branchId TEXT NOT NULL REFERENCES branches(id),
  date TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Crear tabla speakers
CREATE TABLE speakers (
  id TEXT PRIMARY KEY,
  branchId TEXT NOT NULL REFERENCES branches(id),
  date TEXT NOT NULL,
  name TEXT NOT NULL,
  topic TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Crear tabla ordinances
CREATE TABLE ordinances (
  id TEXT PRIMARY KEY,
  branchId TEXT NOT NULL REFERENCES branches(id),
  date TEXT NOT NULL,
  type TEXT NOT NULL,
  memberName TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Crear tabla photos
CREATE TABLE photos (
  id TEXT PRIMARY KEY,
  branchId TEXT NOT NULL REFERENCES branches(id),
  url TEXT NOT NULL,
  description TEXT,
  uploadedBy TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Crear tabla messages
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  branchId TEXT NOT NULL REFERENCES branches(id),
  senderName TEXT NOT NULL,
  senderEmail TEXT,
  text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Crear tabla missionaries
CREATE TABLE missionaries (
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
CREATE TABLE companionships (
  id TEXT PRIMARY KEY,
  branchId TEXT NOT NULL REFERENCES branches(id),
  name TEXT NOT NULL,
  missionary1Id TEXT,
  missionary2Id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Crear tabla accounts
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  password TEXT NOT NULL,
  accountType TEXT DEFAULT 'member',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Crear tabla admin_codes
CREATE TABLE admin_codes (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  branchId TEXT NOT NULL REFERENCES branches(id),
  createdBy TEXT,
  expiresAt TIMESTAMP WITH TIME ZONE,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Crear tabla invite_codes
CREATE TABLE invite_codes (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  branchId TEXT NOT NULL REFERENCES branches(id),
  createdBy TEXT,
  expiresAt TIMESTAMP WITH TIME ZONE,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

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
