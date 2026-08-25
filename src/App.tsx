import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/lib/auth';
import { ToastProvider } from '@/lib/toast';
import { ProtectedRoute } from '@/components/shared/ProtectedRoute';

// Pages
import { Login } from '@/pages/Login';
import { Dashboard } from '@/pages/Dashboard';
import { OnboardingList } from '@/pages/OnboardingList';
import { OnboardingDetail } from '@/pages/OnboardingDetail';
import { OnboardingForm } from '@/pages/OnboardingForm';
import { DocumentVault } from '@/pages/DocumentVault';
import { DocumentSearch } from '@/pages/DocumentSearch';
import { TeamAccess } from '@/pages/TeamAccess';
import { ActivityLogs } from '@/pages/ActivityLogs';
import { Profile } from '@/pages/Profile';
import { Settings } from '@/pages/Settings';
import { ResetPassword } from '@/pages/ResetPassword';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30000,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
              {/* Public Routes */}
              <Route path="/login" element={<Login />} />
              <Route path="/reset-password" element={<ResetPassword />} />

              {/* Protected Authenticated Routes */}
              <Route element={<ProtectedRoute />}>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/onboarding" element={<OnboardingList />} />
                <Route path="/onboarding/:id" element={<OnboardingDetail />} />
                <Route path="/documents" element={<DocumentVault />} />
                <Route path="/documents/search" element={<DocumentSearch />} />
                <Route path="/profile" element={<Profile />} />
              </Route>

              {/* Protected Admin/Manager Routes */}
              <Route element={<ProtectedRoute allowedRoles={['super_admin', 'manager']} />}>
                <Route path="/onboarding/new" element={<OnboardingForm />} />
                <Route path="/onboarding/:id/edit" element={<OnboardingForm />} />
                <Route path="/activity" element={<ActivityLogs />} />
              </Route>

              {/* Protected Super Admin Only Routes */}
              <Route element={<ProtectedRoute allowedRoles={['super_admin']} />}>
                <Route path="/team" element={<TeamAccess />} />
                <Route path="/settings" element={<Settings />} />
              </Route>

              {/* Catch all fallback */}
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
