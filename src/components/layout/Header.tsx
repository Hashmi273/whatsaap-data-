import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, Search, User, LogOut, Shield, ChevronDown } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { formatRoleLabel } from '@/types/database';

interface HeaderProps {
  title: string;
  onMenuClick: () => void;
  onSearch?: (query: string) => void;
}

export function Header({ title, onMenuClick }: HeaderProps) {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchTerm.trim()) {
      navigate(`/documents/search?q=${encodeURIComponent(searchTerm.trim())}`);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-4 bg-white border-b border-gray-200 sm:px-6 lg:px-8">
      {/* Left side: Hamburger + Page Title */}
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuClick}
          className="p-2 text-gray-500 rounded-lg hover:bg-gray-100 lg:hidden focus:outline-hidden"
          aria-label="Open sidebar"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">{title}</h1>
        </div>
      </div>

      {/* Global Quick Search */}
      <div className="hidden md:flex flex-1 max-w-md mx-6">
        <form onSubmit={handleSearchSubmit} className="relative w-full">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Quick search brands, GST, records..."
            className="w-full pl-9 pr-4 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-[#1677FF] focus:border-transparent transition-all placeholder:text-gray-400"
          />
        </form>
      </div>

      {/* Right side: User Profile dropdown */}
      <div className="relative">
        <button
          onClick={() => setUserDropdownOpen(!userDropdownOpen)}
          className="flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-gray-50 transition-colors focus:outline-hidden"
        >
          <div className="w-8 h-8 rounded-full bg-[#071A3D] text-white flex items-center justify-center text-xs font-semibold">
            {profile?.full_name?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div className="hidden sm:block text-left">
            <p className="text-xs font-semibold text-gray-900 leading-tight">
              {profile?.full_name || 'User'}
            </p>
            <p className="text-[11px] text-gray-500">
              {profile?.role ? formatRoleLabel(profile.role) : 'Employee'}
            </p>
          </div>
          <ChevronDown className="w-4 h-4 text-gray-400 hidden sm:block" />
        </button>

        {userDropdownOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setUserDropdownOpen(false)}
            />
            <div className="absolute right-0 z-50 w-56 mt-2 origin-top-right bg-white rounded-xl shadow-lg ring-1 ring-black/5 divide-y divide-gray-100 focus:outline-hidden py-1">
              <div className="px-4 py-3">
                <p className="text-xs text-gray-500">Signed in as</p>
                <p className="text-sm font-semibold text-gray-900 truncate">
                  {profile?.corporate_email}
                </p>
                <span className="inline-block mt-1 text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700">
                  {profile?.role ? formatRoleLabel(profile.role) : 'Employee'}
                </span>
              </div>
              <div className="py-1">
                <button
                  onClick={() => {
                    setUserDropdownOpen(false);
                    navigate('/profile');
                  }}
                  className="flex items-center w-full gap-2.5 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <User className="w-4 h-4 text-gray-400" />
                  My Profile
                </button>
              </div>
              <div className="py-1">
                <button
                  onClick={handleSignOut}
                  className="flex items-center w-full gap-2.5 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  <LogOut className="w-4 h-4 text-red-500" />
                  Sign Out
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </header>
  );
}

export default Header;
