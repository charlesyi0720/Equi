-- Migration: 001_create_match_equi_knowledge.sql
-- Creates the RPC function used by the Synthesis API for RAG retrieval.
-- Run this once in Supabase Dashboard → SQL Editor before deploying the RAG synthesis changes.

-- Enable pgvector extension (only needed once per project; safe to re-run)
CREATE EXTENSION IF NOT EXISTS vector;

-- Create match_equi_knowledge RPC function
-- Args:
--   query_embedding: vector(768) — the user's question embedded via Gemini text-embedding-004
--   p_user_id: UUID            — filters to the calling user's knowledge rows
--   p_match_count: integer      — how many top results to return (default 3)
-- Returns:
--   content: text        — the retrieved knowledge chunk text
--   metadata: jsonb      — the original metadata column value
--   similarity: float8   — cosine similarity score (0–1)
CREATE OR REPLACE FUNCTION match_equi_knowledge(
  query_embedding vector(768),
  p_user_id UUID,
  p_match_count integer DEFAULT 3
)
RETURNS TABLE(
  content    text,
  metadata   jsonb,
  similarity float8
)
LANGUAGE plpgsql
SECURITY DEFINER          -- runs as the definer (service_role), so RLS is bypassed intentionally here
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ek.content,
    ek.metadata,
    (ek.embedding <=> match_equi_knowledge.query_embedding)::float8 AS similarity
  FROM equi_knowledge ek
  WHERE ek.user_id = p_user_id
  ORDER BY ek.embedding <=> match_equi_knowledge.query_embedding
  LIMIT p_match_count;
END;
$$;
