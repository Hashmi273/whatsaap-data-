// ============================================================
// Supabase Client Configuration & Dynamic Connection Manager
// SECURITY: Only uses the public anon key — never the service-role key.
// The anon key is safe for frontend because RLS policies protect all data.
// ============================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Official Project Supabase Endpoint
export const PROJECT_SUPABASE_URL = 'https://ztrskyefkugevypzfecl.supabase.co';
export const FALLBACK_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy_anon_fallback';

export function getActiveSupabaseUrl(): string {
  try {
    const saved = localStorage.getItem('immense_supabase_url');
    if (saved && saved.trim()) return saved.trim();
  } catch {
    // Ignore
  }
  return (import.meta.env.VITE_SUPABASE_URL || PROJECT_SUPABASE_URL).trim();
}

export function getActiveSupabaseAnonKey(): string {
  try {
    const saved = localStorage.getItem('immense_supabase_anon_key');
    if (saved && saved.trim()) return saved.trim();
  } catch {
    // Ignore
  }
  return (import.meta.env.VITE_SUPABASE_ANON_KEY || FALLBACK_ANON_KEY).trim();
}

function createConfiguredClient(): SupabaseClient {
  const url = getActiveSupabaseUrl();
  const key = getActiveSupabaseAnonKey();

  return createClient(url, key, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  });
}

export let supabase = createConfiguredClient();

export function setRuntimeSupabaseConfig(url?: string, anonKey?: string): void {
  try {
    if (url && url.trim()) {
      localStorage.setItem('immense_supabase_url', url.trim());
    }
    if (anonKey && anonKey.trim()) {
      localStorage.setItem('immense_supabase_anon_key', anonKey.trim());
    }
  } catch {
    // Ignore
  }
  supabase = createConfiguredClient();
}
