-- Migration: 003_create_match_equi_knowledge_filtered.sql
-- Creates an enhanced RPC that supports optional metadata (chunk_type) filtering
-- on top of the existing vector similarity search.
--
-- Usage in app/api/synthesis/route.ts:
--   supabase.rpc("match_equi_knowledge_filtered", {
--     query_embedding:  [...],
--     p_user_id:        "uuid",
--     p_match_count:   3,
--     p_chunk_types:    ["fixed_activities", "biological_clock"]  -- NULL = no filter
--   })
--
-- Run this in Supabase Dashboard → SQL Editor after deployment.
-- The original match_equi_knowledge function is left untouched for backward compatibility.

CREATE OR REPLACE FUNCTION match_equi_knowledge_filtered(
  query_embedding  vector(768),
  p_user_id        UUID,
  p_match_count    integer DEFAULT 3,
  p_chunk_types    text[]  DEFAULT NULL  -- NULL = no filter (return all types)
)
RETURNS TABLE(
  content     text,
  metadata    jsonb,
  similarity  float8
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ek.content,
    ek.metadata,
    (ek.embedding <=> match_equi_knowledge_filtered.query_embedding)::float8 AS similarity
  FROM equi_knowledge ek
  WHERE ek.user_id = p_user_id
    AND (
      p_chunk_types IS NULL
      OR ek.metadata->>'chunk_type' = ANY(p_chunk_types)
    )
  ORDER BY ek.embedding <=> match_equi_knowledge_filtered.query_embedding
  LIMIT p_match_count;
END;
$$;
