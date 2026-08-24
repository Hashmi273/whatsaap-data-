import { useState, type ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

interface PageLayoutProps {
  title: string;
  children: ReactNode;
}

export function PageLayout({ title, children }: PageLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <Sidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

      <div className="lg:pl-72 flex flex-col min-h-screen">
        <Header title={title} onMenuClick={() => setSidebarOpen(true)} />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>

        <footer className="py-4 px-6 border-t border-gray-200 bg-white text-center text-xs text-gray-500">
          <p>© {new Date().getFullYear()} Immense Smart Solutions. Enterprise WhatsApp Business Onboarding Vault. Confidential & Proprietary.</p>
        </footer>
      </div>
    </div>
  );
}

export default PageLayout;
