-- Migration: 002_create_equi_knowledge_table.sql
-- Run this in Supabase Dashboard → SQL Editor.
-- This creates the table that the embed API (app/api/embed/route.ts) inserts into
-- and the match_equi_knowledge RPC (001) reads from.
--
-- NOTE: The service role (supabaseAdmin) bypasses RLS. This is intentional so the
-- Next.js server routes (which carry the service role key) can read/write for any
-- user without needing per-user policies. Row-Level Security is DISABLED on this table.
--
-- If you want to restrict access so even the service role cannot see other users'
-- data (defense in depth), add: ALTER TABLE equi_knowledge ENABLE ROW LEVEL SECURITY;
-- and then create a policy like:
--   CREATE POLICY "Service role full access" ON equi_knowledge
--     USING (true) WITH CHECK (true);

-- Enable pgvector (only needed once per project; safe to re-run)
CREATE EXTENSION IF NOT EXISTS vector;

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS equi_knowledge (
  id          UUID    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID    NOT NULL,                         -- FK to auth.users
  content     TEXT    NOT NULL,                          -- human-readable chunk text
  embedding   vector(768) NOT NULL,                      -- Gemini text-embedding-004 vector
  metadata    JSONB   DEFAULT '{}',                      -- { chunk_type: string }
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast cosine-similarity queries (used by match_equi_knowledge)
CREATE INDEX IF NOT EXISTS equi_knowledge_embedding_idx
  ON equi_knowledge USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Index to quickly delete all rows for a given user (used on every embed write)
CREATE INDEX IF NOT EXISTS equi_knowledge_user_id_idx
  ON equi_knowledge (user_id);

-- ---------------------------------------------------------------------------
-- Trigger: auto-update updated_at
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER equi_knowledge_updated_at
  BEFORE UPDATE ON equi_knowledge
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Security note
-- ---------------------------------------------------------------------------
-- RLS is intentionally OFF so the service-role API routes can manage all rows.
-- If you re-enable RLS, ensure the match_equi_knowledge RPC function (migration 001)
-- uses SECURITY DEFINER so it continues to bypass RLS for reads.
ALTER TABLE equi_knowledge DISABLE ROW LEVEL SECURITY;
