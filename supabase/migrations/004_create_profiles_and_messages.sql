-- =====================================================================
-- Migration: 004_create_profiles_and_messages.sql
--
-- Creates two core tables:
--   1. profiles    — re-declared here so the schema is fully documented in migrations
--   2. conversation_messages — Layer 1 of the Long-Term Memory system
--
-- Also creates two RPC helpers for high-performance message retrieval.
--
-- Run this in Supabase Dashboard → SQL Editor.
-- =====================================================================

-- =====================================================================
-- 1. profiles table (补档：Dashboard 手动创建，代码依赖它)
-- =====================================================================
CREATE TABLE IF NOT EXISTS profiles (
  id                    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email                 TEXT,
  user_data             JSONB DEFAULT '{}',
  onboarding_completed  BOOLEAN DEFAULT FALSE,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own profile" ON profiles
  FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Trigger: auto-update updated_at
CREATE OR REPLACE FUNCTION update_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profiles_updated_at ON profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_profiles_updated_at();

-- =====================================================================
-- 2. conversation_messages table (Layer 1: 短期记忆)
-- =====================================================================
CREATE TABLE IF NOT EXISTS conversation_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id  TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content     TEXT NOT NULL,
  timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own messages" ON conversation_messages
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- High-performance indexes for the two main query patterns
CREATE INDEX IF NOT EXISTS conversation_messages_session_time_idx
  ON conversation_messages (user_id, session_id, timestamp ASC);

CREATE INDEX IF NOT EXISTS conversation_messages_user_recent_idx
  ON conversation_messages (user_id, timestamp DESC);

-- =====================================================================
-- 3. RPC: get_recent_messages
--    Returns the last N messages for a given session (page load)
-- =====================================================================
CREATE OR REPLACE FUNCTION get_recent_messages(
  p_user_id    UUID,
  p_session_id TEXT,
  p_limit      INTEGER DEFAULT 20
)
RETURNS TABLE(id uuid, session_id text, role text, content text, timestamp timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT cm.id, cm.session_id, cm.role, cm.content, cm.timestamp
  FROM conversation_messages cm
  WHERE cm.user_id = p_user_id AND cm.session_id = p_session_id
  ORDER BY cm.timestamp ASC
  LIMIT p_limit;
END;
$$;

-- =====================================================================
-- 4. RPC: get_sessions_preview
--    Returns one row per session: last message, timestamp, count
--    Used by the resume dialog
-- =====================================================================
CREATE OR REPLACE FUNCTION get_sessions_preview(
  p_user_id UUID,
  p_limit   INTEGER DEFAULT 10
)
RETURNS TABLE(session_id text, last_message text, last_timestamp timestamptz, message_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT sub.session_id, sub.content AS last_message,
         sub.timestamp AS last_timestamp, sub.cnt AS message_count
  FROM (
    SELECT
      cm.session_id,
      cm.content,
      cm.timestamp,
      COUNT(*) OVER (PARTITION BY cm.session_id) AS cnt,
      ROW_NUMBER() OVER (PARTITION BY cm.session_id ORDER BY cm.timestamp DESC) AS rn
    FROM conversation_messages cm
    WHERE cm.user_id = p_user_id
  ) sub
  WHERE sub.rn = 1
  ORDER BY sub.timestamp DESC
  LIMIT p_limit;
END;
$$;

-- =====================================================================
-- 5. RPC: get_messages_for_extract
--    Returns the last N messages for memory extraction (no RLS on aggs)
-- =====================================================================
CREATE OR REPLACE FUNCTION get_messages_for_extract(
  p_user_id    UUID,
  p_session_id TEXT,
  p_limit      INTEGER DEFAULT 20
)
RETURNS TABLE(role text, content text, timestamp timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT cm.role, cm.content, cm.timestamp
  FROM conversation_messages cm
  WHERE cm.user_id = p_user_id AND cm.session_id = p_session_id
  ORDER BY cm.timestamp DESC
  LIMIT p_limit;
END;
$$;
