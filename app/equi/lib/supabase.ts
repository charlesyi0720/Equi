import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

console.log('[DEBUG] Supabase env check:', { 
  hasUrl: !!supabaseUrl, 
  hasKey: !!supabaseAnonKey,
  urlValue: supabaseUrl ? 'SET' : 'EMPTY',
  keyValue: supabaseAnonKey ? 'SET' : 'EMPTY'
});

export const supabase = supabaseUrl && supabaseAnonKey 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

console.log('[DEBUG] Supabase client initialized:', supabase ? 'SUCCESS' : 'NULL');
