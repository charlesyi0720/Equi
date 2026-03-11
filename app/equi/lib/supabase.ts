import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

console.log('[DEBUG] ALL env vars:', Object.keys(process.env).filter(k => k.includes('SUPABASE')));
console.log('[DEBUG] Supabase env check:', { 
  hasUrl: !!supabaseUrl, 
  hasKey: !!supabaseAnonKey,
  urlValue: supabaseUrl ? 'SET' : 'EMPTY',
  urlLength: supabaseUrl.length,
  keyValue: supabaseAnonKey ? 'SET' : 'EMPTY',
  keyLength: supabaseAnonKey.length
});

export const supabase = supabaseUrl && supabaseAnonKey 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

console.log('[DEBUG] Supabase client initialized:', supabase ? 'SUCCESS' : 'NULL');
