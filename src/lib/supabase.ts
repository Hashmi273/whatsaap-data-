// ============================================================
// Supabase Client Configuration & Dynamic Connection Manager
// SECURITY: Uses the public anon key — never the service-role key.
// The anon key is safe for frontend because RLS policies protect all data.
// ============================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Official Project Supabase Endpoint
export const PROJECT_SUPABASE_URL = 'https://ztrskyefkugevypzfecl.supabase.co';

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
    if (saved && saved.trim() && !saved.includes('dummy_anon_fallback')) {
      return saved.trim();
    }
  } catch {
    // Ignore
  }
  
  const envKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
  if (envKey && !envKey.includes('dummy_anon_fallback')) {
    return envKey;
  }

  // Return empty string if no valid key is configured so caller receives clear configuration error
  return '';
}

function createConfiguredClient(): SupabaseClient {
  const url = getActiveSupabaseUrl();
  const key = getActiveSupabaseAnonKey();

  if (!key) {
    console.warn('[SUPABASE] VITE_SUPABASE_ANON_KEY is not configured in Vercel environment variables or Settings.');
  }

  return createClient(url, key || 'missing_anon_key_please_configure', {
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
