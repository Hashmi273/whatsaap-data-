import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import type { UserRole } from '@/types/database';
import { ShieldX, UserX } from 'lucide-react';

interface ProtectedRouteProps {
  allowedRoles?: UserRole[];
}

export function ProtectedRoute({ allowedRoles }: ProtectedRouteProps) {
  const { user, profile, loading, signOut } = useAuth();

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#F8FAFC]">
        <div className="w-10 h-10 border-3 border-blue-200 border-t-[#1677FF] rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium text-gray-600">Verifying session & enterprise credentials...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Deactivated user check (RLS also restricts queries, this provides clean UX)
  if (profile && !profile.is_active) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4 bg-gray-50">
        <div className="max-w-md p-8 text-center bg-white border border-red-200 rounded-2xl shadow-xl">
          <div className="flex items-center justify-center w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 text-red-600">
            <UserX className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">Account Deactivated</h2>
          <p className="mt-2 text-sm text-gray-600">
            Your corporate access has been revoked or suspended by the organization administrator.
            Company records remain securely preserved.
          </p>
          <button
            onClick={() => signOut()}
            className="w-full px-4 py-2 mt-6 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  // Role permissions check
  if (allowedRoles && profile?.role && !allowedRoles.includes(profile.role)) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4 bg-gray-50">
        <div className="max-w-md p-8 text-center bg-white border border-amber-200 rounded-2xl shadow-xl">
          <div className="flex items-center justify-center w-16 h-16 mx-auto mb-4 rounded-full bg-amber-100 text-amber-600">
            <ShieldX className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">Access Restricted</h2>
          <p className="mt-2 text-sm text-gray-600">
            You do not have the required administrative role to view this module.
          </p>
          <button
            onClick={() => window.history.back()}
            className="w-full px-4 py-2 mt-6 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return <Outlet />;
}

export default ProtectedRoute;
