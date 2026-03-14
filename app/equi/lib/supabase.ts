import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Client for browser-side auth
export const supabase = supabaseUrl && supabaseAnonKey 
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

// Admin client for server-side operations (uses service role key)
export const supabaseAdmin = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

// Debug log for Supabase initialization
if (typeof window !== 'undefined') {
  console.log('[DEBUG] Supabase client initialized:', supabase ? 'SUCCESS' : 'NULL');
  console.log('[DEBUG] Supabase admin initialized:', supabaseAdmin ? 'SUCCESS' : 'NULL');
}

/**
 * Check if user has completed onboarding - directly from database
 * This is the authoritative source of truth
 */
export async function checkCompletionStatus(userId: string): Promise<boolean> {
  if (!supabase) {
    return false;
  }

  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("onboarding_completed")
      .eq("id", userId)
      .single();

    if (error) {
      return false;
    }

    return data?.onboarding_completed === true;
  } catch (err) {
    return false;
  }
}
