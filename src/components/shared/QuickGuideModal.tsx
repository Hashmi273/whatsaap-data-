import { useState } from 'react';
import {
  X,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  LayoutDashboard,
  MessageSquare,
  Radio,
  FolderLock,
  Search,
  Users,
  ScrollText,
  Settings,
  Sparkles,
  ShieldCheck,
  HelpCircle,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';

interface QuickGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface GuideStep {
  id: string;
  title: string;
  badge: string;
  icon: any;
  color: string;
  bgColor: string;
  borderColor: string;
  summary: string;
  points: string[];
}

export function QuickGuideModal({ isOpen, onClose }: QuickGuideModalProps) {
  const { user, profile } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);

  if (!isOpen) return null;

  const role = profile?.role || 'employee';

  const steps: GuideStep[] = [
    {
      id: 'dashboard',
      title: 'Enterprise Dashboard',
      badge: 'Command Center',
      icon: LayoutDashboard,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
      summary: 'Your central hub for tracking onboarding progress, key performance metrics, and quick operational actions.',
      points: [
        'View overall onboarding activity across WhatsApp and RCS channels',
        'Track live, pending, in-progress, and completed client onboardings',
        'Access fast shortcuts for new client registrations and document uploads',
      ],
    },
    {
      id: 'whatsapp',
      title: 'WhatsApp Onboarding',
      badge: 'Client Lifecycle',
      icon: MessageSquare,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
      borderColor: 'border-emerald-200',
      summary: 'End-to-end WhatsApp Business API account registration, Meta Business compliance, and lifecycle tracking.',
      points: [
        'Create complete WhatsApp Business onboarding records for client brands',
        'Store verified phone numbers, Meta Business Manager IDs, and platform links',
        'Upload required KYC, GST, PAN, and business compliance documents',
        'Track real-time status transitions from Pending to In Progress to Live',
      ],
    },
    {
      id: 'rcs',
      title: 'RCS Onboarding',
      badge: 'Next-Gen Messaging',
      icon: Radio,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
      borderColor: 'border-purple-200',
      summary: 'Dedicated Rich Communication Services (RCS) onboarding with asset management and brand verification.',
      points: [
        'Create RCS client records with GST, PAN, company website, and contact profiles',
        'Upload and preview dedicated RCS Brand Logos (JPG, PNG, WebP)',
        'Upload and preview high-resolution RCS Banner / Hero Images',
        'Securely download original creative assets and compliance attachments anytime',
      ],
    },
    {
      id: 'vault',
      title: 'Document Vault',
      badge: 'Secure Storage',
      icon: FolderLock,
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50',
      borderColor: 'border-indigo-200',
      summary: 'Private, encrypted repository for all client compliance files, KYC documents, and business agreements.',
      points: [
        'Securely store GST Certificates, PAN Cards, KYC, Agreements, and meta assets',
        'Instant multi-format document preview for PDFs, images, and documents',
        'Download original files with genuine signed tokens and filename preservation',
        'Role-gated document deletion strictly protected by permission policies',
      ],
    },
    {
      id: 'search',
      title: 'Global Document Search',
      badge: 'Fast Discovery',
      icon: Search,
      color: 'text-amber-600',
      bgColor: 'bg-amber-50',
      borderColor: 'border-amber-200',
      summary: 'Quickly find any client file or verification record across the entire enterprise vault in milliseconds.',
      points: [
        'Search documents by brand name, company name, or specific document title',
        'Filter by category (GST, PAN, KYC, Meta Approvals, Agreements)',
        'Filter by date range and view instant preview/download actions',
      ],
    },
    {
      id: 'team',
      title: 'Team & Access Control',
      badge: 'User Management',
      icon: Users,
      color: 'text-rose-600',
      bgColor: 'bg-rose-50',
      borderColor: 'border-rose-200',
      summary: 'Role-based access governance and high-security credential management for your enterprise team.',
      points: [
        'View team members, assigned departments, and operational roles',
        role === 'super_admin'
          ? 'Reset staff passwords securely using Super Admin SMS OTP verification'
          : 'Role-enforced permission controls protect sensitive corporate operations',
        'Manage account activation states and reassign client accounts seamlessly',
      ],
    },
    {
      id: 'activity',
      title: 'Activity & Audit Logs',
      badge: 'Compliance & Tracking',
      icon: ScrollText,
      color: 'text-cyan-600',
      bgColor: 'bg-cyan-50',
      borderColor: 'border-cyan-200',
      summary: 'Immutable audit trail capturing all system events, data updates, and security authorizations.',
      points: [
        'Track sign-in sessions, onboarding record creation, and status transitions',
        'Monitor document uploads, views, and downloads for audit compliance',
        'Verify Super Admin SMS OTP verifications and password reset events',
      ],
    },
    {
      id: 'settings',
      title: 'Profile, Security & Help',
      badge: "You're All Set!",
      icon: Settings,
      color: 'text-blue-700',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
      summary: 'Personalize your workspace and access help whenever you need assistance.',
      points: [
        'View and update personal profile information and department settings',
        'Manage password changes and active session security',
        'Reopen this Quick Guide anytime by clicking the Help icon in the top header',
      ],
    },
  ];

  const current = steps[currentStep];
  const isLast = currentStep === steps.length - 1;

  const handleFinish = () => {
    if (user?.id) {
      try {
        localStorage.setItem(`portal_guide_completed_${user.id}`, 'true');
        localStorage.setItem('portal_guide_completed', 'true');
      } catch {
        // Ignore
      }
    }
    onClose();
  };

  const handleNext = () => {
    if (isLast) {
      handleFinish();
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const StepIcon = current.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Top Header Banner */}
        <div className="relative bg-gradient-to-r from-[#071A3D] via-[#0C2A5A] to-[#1677FF] p-6 text-white overflow-hidden">
          <div className="absolute right-0 top-0 w-48 h-48 bg-white/10 rounded-full blur-2xl pointer-events-none" />

          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-blue-300" />
              </div>
              <div>
                <h3 className="text-base font-bold tracking-wide flex items-center gap-2">
                  IMMENSE Portal Quick Guide
                </h3>
                <p className="text-xs text-blue-200">Step {currentStep + 1} of {steps.length}</p>
              </div>
            </div>

            <button
              onClick={handleFinish}
              className="p-1.5 rounded-full text-blue-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="Close Guide"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Progress bar */}
          <div className="mt-4 w-full bg-white/20 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-blue-400 h-full rounded-full transition-all duration-300 ease-out"
              style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Step Content Area */}
        <div className="p-6 md:p-8 space-y-6 overflow-y-auto flex-1">
          {/* Badge & Icon Title */}
          <div className="flex items-start gap-4">
            <div className={`w-14 h-14 rounded-2xl ${current.bgColor} ${current.borderColor} border flex items-center justify-center shrink-0 shadow-xs`}>
              <StepIcon className={`w-7 h-7 ${current.color}`} />
            </div>
            <div className="space-y-1">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-700">
                {current.badge}
              </span>
              <h4 className="text-xl font-bold text-gray-900">{current.title}</h4>
            </div>
          </div>

          {/* Summary */}
          <p className="text-sm text-gray-600 leading-relaxed bg-gray-50/80 p-3.5 rounded-2xl border border-gray-100">
            {current.summary}
          </p>

          {/* Feature Points */}
          <div className="space-y-2.5">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Key Highlights</p>
            <div className="space-y-2">
              {current.points.map((point, idx) => (
                <div key={idx} className="flex items-start gap-2.5 text-xs text-gray-700">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span className="leading-relaxed font-medium">{point}</span>
                </div>
              ))}
            </div>
          </div>

          {isLast && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-2xl flex items-center gap-3 text-xs text-blue-900">
              <HelpCircle className="w-5 h-5 text-blue-600 shrink-0" />
              <span>
                <strong>Tip:</strong> You can reopen this Quick Guide anytime by clicking the <strong>Help</strong> icon in the portal header.
              </span>
            </div>
          )}
        </div>

        {/* Footer Controls */}
        <div className="p-4 md:px-8 md:py-4 bg-gray-50/80 border-t border-gray-100 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleFinish}
            className="text-xs font-semibold text-gray-500 hover:text-gray-800 transition-colors px-3 py-2 cursor-pointer"
          >
            Skip Tour
          </button>

          <div className="flex items-center gap-2">
            {currentStep > 0 && (
              <button
                type="button"
                onClick={handleBack}
                className="inline-flex items-center gap-1 px-3.5 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-all shadow-2xs cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Back
              </button>
            )}

            <button
              type="button"
              onClick={handleNext}
              className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-xs cursor-pointer"
            >
              {isLast ? (
                <>
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Get Started
                </>
              ) : (
                <>
                  Next
                  <ChevronRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
