import { Link } from 'react-router-dom';
import {
  ShieldCheck,
  HardDrive,
  FolderLock,
  Lock,
  FileText,
  Building2,
  ArrowLeft,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  HelpCircle
} from 'lucide-react';
import { APP_NAME, APP_SUBTITLE } from '@/lib/constants';

export function PrivacyPolicy() {
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
            Privacy Policy
          </span>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/terms-of-service"
            className="text-xs font-semibold text-gray-600 hover:text-blue-600 transition-colors"
          >
            Terms of Service
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
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            Enterprise Data Protection & Disaster Recovery Standards
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Privacy Policy & Data Security
          </h1>
          <p className="text-xs sm:text-sm text-blue-100/90 leading-relaxed max-w-2xl">
            Immense Smart Solutions is committed to safeguarding corporate onboarding records, KYC documents, and compliance assets with enterprise-grade encryption, private vaults, and independent cloud disaster recovery.
          </p>
          <p className="text-[11px] text-blue-200 pt-2 font-mono">
            Effective Date: January 1, 2026 • Last Reviewed: August 2026
          </p>
        </div>

        {/* Section 1: Data Collection & Scope */}
        <section className="p-6 sm:p-8 bg-white rounded-3xl border border-gray-200/80 shadow-xs space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-gray-100">
            <div className="p-2 bg-blue-50 text-[#1677FF] rounded-xl">
              <Building2 className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">1. Information We Collect & Process</h2>
          </div>

          <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">
            The IMMENSE WhatsApp & RCS Business Onboarding Portal processes corporate customer data exclusively for onboarding verification, Meta Business Account registration, carrier compliance, and lifecycle management:
          </p>

          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-gray-700 pt-1">
            <li className="p-3 bg-gray-50 rounded-xl border border-gray-100">
              <strong className="text-gray-900 block font-semibold mb-0.5">Corporate & Brand Identity:</strong>
              Brand names, registered legal entity names, GSTIN, PAN, website URLs, and authorized contact persons.
            </li>
            <li className="p-3 bg-gray-50 rounded-xl border border-gray-100">
              <strong className="text-gray-900 block font-semibold mb-0.5">Compliance Attachments:</strong>
              GST registration certificates, PAN cards, KYC identity proofs, carrier agreements, and approval letters.
            </li>
            <li className="p-3 bg-gray-50 rounded-xl border border-gray-100">
              <strong className="text-gray-900 block font-semibold mb-0.5">Brand Media Assets:</strong>
              Official WhatsApp & RCS Brand Logos (PNG/JPG) and Marketing Hero Banners.
            </li>
            <li className="p-3 bg-gray-50 rounded-xl border border-gray-100">
              <strong className="text-gray-900 block font-semibold mb-0.5">Security & Audit Logs:</strong>
              Corporate email sessions, SMS OTP authorization hashes, document download audit logs, and access timestamps.
            </li>
          </ul>
        </section>

        {/* Section 2: Google Drive Disaster Recovery Secondary Backup */}
        <section className="p-6 sm:p-8 bg-white rounded-3xl border border-gray-200/80 shadow-xs space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-gray-100">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <HardDrive className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">2. Google Drive Disaster Recovery Secondary Backup</h2>
          </div>

          <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">
            To guarantee continuous disaster recovery and secondary cloud archiving, the portal integrates with the Google Drive API using a dedicated administrative storage account:
          </p>

          <div className="p-4 bg-blue-50/60 rounded-2xl border border-blue-100 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-blue-900">Designated Secondary Archive Account:</span>
              <span className="font-mono font-bold text-[#1677FF] bg-white px-2 py-0.5 rounded-md border border-blue-200">
                parvejweb1@gmail.com
              </span>
            </div>
            <p className="text-blue-800 text-[11px] leading-relaxed">
              Google Drive serves strictly as an independent, secondary disaster-recovery archive. Supabase PostgreSQL and private storage remain the live primary source of truth.
            </p>
          </div>

          <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider pt-2">
            Automated Google Drive Folder Hierarchy:
          </h3>

          <div className="p-4 bg-gray-900 text-blue-200 font-mono text-xs rounded-2xl space-y-1 overflow-x-auto">
            <p className="text-white font-bold">IMMENSE BACKUP/</p>
            <p className="pl-4 text-emerald-400">├── WhatsApp/</p>
            <p className="pl-8 text-blue-300">└── [Company Name]/</p>
            <p className="pl-12 text-gray-300">├── GST/               (GST Certificates)</p>
            <p className="pl-12 text-gray-300">├── PAN/               (PAN Cards)</p>
            <p className="pl-12 text-gray-300">├── Logo/              (Brand Profile Logos)</p>
            <p className="pl-12 text-gray-300">├── Banner/            (Marketing Banners)</p>
            <p className="pl-12 text-gray-300">└── Other Documents/   (Compliance Approvals)</p>
            <p className="pl-4 text-emerald-400">└── RCS/</p>
            <p className="pl-8 text-blue-300">└── [Company Name]/</p>
            <p className="pl-12 text-gray-300">└── [GST, PAN, Logo, Banner, Other Documents]/</p>
          </div>

          <div className="space-y-2 text-xs text-gray-600 pt-2">
            <p>
              <strong className="text-gray-900">How Google Drive Access is Used:</strong> The API creates client-specific folders and uploads secondary backup copies of compliance files upon onboarding submission. It uses duplicate-prevention checks to update files in place without redundant clutter.
            </p>
            <p>
              <strong className="text-gray-900">Independent Disaster Recovery:</strong> In the event that web hosting or primary servers become temporarily unreachable, authorized administrators can directly access and download all client assets directly from Google Drive without reliance on portal availability.
            </p>
          </div>
        </section>

        {/* Section 3: Data Security, Encryption & Storage */}
        <section className="p-6 sm:p-8 bg-white rounded-3xl border border-gray-200/80 shadow-xs space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-gray-100">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <Lock className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">3. Storage Security & Encryption Standards</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 space-y-1">
              <span className="font-bold text-gray-900 block">AES-256 Private Vault</span>
              <p className="text-gray-600 text-[11px]">
                All compliance documents are stored in private, access-controlled Supabase storage buckets and encrypted Google Drive vaults.
              </p>
            </div>
            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 space-y-1">
              <span className="font-bold text-gray-900 block">Zero Frontend Secret Exposure</span>
              <p className="text-gray-600 text-[11px]">
                Google OAuth client secrets, refresh tokens, Supabase service keys, and SMS credentials reside strictly in server environment variables.
              </p>
            </div>
            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 space-y-1">
              <span className="font-bold text-gray-900 block">Time-Limited Signed URLs</span>
              <p className="text-gray-600 text-[11px]">
                Document previews and downloads use temporary 1-hour signed tokens generated fresh on demand.
              </p>
            </div>
          </div>
        </section>

        {/* Section 4: Data Retention & Deletion */}
        <section className="p-6 sm:p-8 bg-white rounded-3xl border border-gray-200/80 shadow-xs space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-gray-100">
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
              <FolderLock className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">4. Data Retention & Deletion Policy</h2>
          </div>

          <div className="space-y-3 text-xs sm:text-sm text-gray-600 leading-relaxed">
            <p>
              <strong className="text-gray-900">Permanent Master Record:</strong> Onboarding records, WhatsApp credentials, and compliance documents are retained permanently in Supabase and the Google Drive secondary archive until an authorized Super Admin executes an explicit, verified deletion.
            </p>
            <p>
              <strong className="text-gray-900">No Automated Expiration:</strong> There are no automated TTL routines, background deletion scripts, or silent purges. Server deployments, cache resets, or session sign-outs never delete stored data.
            </p>
            <p>
              <strong className="text-gray-900">Accidental Deletion Safeguards:</strong> Deleting a record requires two-step confirmation, role-based permission verification (`super_admin` only), and records an immutable audit log entry.
            </p>
          </div>
        </section>

        {/* Section 5: How to Revoke Google Access */}
        <section className="p-6 sm:p-8 bg-white rounded-3xl border border-gray-200/80 shadow-xs space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-gray-100">
            <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
              <HelpCircle className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">5. How to Revoke Google Drive Access</h2>
          </div>

          <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">
            Administrators may revoke or modify Google Drive OAuth permissions at any time directly through Google Account Security Settings:
          </p>

          <ol className="list-decimal list-inside space-y-1.5 text-xs text-gray-700 bg-gray-50 p-4 rounded-2xl border border-gray-100">
            <li>Visit your Google Account Security Dashboard at <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer" className="text-[#1677FF] font-semibold underline">myaccount.google.com/permissions</a>.</li>
            <li>Locate <strong>IMMENSE Onboarding Portal</strong> under <em>Third-party apps with account access</em>.</li>
            <li>Click <strong>Remove Access</strong> to immediately revoke OAuth refresh tokens and API permissions.</li>
          </ol>
        </section>

        {/* Section 6: Contact & Compliance */}
        <section className="p-6 bg-gray-50 rounded-3xl border border-gray-200 text-xs text-gray-600 space-y-2">
          <h3 className="font-bold text-gray-900 text-sm">Security & Compliance Contact</h3>
          <p>
            For privacy inquiries, audit verification requests, or data protection assistance, contact the Immense Information Security Office:
          </p>
          <div className="pt-1 font-mono text-gray-800 space-y-0.5">
            <p>Email: <a href="mailto:support@immensesmartsolutions.com" className="text-[#1677FF]">support@immensesmartsolutions.com</a></p>
            <p>Admin Email: <a href="mailto:hashmimdparvej78654@gmail.com" className="text-[#1677FF]">hashmimdparvej78654@gmail.com</a></p>
            <p>Immense Smart Solutions • Smart Business Communication Portal</p>
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

export default PrivacyPolicy;
