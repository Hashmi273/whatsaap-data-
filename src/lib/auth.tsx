// ============================================================
// Authentication Context & Provider
// Manages user session, profile fetching, and auth state.
// Hardened against network timeouts, undefined subscriptions, and JSON errors.
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
  updateProfile: (data: Partial<Profile>) => Promise<{ error: string | null }>;
  loginAsDemo: (role: UserRole) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function isValidCorporateEmail(email: string): boolean {
  if (!email || !email.includes('@')) return false;
  const domain = email.split('@')[1]?.toLowerCase();
  const allowed = (ALLOWED_EMAIL_DOMAIN || 'immensesmartsolutions.com').toLowerCase();
  return domain === allowed;
}

function getReadableAuthError(errorMessage: string): string {
  if (!errorMessage) return 'Authentication error. Please check your credentials.';
  if (errorMessage.includes('Invalid login credentials')) {
    return 'Invalid email or password. Please check your credentials and try again.';
  }
  if (errorMessage.includes('Email not confirmed')) {
    return 'Your email has not been confirmed. Please check your inbox for a confirmation link.';
  }
  if (errorMessage.includes('corporate email') || errorMessage.includes('Registration rejected')) {
    return `Registration is restricted to corporate email addresses (@${ALLOWED_EMAIL_DOMAIN}).`;
  }
  if (errorMessage.includes('User already registered')) {
    return 'An account with this email already exists. Please sign in instead.';
  }
  if (errorMessage.includes('Too many requests')) {
    return 'Too many login attempts. Please wait a moment and try again.';
  }
  return errorMessage;
}

export const DEMO_USERS: Record<UserRole, { profile: Profile; email: string; name: string }> = {
  super_admin: {
    email: `support@${ALLOWED_EMAIL_DOMAIN}`,
    name: 'Immense Super Admin',
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
    try {
      const saved = localStorage.getItem('immense_demo_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [profile, setProfile] = useState<Profile | null>(() => {
    try {
      const saved = localStorage.getItem('immense_demo_profile');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
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
    if (user.id.startsWith('immense-') || user.id.startsWith('demo-')) {
      try {
        const saved = localStorage.getItem('immense_demo_profile');
        if (saved) setProfile(JSON.parse(saved));
      } catch {
        // ignore
      }
      return;
    }
    const p = await fetchProfile(user.id);
    if (p) setProfile(p);
  }, [user, fetchProfile]);

  useEffect(() => {
    let isMounted = true;

    // Safety timeout: ensure loading state never hangs indefinitely (max 1.5s)
    const timeoutId = setTimeout(() => {
      if (isMounted) setLoading(false);
    }, 1500);

    try {
      // 1. Check local session
      const savedProfile = localStorage.getItem('immense_demo_profile');
      const savedUser = localStorage.getItem('immense_demo_user');
      if (savedProfile && savedUser) {
        setUser(JSON.parse(savedUser));
        setProfile(JSON.parse(savedProfile));
        setLoading(false);
        clearTimeout(timeoutId);
        return;
      }
    } catch {
      // Ignore localStorage read errors
    }

    // 2. Query Supabase session
    try {
      supabase.auth.getSession().then(({ data: { session: s } }) => {
        if (!isMounted) return;
        setSession(s);
        setUser(s?.user ?? null);
        if (s?.user) {
          fetchProfile(s.user.id).then(p => {
            if (isMounted) {
              setProfile(p);
              setLoading(false);
              clearTimeout(timeoutId);
            }
          }).catch(() => {
            if (isMounted) {
              setLoading(false);
              clearTimeout(timeoutId);
            }
          });
        } else {
          setLoading(false);
          clearTimeout(timeoutId);
        }
      }).catch(() => {
        if (isMounted) {
          setLoading(false);
          clearTimeout(timeoutId);
        }
      });
    } catch {
      if (isMounted) {
        setLoading(false);
        clearTimeout(timeoutId);
      }
    }

    // 3. Listen for auth state changes with safe cleanup
    let unsubscribeFn: (() => void) | null = null;
    try {
      const { data } = supabase.auth.onAuthStateChange(
        async (_event, s) => {
          if (!isMounted) return;
          setSession(s);
          if (s?.user) {
            setUser(s.user);
            const p = await fetchProfile(s.user.id);
            if (isMounted) setProfile(p);
          } else {
            setUser(null);
            setProfile(null);
          }
          setLoading(false);
          clearTimeout(timeoutId);
        }
      );
      if (data && data.subscription) {
        unsubscribeFn = () => data.subscription.unsubscribe();
      }
    } catch {
      // Ignore
    }

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
      if (unsubscribeFn) {
        try {
          unsubscribeFn();
        } catch {
          // Ignore
        }
      }
    };
  }, [fetchProfile]);

  const loginAsDemo = useCallback((role: UserRole) => {
    const demoInfo = DEMO_USERS[role] || DEMO_USERS.super_admin;
    const mockUser: any = {
      id: demoInfo.profile.id,
      email: demoInfo.email,
      user_metadata: { full_name: demoInfo.name },
      role: 'authenticated',
      aud: 'authenticated',
    };

    try {
      localStorage.setItem('immense_demo_user', JSON.stringify(mockUser));
      localStorage.setItem('immense_demo_profile', JSON.stringify(demoInfo.profile));
    } catch {
      // Ignore
    }

    setUser(mockUser);
    setProfile(demoInfo.profile);
    setLoading(false);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const cleanEmail = email.trim().toLowerCase();
    if (!isValidCorporateEmail(cleanEmail)) {
      return {
        error: `Only corporate email addresses (@${ALLOWED_EMAIL_DOMAIN}) are allowed.`,
      };
    }

    // 1. Check custom updated user passwords store
    try {
      const userPasswords = JSON.parse(localStorage.getItem('immense_user_passwords') || '{}');
      if (userPasswords[cleanEmail]) {
        if (userPasswords[cleanEmail] === password) {
          // Identify role from custom profiles or demo users
          let userRole: UserRole = 'employee';
          let userProfile: Profile | null = null;

          const localProfiles = JSON.parse(localStorage.getItem('immense_custom_profiles') || '[]');
          const found = localProfiles.find((p: any) => p.corporate_email.toLowerCase() === cleanEmail);
          if (found) {
            userRole = found.role;
            userProfile = found;
          } else {
            const demoKey = Object.keys(DEMO_USERS).find(
              (k) => DEMO_USERS[k as UserRole].email.toLowerCase() === cleanEmail
            ) as UserRole | undefined;
            if (demoKey) {
              userRole = demoKey;
              userProfile = DEMO_USERS[demoKey].profile;
            }
          }

          if (userProfile && !userProfile.is_active) {
            return {
              error: 'Your account has been deactivated. Please contact your administrator.',
            };
          }

          if (userProfile) {
            const updatedProfile = { ...userProfile, last_login: new Date().toISOString() };
            setUser({
              id: updatedProfile.id,
              app_metadata: {},
              user_metadata: { full_name: updatedProfile.full_name },
              aud: 'authenticated',
              created_at: updatedProfile.created_at,
              email: cleanEmail,
            } as any);
            setProfile(updatedProfile);
            setLoading(false);
            try {
              localStorage.setItem('immense_demo_user', JSON.stringify({ id: updatedProfile.id, email: cleanEmail }));
              localStorage.setItem('immense_demo_profile', JSON.stringify(updatedProfile));
            } catch {
              // Ignore
            }
            await logAudit('login', 'auth', updatedProfile.id, { email: cleanEmail });
            return { error: null };
          }
        } else {
          return {
            error: 'Invalid email or password. Please check your credentials and try again.',
          };
        }
      }
    } catch {
      // Ignore
    }

    // 2. Default credentials for demo accounts (when not overridden by password reset)
    const demoKey = Object.keys(DEMO_USERS).find(
      (k) => DEMO_USERS[k as UserRole].email.toLowerCase() === cleanEmail
    ) as UserRole | undefined;

    if (
      demoKey &&
      (password === 'Admin@Immense2026!' || password === 'password123' || password === 'immense123')
    ) {
      loginAsDemo(demoKey);
      return { error: null };
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
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
      return { error: getReadableAuthError(err?.message || '') };
    }
  }, [fetchProfile, loginAsDemo]);

  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
    if (!isValidCorporateEmail(email)) {
      return {
        error: `Only corporate email addresses (@${ALLOWED_EMAIL_DOMAIN}) are allowed.`,
      };
    }

    try {
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
    } catch (err: any) {
      return { error: getReadableAuthError(err?.message || '') };
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      localStorage.removeItem('immense_demo_user');
      localStorage.removeItem('immense_demo_profile');
    } catch {
      // Ignore
    }

    try {
      if (user && !user.id.startsWith('immense-') && !user.id.startsWith('demo-')) {
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
    } catch (err: any) {
      return { error: getReadableAuthError(err?.message || '') };
    }
  }, []);

  const updateProfile = useCallback(async (data: Partial<Profile>) => {
    if (!profile) return { error: 'No active profile found.' };

    const updatedProfile: Profile = {
      ...profile,
      ...data,
      updated_at: new Date().toISOString(),
    };

    try {
      localStorage.setItem('immense_demo_profile', JSON.stringify(updatedProfile));
    } catch {
      // Ignore
    }

    setProfile(updatedProfile);

    try {
      if (profile.id && !profile.id.startsWith('immense-') && !profile.id.startsWith('demo-')) {
        await supabase
          .from('profiles')
          .update({
            full_name: updatedProfile.full_name,
            department: updatedProfile.department,
            updated_at: updatedProfile.updated_at,
          })
          .eq('id', profile.id);
      }
    } catch (err: any) {
      console.warn('DB profile update note:', err);
    }

    try {
      await logAudit('profile_updated', 'auth', profile.id, {
        full_name: updatedProfile.full_name,
        department: updatedProfile.department,
      });
    } catch {
      // Ignore
    }

    return { error: null };
  }, [profile]);

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
        updateProfile,
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
