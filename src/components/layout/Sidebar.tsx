import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  MessageSquare,
  Radio,
  FolderLock,
  Search,
  Users,
  ScrollText,
  Settings,
  LogOut,
  X,
  Building2,
  Network
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { formatRoleLabel, ROLE_COLORS } from '@/types/database';

interface SidebarProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

export function Sidebar({ sidebarOpen, setSidebarOpen }: SidebarProps) {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const navGroups = [
    {
      label: 'Main',
      items: [
        { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, show: true },
      ],
    },
    {
      label: 'Clients',
      items: [
        { to: '/onboarding', label: 'WhatsApp Onboarding', icon: MessageSquare, show: true },
        { to: '/meta-assets', label: 'Meta & WhatsApp Assets', icon: Network, show: true },
        { to: '/rcs', label: 'RCS Onboarding', icon: Radio, show: true },
      ],
    },
    {
      label: 'Documents',
      items: [
        { to: '/documents', label: 'Document Vault', icon: FolderLock, show: true },
        { to: '/documents/search', label: 'Document Search', icon: Search, show: true },
      ],
    },
    {
      label: 'Operations',
      items: [
        { to: '/activity', label: 'Activity Logs', icon: ScrollText, show: hasPermission(profile?.role, 'audit:view_all') },
        { to: '/team', label: 'Team & Access', icon: Users, show: hasPermission(profile?.role, 'employee:manage') },
      ],
    },
    {
      label: 'System',
      items: [
        { to: '/settings', label: 'Settings', icon: Settings, show: hasPermission(profile?.role, 'settings:manage') },
      ],
    },
  ];

  return (
    <>
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar sidebar */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 flex flex-col w-72 bg-[#071A3D] text-white border-r border-[#0C2A5A] transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo & Portal Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg overflow-hidden bg-white flex items-center justify-center p-0.5 shadow-xs">
              <img
                src="/logo.jpg"
                alt="Immense Logo"
                className="w-full h-full object-contain"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-lg tracking-wider text-white">IMMENSE</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/30 text-blue-300 font-semibold border border-blue-400/30">
                  PORTAL
                </span>
              </div>
              <p className="text-[11px] text-gray-300 leading-tight">
                Smart Communication Solutions
              </p>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-1 text-gray-400 hover:text-white lg:hidden rounded-lg hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Items */}
        <div className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
          {navGroups.map((group, groupIndex) => {
            const visibleItems = group.items.filter((item) => item.show);
            if (visibleItems.length === 0) return null;

            return (
              <div key={group.label} className={groupIndex > 0 ? "mt-4" : ""}>
                <div className={`px-3 ${groupIndex === 0 ? 'pb-1.5' : 'pt-4 pb-1.5'} text-[10px] font-semibold tracking-widest text-gray-500 uppercase`}>
                  {group.label}
                </div>
                <div className="space-y-1">
                  {visibleItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={() => setSidebarOpen(false)}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                            isActive
                              ? 'bg-[#1677FF] text-white shadow-xs font-semibold'
                              : 'text-gray-300 hover:bg-white/10 hover:text-white'
                          }`
                        }
                      >
                        <Icon className="w-4 h-4 flex-shrink-0" />
                        <span>{item.label}</span>
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Security & Access Badge */}
        <div className="px-4 py-3 mx-3 mb-2 rounded-lg bg-white/5 border border-white/10">
          <div className="flex items-center gap-2 text-xs text-blue-300">
            <Building2 className="w-3.5 h-3.5 text-blue-400" />
            <span className="font-medium">Company Vault Protected</span>
          </div>
          <p className="text-[11px] text-gray-400 mt-1">
            Role-Based Row Level Security Active
          </p>
        </div>

        {/* User Profile Footer */}
        <div className="p-4 border-t border-white/10 bg-[#061533]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-[#1677FF] to-[#0B5FE0] text-white font-semibold flex items-center justify-center text-sm shadow-xs flex-shrink-0">
                {profile?.full_name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {profile?.full_name || 'Authenticated User'}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      profile?.role
                        ? ROLE_COLORS[profile.role].bg + ' ' + ROLE_COLORS[profile.role].text
                        : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {profile?.role ? formatRoleLabel(profile.role) : 'Employee'}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={handleSignOut}
              title="Sign Out"
              className="p-2 text-gray-400 hover:text-red-400 hover:bg-white/5 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
