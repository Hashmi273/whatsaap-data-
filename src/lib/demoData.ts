import type { OnboardingRecord } from '@/types/database';

// Production Acceptance Mode — All old demo and test records cleaned.
// Initialized to empty arrays so real Supabase database records are the sole source of truth.
export const INITIAL_DEMO_ONBOARDINGS: OnboardingRecord[] = [];

export const INITIAL_DEMO_DOCUMENTS: any[] = [];
