import { Link } from 'react-router-dom';
import {
  FileCheck2,
  ShieldAlert,
  HardDrive,
  UserCheck,
  Building2,
  Lock,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Scale
} from 'lucide-react';
import { APP_NAME, APP_SUBTITLE, ALLOWED_EMAIL_DOMAIN } from '@/lib/constants';

export function TermsOfService() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] text-gray-900 flex flex-col">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-gray-200 px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/login" className="flex items-center gap-2.5">
            <img src="/logo.jpg" alt="Logo" className="w-8 h-8 rounded-lg shadow-2xs" />
            <div>
              <span className="font-extrabold text-sm tracking-tight text-[#071A3D]">{APP_NAME}</span>
              <span className="text-[10px] text-gray-500 block -mt-0.5">{APP_SUBTITLE}</span>
            </div>
          </Link>
          <span className="hidden sm:inline text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
            Terms of Service
          </span>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/privacy-policy"
            className="text-xs font-semibold text-gray-600 hover:text-blue-600 transition-colors"
          >
            Privacy Policy
          </Link>
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-[#1677FF] hover:bg-[#0B5FE0] rounded-xl transition-all shadow-2xs"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Portal Sign In
          </Link>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-10 space-y-8">
        {/* Title Banner */}
        <div className="p-8 bg-linear-to-r from-[#071A3D] via-[#0B2A6B] to-[#1677FF] rounded-3xl text-white shadow-xl space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-xs font-semibold backdrop-blur-xs">
            <Scale className="w-4 h-4 text-emerald-400" />
            Enterprise Terms & Acceptable Use Governance
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Terms of Service & Portal Guidelines
          </h1>
          <p className="text-xs sm:text-sm text-blue-100/90 leading-relaxed max-w-2xl">
            These Terms of Service govern the authorized use of the Immense Smart Solutions WhatsApp Business & RCS Onboarding Portal, document vaults, and cloud disaster recovery backup services.
          </p>
          <p className="text-[11px] text-blue-200 pt-2 font-mono">
            Effective Date: January 1, 2026 • Last Reviewed: August 2026
          </p>
        </div>

        {/* Section 1: Acceptance & Authorization */}
        <section className="p-6 sm:p-8 bg-white rounded-3xl border border-gray-200/80 shadow-xs space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-gray-100">
            <div className="p-2 bg-blue-50 text-[#1677FF] rounded-xl">
              <UserCheck className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">1. Authorized Access & Corporate Eligibility</h2>
          </div>

          <div className="space-y-3 text-xs sm:text-sm text-gray-600 leading-relaxed">
            <p>
              Access to this portal is strictly restricted to authorized staff, managers, and executives of <strong>Immense Smart Solutions</strong> and affiliated enterprise onboarding partners.
            </p>
            <p>
              Users must authenticate using a verified corporate email address (<span className="font-mono font-bold text-gray-900">@{ALLOWED_EMAIL_DOMAIN}</span>). Unauthorized attempts to register, access, or probe the portal without valid credentials will be logged and reported.
            </p>
          </div>
        </section>

        {/* Section 2: Account Security & SMS OTP Verification */}
        <section className="p-6 sm:p-8 bg-white rounded-3xl border border-gray-200/80 shadow-xs space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-gray-100">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <Lock className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">2. Account Responsibilities & Security Verification</h2>
          </div>

          <div className="space-y-3 text-xs sm:text-sm text-gray-600 leading-relaxed">
            <p>
              Users are responsible for maintaining the confidentiality of their login credentials. All actions performed under an authenticated account are recorded in an immutable compliance audit trail (`audit_logs`).
            </p>
            <p>
              <strong className="text-gray-900">Super Admin SMS OTP Security:</strong> Sensitive administrative actions—including staff password resets and privilege alterations—require real-time single-dispatch SMS OTP verification to the designated Super Admin security mobile number via our gateway.
            </p>
          </div>
        </section>

        {/* Section 3: Document Uploads & Compliance Governance */}
        <section className="p-6 sm:p-8 bg-white rounded-3xl border border-gray-200/80 shadow-xs space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-gray-100">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <FileCheck2 className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">3. Document Uploads & Client Information Standards</h2>
          </div>

          <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">
            When submitting WhatsApp Business or RCS onboarding records, users agree to provide authentic and verified business compliance materials:
          </p>

          <ul className="list-disc list-inside space-y-2 text-xs text-gray-700 pt-1">
            <li><strong>Authentic KYC & GST Data:</strong> All GST registration certificates, PAN cards, and business entity documents must be genuine and currently active with tax authorities.</li>
            <li><strong>Official Brand Media:</strong> Uploaded logos and marketing hero banners must be authorized by the respective brand owner for WhatsApp / RCS business messaging.</li>
            <li><strong>Prohibited Content:</strong> Users shall not upload malicious files, unverified third-party documents, or unencrypted confidential credentials outside the designated platform security fields.</li>
          </ul>
        </section>

        {/* Section 4: Google Drive Disaster Recovery Secondary Archive */}
        <section className="p-6 sm:p-8 bg-white rounded-3xl border border-gray-200/80 shadow-xs space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-gray-100">
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
              <HardDrive className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">4. Google Drive Disaster Recovery Secondary Archive Terms</h2>
          </div>

          <div className="space-y-3 text-xs sm:text-sm text-gray-600 leading-relaxed">
            <p>
              The portal features an integrated secondary cloud archive powered by the Google Drive API, maintaining structured company folders under <span className="font-mono text-gray-900 font-semibold">IMMENSE BACKUP/</span> on Google Account <span className="font-mono font-bold text-[#1677FF]">parvejweb1@gmail.com</span>.
            </p>
            <p>
              <strong className="text-gray-900">Secondary Archive Role:</strong> Google Drive acts as a disaster-recovery mirror. Primary live operations and access control reside in Supabase PostgreSQL and private vaults.
            </p>
            <p>
              <strong className="text-gray-900">Non-Blocking Resilience:</strong> In the unlikely event of secondary Google API throttling or temporary token renewal delay, primary onboarding records and document uploads will safely commit to Supabase without blocking operational workflows. Administrators may trigger "Retry Backup" at any time.
            </p>
          </div>
        </section>

        {/* Section 5: Intellectual Property & Data Ownership */}
        <section className="p-6 sm:p-8 bg-white rounded-3xl border border-gray-200/80 shadow-xs space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-gray-100">
            <div className="p-2 bg-purple-50 text-purple-600 rounded-xl">
              <Building2 className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">5. Data Ownership & Intellectual Property</h2>
          </div>

          <div className="space-y-3 text-xs sm:text-sm text-gray-600 leading-relaxed">
            <p>
              All trademarks, logos, brand assets, and customer compliance documents uploaded to the portal remain the intellectual property of their respective corporate owners.
            </p>
            <p>
              Immense Smart Solutions retains full intellectual property rights to the portal codebase, UI architecture, security mechanisms, and serverless infrastructure.
            </p>
          </div>
        </section>

        {/* Section 6: Limitation of Liability */}
        <section className="p-6 sm:p-8 bg-white rounded-3xl border border-gray-200/80 shadow-xs space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-gray-100">
            <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">6. Service Continuity & Limitations</h2>
          </div>

          <div className="space-y-3 text-xs sm:text-sm text-gray-600 leading-relaxed">
            <p>
              While Immense Smart Solutions employs multi-tier redundancy (Supabase primary + Google Drive disaster recovery), approval timelines for WhatsApp Business Accounts and RCS Agent IDs are subject to external review by Meta Platforms, Google Jibe, and telecom carriers.
            </p>
            <p>
              The portal is provided on an enterprise-grade basis to facilitate secure communication onboarding.
            </p>
          </div>
        </section>

        {/* Section 7: Contact & Governance */}
        <section className="p-6 bg-gray-50 rounded-3xl border border-gray-200 text-xs text-gray-600 space-y-2">
          <h3 className="font-bold text-gray-900 text-sm">Legal & Operations Contact</h3>
          <p>
            For questions regarding these Terms of Service, carrier compliance, or corporate agreements, contact:
          </p>
          <div className="pt-1 font-mono text-gray-800 space-y-0.5">
            <p>Email: <a href="mailto:support@immensesmartsolutions.com" className="text-[#1677FF]">support@immensesmartsolutions.com</a></p>
            <p>Admin Email: <a href="mailto:hashmimdparvej78654@gmail.com" className="text-[#1677FF]">hashmimdparvej78654@gmail.com</a></p>
            <p>Immense Smart Solutions • Enterprise Compliance Division</p>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-6 px-4 text-center text-xs text-gray-500 space-y-2">
        <div className="flex justify-center gap-6 text-xs font-semibold text-gray-600">
          <Link to="/privacy-policy" className="hover:text-blue-600">Privacy Policy</Link>
          <Link to="/terms-of-service" className="hover:text-blue-600">Terms of Service</Link>
          <Link to="/login" className="hover:text-blue-600">Portal Sign In</Link>
        </div>
        <p>© {new Date().getFullYear()} Immense Smart Solutions. Enterprise WhatsApp & RCS Onboarding Vault. Confidential & Proprietary.</p>
      </footer>
    </div>
  );
}

export default TermsOfService;
