// ============================================================
// Supabase Client Configuration
// SECURITY: Only uses the public anon key — never the service-role key.
// The anon key is safe for frontend because RLS policies protect all data.
// ============================================================

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    'Missing Supabase environment variables. ' +
    'Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.'
  );
}

export const supabase = createClient(
  supabaseUrl || '',
  supabaseAnonKey || '',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  }
);

// ============================================================
// SECURITY NOTE:
// The Supabase service-role key must NEVER appear in this file or
// any other frontend code. Credential encryption/decryption is
// handled entirely server-side via PostgreSQL functions.
// ============================================================
