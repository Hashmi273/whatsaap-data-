import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/lib/auth';
import { ToastProvider } from '@/lib/toast';
import { ProtectedRoute } from '@/components/shared/ProtectedRoute';

import { Login } from '@/pages/Login';
import { Dashboard } from '@/pages/Dashboard';

const OnboardingList = lazy(() => import('@/pages/OnboardingList').then((m) => ({ default: m.OnboardingList })));
const OnboardingDetail = lazy(() => import('@/pages/OnboardingDetail').then((m) => ({ default: m.OnboardingDetail })));
const OnboardingForm = lazy(() => import('@/pages/OnboardingForm').then((m) => ({ default: m.OnboardingForm })));
const DocumentVault = lazy(() => import('@/pages/DocumentVault').then((m) => ({ default: m.DocumentVault })));
const DocumentSearch = lazy(() => import('@/pages/DocumentSearch').then((m) => ({ default: m.DocumentSearch })));
const TeamAccess = lazy(() => import('@/pages/TeamAccess').then((m) => ({ default: m.TeamAccess })));
const ActivityLogs = lazy(() => import('@/pages/ActivityLogs').then((m) => ({ default: m.ActivityLogs })));
const Profile = lazy(() => import('@/pages/Profile').then((m) => ({ default: m.Profile })));
const Settings = lazy(() => import('@/pages/Settings').then((m) => ({ default: m.Settings })));
const ResetPassword = lazy(() => import('@/pages/ResetPassword').then((m) => ({ default: m.ResetPassword })));
const RcsList = lazy(() => import('@/pages/RcsList').then((m) => ({ default: m.RcsList })));
const RcsDetail = lazy(() => import('@/pages/RcsDetail').then((m) => ({ default: m.RcsDetail })));
const RcsForm = lazy(() => import('@/pages/RcsForm').then((m) => ({ default: m.RcsForm })));
const DisasterRecovery = lazy(() => import('@/pages/DisasterRecovery').then((m) => ({ default: m.DisasterRecovery })));
const MetaAssetRegistry = lazy(() => import('@/pages/MetaAssetRegistry').then((m) => ({ default: m.MetaAssetRegistry })));
const PrivacyPolicy = lazy(() => import('@/pages/PrivacyPolicy').then((m) => ({ default: m.PrivacyPolicy })));
const TermsOfService = lazy(() => import('@/pages/TermsOfService').then((m) => ({ default: m.TermsOfService })));

const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 30000 } } });

function PageLoader() { return <div className="flex items-center justify-center min-h-screen bg-[#F8FAFC]"><div className="w-8 h-8 border-3 border-blue-200 border-t-[#1677FF] rounded-full animate-spin" /></div>; }

export function App() {
  return <QueryClientProvider client={queryClient}><AuthProvider><ToastProvider><BrowserRouter><Suspense fallback={<PageLoader />}><Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/reset-password" element={<ResetPassword />} />
    <Route path="/privacy-policy" element={<PrivacyPolicy />} />
    <Route path="/terms-of-service" element={<TermsOfService />} />
    <Route element={<ProtectedRoute />}>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/onboarding" element={<OnboardingList />} />
      <Route path="/onboarding/:id" element={<OnboardingDetail />} />
      <Route path="/rcs" element={<RcsList />} />
      <Route path="/rcs/:id" element={<RcsDetail />} />
      <Route path="/documents" element={<DocumentVault />} />
      <Route path="/documents/search" element={<DocumentSearch />} />
      <Route path="/backup" element={<DisasterRecovery />} />
      <Route path="/meta-assets" element={<MetaAssetRegistry />} />
      <Route path="/profile" element={<Profile />} />
    </Route>
    <Route element={<ProtectedRoute allowedRoles={['super_admin', 'manager', 'employee']} />}>
      <Route path="/onboarding/new" element={<OnboardingForm />} />
      <Route path="/onboarding/:id/edit" element={<OnboardingForm />} />
      <Route path="/rcs/new" element={<RcsForm />} />
      <Route path="/rcs/:id/edit" element={<RcsForm />} />
    </Route>
    <Route element={<ProtectedRoute allowedRoles={['super_admin', 'manager']} />}><Route path="/activity" element={<ActivityLogs />} /></Route>
    <Route element={<ProtectedRoute allowedRoles={['super_admin']} />}><Route path="/team" element={<TeamAccess />} /><Route path="/settings" element={<Settings />} /></Route>
    <Route path="*" element={<Navigate to="/dashboard" replace />} />
  </Routes></Suspense></BrowserRouter></ToastProvider></AuthProvider></QueryClientProvider>;
}

export default App;
