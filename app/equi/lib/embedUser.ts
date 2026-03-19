/**
 * embedUser — Convenience wrapper around POST /api/embed
 *
 * Generates context chunks from an EquiUser via generateUserContextChunks,
 * then posts them to the embed route and persists to equi_knowledge.
 *
 * Usage:
 *   import { embedUser } from "@/app/equi/lib/embedUser";
 *   await embedUser(equiUser);
 */

import { generateUserContextChunks } from "./semanticParser";
import { EquiUser } from "../types";

export async function embedUser(userData: EquiUser): Promise<{ ok: boolean; error?: string }> {
  const chunks = generateUserContextChunks(userData);

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/api/embed`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: userData.id, chunks }),
    }
  );

  const json = await res.json();
  return res.ok ? { ok: true } : { ok: false, error: json.error };
}
