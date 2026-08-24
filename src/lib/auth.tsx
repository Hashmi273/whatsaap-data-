// ============================================================
// Authentication Context & Provider
// Manages user session, profile fetching, and auth state.
// Supports both Real Supabase Auth and Instant Local Demo Mode.
// ============================================================

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { ALLOWED_EMAIL_DOMAIN } from './constants';
import { logAudit } from './audit';
import type { Profile, UserRole } from '@/types/database';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  refreshProfile: () => Promise<void>;
  loginAsDemo: (role: UserRole) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function isValidCorporateEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  return domain === ALLOWED_EMAIL_DOMAIN.toLowerCase();
}

function getReadableAuthError(errorMessage: string): string {
  if (errorMessage.includes('Invalid login credentials')) {
    return 'Invalid email or password. Please check your credentials and try again.';
  }
  if (errorMessage.includes('Email not confirmed')) {
    return 'Your email has not been confirmed. Please check your inbox for a confirmation link.';
  }
  if (errorMessage.includes('corporate email')) {
    return `Registration is restricted to corporate email addresses (@${ALLOWED_EMAIL_DOMAIN}).`;
  }
  if (errorMessage.includes('User already registered')) {
    return 'An account with this email already exists. Please sign in instead.';
  }
  if (errorMessage.includes('Too many requests')) {
    return 'Too many login attempts. Please wait a moment and try again.';
  }
  return 'An error occurred. Please check your Supabase credentials or use Quick Demo Mode.';
}

export const DEMO_USERS: Record<UserRole, { profile: Profile; email: string; name: string }> = {
  super_admin: {
    email: `support@${ALLOWED_EMAIL_DOMAIN}`,
    name: 'Immense Admin (Super Admin)',
    profile: {
      id: 'immense-admin-001',
      full_name: 'Immense Super Admin',
      corporate_email: `support@${ALLOWED_EMAIL_DOMAIN}`,
      role: 'super_admin',
      department: 'Executive Leadership',
      is_active: true,
      avatar_url: null,
      last_login: new Date().toISOString(),
      created_at: '2026-01-01T00:00:00Z',
      updated_at: new Date().toISOString(),
    },
  },
  manager: {
    email: `manager@${ALLOWED_EMAIL_DOMAIN}`,
    name: 'Operations Manager',
    profile: {
      id: 'immense-manager-002',
      full_name: 'Operations Manager',
      corporate_email: `manager@${ALLOWED_EMAIL_DOMAIN}`,
      role: 'manager',
      department: 'WhatsApp Operations',
      is_active: true,
      avatar_url: null,
      last_login: new Date().toISOString(),
      created_at: '2026-02-15T11:30:00Z',
      updated_at: new Date().toISOString(),
    },
  },
  employee: {
    email: `employee@${ALLOWED_EMAIL_DOMAIN}`,
    name: 'Support Executive',
    profile: {
      id: 'immense-employee-003',
      full_name: 'Support Executive',
      corporate_email: `employee@${ALLOWED_EMAIL_DOMAIN}`,
      role: 'employee',
      department: 'Client Success',
      is_active: true,
      avatar_url: null,
      last_login: new Date().toISOString(),
      created_at: '2026-03-01T09:15:00Z',
      updated_at: new Date().toISOString(),
    },
  },
  viewer: {
    email: `compliance@${ALLOWED_EMAIL_DOMAIN}`,
    name: 'Compliance Auditor',
    profile: {
      id: 'immense-viewer-004',
      full_name: 'Compliance Auditor',
      corporate_email: `compliance@${ALLOWED_EMAIL_DOMAIN}`,
      role: 'viewer',
      department: 'Audit & Compliance',
      is_active: true,
      avatar_url: null,
      last_login: new Date().toISOString(),
      created_at: '2026-04-05T14:20:00Z',
      updated_at: new Date().toISOString(),
    },
  },
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('immense_demo_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [profile, setProfile] = useState<Profile | null>(() => {
    const saved = localStorage.getItem('immense_demo_profile');
    return saved ? JSON.parse(saved) : null;
  });
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) return null;
      return data as Profile;
    } catch {
      return null;
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    if (user.id.startsWith('demo-')) {
      const saved = localStorage.getItem('immense_demo_profile');
      if (saved) setProfile(JSON.parse(saved));
      return;
    }
    const p = await fetchProfile(user.id);
    if (p) setProfile(p);
  }, [user, fetchProfile]);

  useEffect(() => {
    // If we have saved demo session in localStorage, use it immediately
    const savedProfile = localStorage.getItem('immense_demo_profile');
    const savedUser = localStorage.getItem('immense_demo_user');
    if (savedProfile && savedUser) {
      setUser(JSON.parse(savedUser));
      setProfile(JSON.parse(savedProfile));
      setLoading(false);
      return;
    }

    // Try Supabase session
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        fetchProfile(s.user.id).then(p => {
          setProfile(p);
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
    }).catch(() => {
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, s) => {
        setSession(s);
        if (s?.user) {
          setUser(s.user);
          const p = await fetchProfile(s.user.id);
          setProfile(p);
        }
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const loginAsDemo = useCallback((role: UserRole) => {
    const demoInfo = DEMO_USERS[role];
    const mockUser: any = {
      id: demoInfo.profile.id,
      email: demoInfo.email,
      user_metadata: { full_name: demoInfo.name },
      role: 'authenticated',
      aud: 'authenticated',
    };

    localStorage.setItem('immense_demo_user', JSON.stringify(mockUser));
    localStorage.setItem('immense_demo_profile', JSON.stringify(demoInfo.profile));

    setUser(mockUser);
    setProfile(demoInfo.profile);
    setLoading(false);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    // Corporate domain validation
    if (!isValidCorporateEmail(email)) {
      return {
        error: `Only corporate email addresses (@${ALLOWED_EMAIL_DOMAIN}) are allowed.`,
      };
    }

    // Check if matching any demo accounts for instant local testing
    for (const roleKey of Object.keys(DEMO_USERS) as UserRole[]) {
      if (DEMO_USERS[roleKey].email.toLowerCase() === email.toLowerCase() && (password === 'password123' || password === 'immense123')) {
        loginAsDemo(roleKey);
        return { error: null };
      }
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { error: getReadableAuthError(error.message) };
      }

      if (data.user) {
        const p = await fetchProfile(data.user.id);
        if (p && !p.is_active) {
          await supabase.auth.signOut();
          return {
            error: 'Your account has been deactivated. Please contact your administrator.',
          };
        }
        await logAudit('login', 'auth', data.user.id);
      }

      return { error: null };
    } catch (err: any) {
      return { error: getReadableAuthError(err.message || '') };
    }
  }, [fetchProfile, loginAsDemo]);

  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
    if (!isValidCorporateEmail(email)) {
      return {
        error: `Only corporate email addresses (@${ALLOWED_EMAIL_DOMAIN}) are allowed.`,
      };
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    });

    if (error) {
      return { error: getReadableAuthError(error.message) };
    }

    return { error: null };
  }, []);

  const signOut = useCallback(async () => {
    localStorage.removeItem('immense_demo_user');
    localStorage.removeItem('immense_demo_profile');
    try {
      if (user && !user.id.startsWith('demo-')) {
        await logAudit('logout', 'auth', user.id);
      }
      await supabase.auth.signOut();
    } catch {
      // Ignore
    }
    setUser(null);
    setProfile(null);
    setSession(null);
  }, [user]);

  const resetPassword = useCallback(async (email: string) => {
    if (!isValidCorporateEmail(email)) {
      return {
        error: `Only corporate email addresses (@${ALLOWED_EMAIL_DOMAIN}) are allowed.`,
      };
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        return { error: getReadableAuthError(error.message) };
      }

      await logAudit('password_reset_requested', 'auth');
      return { error: null };
    } catch {
      return { error: null };
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        session,
        loading,
        signIn,
        signUp,
        signOut,
        resetPassword,
        refreshProfile,
        loginAsDemo,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
