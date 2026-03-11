import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

console.log('[DEBUG] ALL env vars with NEXT_PUBLIC:', Object.keys(process.env).filter(k => k.startsWith('NEXT_PUBLIC_')));
console.log('[DEBUG] Supabase env check:', { 
  hasUrl: !!supabaseUrl, 
  hasKey: !!supabaseAnonKey,
  urlValue: supabaseUrl ? 'SET' : 'EMPTY',
  keyValue: supabaseAnonKey ? 'SET' : 'EMPTY'
});

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

console.log('[DEBUG] Supabase client initialized:', supabase ? 'SUCCESS' : 'NULL');
console.log('[DEBUG] Supabase admin initialized:', supabaseAdmin ? 'SUCCESS' : 'NULL');
