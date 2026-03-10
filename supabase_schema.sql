-- SQL Schema for Zine Club Tracker Maestro
-- Execute this in your Supabase SQL Editor

-- 1. Tasks Table
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  phase INTEGER NOT NULL,
  title TEXT NOT NULL,
  date_label TEXT,
  detail TEXT,
  type TEXT,
  tool TEXT,
  assignee TEXT, -- 'paula', 'pablo', or null
  is_done BOOLEAN DEFAULT false,
  is_custom BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Gastos Table
CREATE TABLE IF NOT EXISTS gastos (
  id TEXT PRIMARY KEY,
  concepto TEXT NOT NULL,
  importe NUMERIC NOT NULL,
  cat TEXT NOT NULL,
  tipo TEXT NOT NULL,
  fecha DATE NOT NULL,
  pagador TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. MRR Snapshots Table
CREATE TABLE IF NOT EXISTS mrr_snapshots (
  id TEXT PRIMARY KEY,
  date TIMESTAMPTZ NOT NULL,
  mrr NUMERIC NOT NULL,
  subs NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Config Table (for global settings)
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Realtime for all tables
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE gastos;
ALTER PUBLICATION supabase_realtime ADD TABLE mrr_snapshots;
ALTER PUBLICATION supabase_realtime ADD TABLE config;

-- RLS Policies (Simple public access for this shared tool)
-- Note: In production, you'd want to restrict this to authenticated users.
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE gastos ENABLE ROW LEVEL SECURITY;
ALTER TABLE mrr_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public Access" ON tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access" ON gastos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access" ON mrr_snapshots FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access" ON config FOR ALL USING (true) WITH CHECK (true);
