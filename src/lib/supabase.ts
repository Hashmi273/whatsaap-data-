// ============================================================
// Supabase Client Configuration
// SECURITY: Only uses the public anon key — never the service-role key.
// The anon key is safe for frontend because RLS policies protect all data.
// ============================================================

import { createClient } from '@supabase/supabase-js';

// Project Supabase Endpoint
const PROJECT_SUPABASE_URL = 'https://ztrskyefkugevypzfecl.supabase.co';
const FALLBACK_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy_anon_fallback';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || PROJECT_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || FALLBACK_ANON_KEY;

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  }
);
