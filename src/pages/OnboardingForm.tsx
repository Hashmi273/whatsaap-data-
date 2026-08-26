import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Building2,
  Phone,
  Mail,
  User,
  Shield,
  KeyRound,
  Globe,
  FileText,
  Calendar,
  Save,
  CheckCircle2,
  AlertCircle,
  UploadCloud,
  FolderLock,
  Send,
  Eye,
  EyeOff
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { PageLayout } from '@/components/layout/PageLayout';
import { SubmissionSuccessModal } from '@/components/shared/SubmissionSuccessModal';
import { logAudit } from '@/lib/audit';
import { useToast } from '@/lib/toast';
import { isValidUuid, generateUuid } from '@/lib/constants';
import { STATUS_OPTIONS, MAX_FILE_SIZE } from '@/types/database';
import type { OnboardingRecord, Profile, DocumentCategory } from '@/types/database';
import { format } from 'date-fns';

import { uploadDocumentToStorage, saveDocumentMetadata } from '@/lib/storage';

const onboardingSchema = z.object({
  brand_name: z.string().min(1, 'Brand Name is required'),
  company_name: z.string().optional(),
  whatsapp_number: z.string().min(5, 'Valid WhatsApp phone number is required (e.g. +91 98450 12345)'),
  contact_person: z.string().optional(),
  contact_email: z.string().optional(),
  contact_number: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  platform: z.string().optional(),
  login_url: z.string().optional(),
  status: z.enum(['draft', 'submitted', 'pending', 'in_progress', 'live', 'rejected', 'completed', 'inactive']),
  assigned_to: z.string().optional(),
  onboarding_date: z.string().optional(),
  notes: z.string().optional(),
});

type OnboardingFormData = z.infer<typeof onboardingSchema>;

export function OnboardingForm() {
  const { id } = useParams<{ id: string }>();
  const isEditing = Boolean(id);
  const { profile } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();

  // Document Uploads during onboarding submission (All 5 Categories)
  const [gstFile, setGstFile] = useState<File | null>(null);
  const [panFile, setPanFile] = useState<File | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [otherDocFile, setOtherDocFile] = useState<File | null>(null);
  const [showFormPassword, setShowFormPassword] = useState(false);

  // Success Modal State
  const [successModalData, setSuccessModalData] = useState<{
    open: boolean;
    brandName: string;
    recordId: string;
    submittedAt: string;
    status: any;
  } | null>(null);

  const [formGlobalError, setFormGlobalError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<OnboardingFormData>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      brand_name: '',
      company_name: '',
      whatsapp_number: '',
      contact_person: '',
      contact_email: '',
      contact_number: '',
      username: '',
      password: '',
      platform: 'Meta Business Manager',
      login_url: 'https://business.facebook.com',
      status: 'submitted',
      assigned_to: '',
      onboarding_date: new Date().toISOString().split('T')[0],
      notes: '',
    },
  });

  // Fetch Employees for assignment dropdown
  const { data: employees } = useQuery({
    queryKey: ['profiles-employees'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, corporate_email')
          .eq('is_active', true)
          .order('full_name');
        if (!error && data && data.length > 0) return data as Profile[];
      } catch {
        // Fallback
      }
      return [
        { id: 'immense-admin-001', full_name: 'Immense Super Admin', corporate_email: 'support@immensesmartsolutions.com' },
        { id: 'immense-manager-002', full_name: 'Operations Manager', corporate_email: 'manager@immensesmartsolutions.com' },
        { id: 'immense-employee-003', full_name: 'Support Executive', corporate_email: 'employee@immensesmartsolutions.com' },
      ] as Profile[];
    },
  });

  // Pre-populate when editing
  const { data: existingRecord, isLoading: recordLoading } = useQuery({
    queryKey: ['onboarding-detail', id],
    queryFn: async () => {
      if (!id) return null;
      try {
        const { data, error } = await supabase
          .from('onboarding_records')
          .select('*')
          .eq('id', id)
          .single();
        if (!error && data) return data as OnboardingRecord;
      } catch {
        // Ignore
      }

      try {
        const local = JSON.parse(localStorage.getItem('immense_custom_onboardings') || '[]');
        const match = local.find((r: any) => r.id === id);
        if (match) return match as OnboardingRecord;
      } catch {
        // Ignore
      }

      return null;
    },
    enabled: isEditing,
  });

  useEffect(() => {
    if (existingRecord) {
      reset({
        brand_name: existingRecord.brand_name || '',
        company_name: existingRecord.company_name || '',
        whatsapp_number: existingRecord.whatsapp_number || '',
        contact_person: existingRecord.contact_person || '',
        contact_email: existingRecord.contact_email || '',
        contact_number: existingRecord.contact_number || '',
        username: existingRecord.username || '',
        password: existingRecord.credential_encrypted || '',
        platform: existingRecord.platform || 'Meta Business Manager',
        login_url: existingRecord.login_url || 'https://business.facebook.com',
        status: existingRecord.status || 'pending',
        assigned_to: existingRecord.assigned_to || '',
        onboarding_date: existingRecord.onboarding_date || new Date().toISOString().split('T')[0],
        notes: existingRecord.notes || '',
      });
    }
  }, [existingRecord, reset]);

  // Helper to upload and link a document to a record
  const uploadDoc = async (file: File, category: DocumentCategory, recordId: string) => {
    try {
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const uniqueFileName = `${Date.now()}_${sanitizedName}`;
      const storagePath = `${recordId}/${category}/${uniqueFileName}`;
      const uploaderId = profile?.id && isValidUuid(profile.id) ? profile.id : null;

      // 1. Upload to Supabase Storage (Client + Serverless fallback)
      const uploadResult = await uploadDocumentToStorage(storagePath, file, 'onboarding-documents');
      if (!uploadResult.success) {
        throw new Error(uploadResult.error || `Failed to upload ${file.name} to storage.`);
      }

      const docPayload: any = {
        onboarding_id: recordId,
        file_name: file.name,
        original_name: file.name,
        category,
        storage_path: storagePath,
        mime_type: file.type || 'application/octet-stream',
        file_size: file.size,
      };

      if (uploaderId) {
        docPayload.uploaded_by = uploaderId;
      }

      await saveDocumentMetadata('onboarding_documents', docPayload, 'insert');
    } catch (err) {
      console.warn('Doc upload helper error:', err);
    }
  };

  const onSubmit = async (data: OnboardingFormData) => {
    setFormGlobalError(null);
    const assignedTo = data.assigned_to && isValidUuid(data.assigned_to) ? data.assigned_to : null;
    const createdBy = profile?.id && isValidUuid(profile.id) ? profile.id : null;

    try {
      if (isEditing && id) {
        // -------------------------------------------------------------
        // EDIT MODE
        // -------------------------------------------------------------
        const updatePayload: any = {
          brand_name: data.brand_name.trim(),
          company_name: data.company_name?.trim() || '',
          whatsapp_number: data.whatsapp_number.trim(),
          contact_person: data.contact_person?.trim() || '',
          contact_email: data.contact_email?.trim() || '',
          contact_number: data.contact_number?.trim() || '',
          username: data.username?.trim() || '',
          platform: data.platform?.trim() || 'Meta Business Manager',
          login_url: data.login_url?.trim() || 'https://business.facebook.com',
          status: data.status,
          assigned_to: assignedTo,
          onboarding_date: data.onboarding_date || new Date().toISOString().split('T')[0],
          notes: data.notes?.trim() || '',
          updated_at: new Date().toISOString(),
        };

        if (data.password?.trim()) {
          updatePayload.credential_encrypted = data.password.trim();
        }

        try {
          await saveDocumentMetadata('onboarding_records', updatePayload, 'update', { id });
        } catch (dbErr) {
          console.warn('DB update note:', dbErr);
        }

        try {
          const existingLocal = JSON.parse(localStorage.getItem('immense_custom_onboardings') || '[]');
          const idx = existingLocal.findIndex((r: any) => r.id === id);
          if (idx >= 0) {
            existingLocal[idx] = { ...existingLocal[idx], ...updatePayload };
            localStorage.setItem('immense_custom_onboardings', JSON.stringify(existingLocal));
          }
        } catch {
          // Ignore
        }

        // Upload attached documents if any
        if (gstFile) await uploadDoc(gstFile, 'gst_certificate', id);
        if (panFile) await uploadDoc(panFile, 'pan_card', id);
        if (logoFile) await uploadDoc(logoFile, 'logo', id);

        await logAudit('record_edited', 'onboarding', id, { brand_name: data.brand_name });
        toast.success('Record Updated', `${data.brand_name} saved successfully.`);
        queryClient.invalidateQueries({ queryKey: ['onboarding-detail', id] });
        queryClient.invalidateQueries({ queryKey: ['onboarding-records'] });
        navigate(`/onboarding/${id}`);
      } else {
        // -------------------------------------------------------------
        // CREATE / SUBMIT MODE
        // -------------------------------------------------------------
        const insertPayload: any = {
          brand_name: data.brand_name.trim(),
          company_name: data.company_name?.trim() || '',
          whatsapp_number: data.whatsapp_number.trim(),
          contact_person: data.contact_person?.trim() || '',
          contact_email: data.contact_email?.trim() || '',
          contact_number: data.contact_number?.trim() || '',
          username: data.username?.trim() || '',
          credential_encrypted: data.password?.trim() || '',
          platform: data.platform?.trim() || 'Meta Business Manager',
          login_url: data.login_url?.trim() || 'https://business.facebook.com',
          status: 'submitted', // Enforce Submitted status on new submission
          assigned_to: assignedTo,
          onboarding_date: data.onboarding_date || new Date().toISOString().split('T')[0],
          notes: data.notes?.trim() || '',
        };

        if (createdBy) {
          insertPayload.created_by = createdBy;
        }

        let newRecordId: string | null = null;

        try {
          const res = await saveDocumentMetadata('onboarding_records', insertPayload, 'insert');
          if (res.success && Array.isArray(res.data) && res.data[0]?.id) {
            newRecordId = res.data[0].id;
          }
        } catch (dbErr) {
          console.warn('Database insert note:', dbErr);
        }

        if (!newRecordId) {
          newRecordId = generateUuid();
        }

        const localRecord = {
          id: newRecordId,
          ...insertPayload,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        try {
          const existingLocal = JSON.parse(localStorage.getItem('immense_custom_onboardings') || '[]');
          existingLocal.unshift(localRecord);
          localStorage.setItem('immense_custom_onboardings', JSON.stringify(existingLocal));
        } catch {
          // Ignore
        }

        // Upload attached documents across all 5 compliance categories
        const uploadedDocsForBackup: any[] = [];

        if (gstFile) {
          await uploadDoc(gstFile, 'gst_certificate', newRecordId);
          uploadedDocsForBackup.push({ file_name: gstFile.name, category: 'gst_certificate' });
        }
        if (panFile) {
          await uploadDoc(panFile, 'pan_card', newRecordId);
          uploadedDocsForBackup.push({ file_name: panFile.name, category: 'pan_card' });
        }
        if (logoFile) {
          await uploadDoc(logoFile, 'logo', newRecordId);
          uploadedDocsForBackup.push({ file_name: logoFile.name, category: 'logo' });
        }
        if (bannerFile) {
          await uploadDoc(bannerFile, 'banner_creative', newRecordId);
          uploadedDocsForBackup.push({ file_name: bannerFile.name, category: 'banner_creative' });
        }
        if (otherDocFile) {
          await uploadDoc(otherDocFile, 'other', newRecordId);
          uploadedDocsForBackup.push({ file_name: otherDocFile.name, category: 'other' });
        }

        // Trigger Google Drive Disaster Recovery Secondary Archive in Background
        fetch('/api/google-drive-backup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recordId: newRecordId,
            platform: 'WhatsApp',
            companyName: data.company_name?.trim() || data.brand_name.trim(),
            documents: uploadedDocsForBackup,
          }),
        }).catch((e) => console.warn('Background Google Drive backup note:', e));

        await logAudit('record_created', 'onboarding', newRecordId, {
          brand_name: data.brand_name,
          status: 'submitted',
        });

        toast.success('Onboarding Submitted', `${data.brand_name} submitted successfully.`);
        queryClient.invalidateQueries({ queryKey: ['onboarding-records'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
        queryClient.invalidateQueries({ queryKey: ['vault-records-grouped'] });
        queryClient.invalidateQueries({ queryKey: ['dr-onboarding-records'] });
        queryClient.invalidateQueries({ queryKey: ['gdrive-storage-status'] });

        // Trigger Success Confirmation Modal
        setSuccessModalData({
          open: true,
          brandName: data.brand_name,
          recordId: newRecordId,
          submittedAt: format(new Date(), 'dd MMM yyyy, hh:mm a'),
          status: 'submitted',
        });
      }
    } catch (err: any) {
      console.error('Submission error:', err);
      setFormGlobalError(err.message || 'An error occurred while submitting. Your data has been preserved.');
      toast.error('Submission Failed', err.message || 'An error occurred while submitting.');
    }
  };

  const onValidationErrors = (formErrors: FieldErrors<OnboardingFormData>) => {
    console.warn('Validation errors:', formErrors);
    const firstError = Object.values(formErrors)[0]?.message;
    toast.error('Please Check Required Fields', firstError ? String(firstError) : 'Complete all highlighted fields.');
  };

  if (isEditing && recordLoading) {
    return (
      <PageLayout title="Loading Record...">
        <div className="p-12 text-center">
          <div className="w-8 h-8 border-3 border-blue-200 border-t-[#1677FF] rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-gray-500">Loading form values...</p>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title={isEditing ? `Edit: ${existingRecord?.brand_name || 'Record'}` : 'New WhatsApp Onboarding'}>
      <form onSubmit={handleSubmit(onSubmit, onValidationErrors)} className="max-w-4xl mx-auto space-y-6">
        {/* Back link */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate(isEditing ? `/onboarding/${id}` : '/onboarding')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-900 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            {isEditing ? 'Back to Record' : 'Back to Directory'}
          </button>

          <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full font-medium border border-emerald-100">
            <CheckCircle2 className="w-3.5 h-3.5" />
            WhatsApp Business API Provisioning
          </div>
        </div>

        {/* Global Error Banner */}
        {formGlobalError && (
          <div className="p-4 rounded-2xl bg-red-50 border border-red-200 flex items-start gap-2.5 text-red-700 text-xs">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Submission Error</p>
              <p>{formGlobalError}</p>
            </div>
          </div>
        )}

        {/* SECTION 1: Client Information */}
        <div className="p-6 bg-white rounded-2xl border border-gray-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-gray-100">
            <div className="p-2 rounded-xl bg-blue-50 text-[#1677FF]">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">Client Information</h3>
              <p className="text-xs text-gray-500">Legal entity and brand registration details</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Brand Name <span className="text-red-500">*</span>
              </label>
              <input
                {...register('brand_name')}
                type="text"
                placeholder="e.g. Prestige Estates"
                className={`w-full px-3.5 py-2 text-xs bg-gray-50 border rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF] ${
                  errors.brand_name ? 'border-red-500 bg-red-50/20' : 'border-gray-200'
                }`}
              />
              {errors.brand_name && (
                <p className="text-[11px] text-red-500 mt-1">{errors.brand_name.message}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Legal Company Name
              </label>
              <input
                {...register('company_name')}
                type="text"
                placeholder="e.g. Prestige Estates Projects Limited"
                className="w-full px-3.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                WhatsApp Business Number <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                <input
                  {...register('whatsapp_number')}
                  type="text"
                  placeholder="+91 98450 12345"
                  className={`w-full pl-9 pr-3.5 py-2 text-xs bg-gray-50 border rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF] ${
                    errors.whatsapp_number ? 'border-red-500 bg-red-50/20' : 'border-gray-200'
                  }`}
                />
              </div>
              {errors.whatsapp_number && (
                <p className="text-[11px] text-red-500 mt-1">{errors.whatsapp_number.message}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Contact Person Name
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                <input
                  {...register('contact_person')}
                  type="text"
                  placeholder="e.g. Rajesh Kumar"
                  className="w-full pl-9 pr-3.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Contact Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                <input
                  {...register('contact_email')}
                  type="email"
                  placeholder="rajesh@prestige.com"
                  className="w-full pl-9 pr-3.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Alternative Contact Number
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                <input
                  {...register('contact_number')}
                  type="text"
                  placeholder="+91 80 2559 1080"
                  className="w-full pl-9 pr-3.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
                />
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 2: Facebook / Meta Login Details */}
        <div className="p-6 bg-white rounded-2xl border border-gray-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-blue-50 text-[#1677FF]">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">Facebook / Meta Login Details</h3>
                <p className="text-xs text-gray-500">Corporate Meta Business Manager credentials (encrypted server-side with AES-256)</p>
              </div>
            </div>
            <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200">
              Optional
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Facebook / Meta Username or Login Email
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                <input
                  {...register('username')}
                  type="text"
                  placeholder="e.g. business.admin@company.com or WABA_98234"
                  className="w-full pl-9 pr-3.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
                />
              </div>
              <p className="text-[10px] text-gray-400 mt-1">Facebook / Meta account email or business login identifier</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Facebook / Meta Password
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                <input
                  {...register('password')}
                  type={showFormPassword ? 'text' : 'password'}
                  placeholder="••••••••••••"
                  className="w-full pl-9 pr-10 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl font-mono focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
                />
                <button
                  type="button"
                  onClick={() => setShowFormPassword(!showFormPassword)}
                  className="absolute right-3 top-2 text-gray-400 hover:text-gray-600 p-0.5 transition-colors cursor-pointer"
                  title={showFormPassword ? 'Hide password' : 'Show password'}
                >
                  {showFormPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4 text-gray-500" />}
                </button>
              </div>
              <p className="text-[10px] text-gray-400 mt-1">Encrypted on submission. Masked by default in detail view.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Platform Name
              </label>
              <input
                {...register('platform')}
                type="text"
                placeholder="Meta Business Manager"
                className="w-full px-3.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Platform Login URL
              </label>
              <div className="relative">
                <Globe className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                <input
                  {...register('login_url')}
                  type="url"
                  placeholder="https://business.facebook.com"
                  className="w-full pl-9 pr-3.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
                />
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 3: Required Compliance Documents */}
        <div className="p-6 bg-white rounded-2xl border border-gray-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-blue-50 text-[#1677FF]">
                <FolderLock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">Upload Compliance & Identity Documents</h3>
                <p className="text-xs text-gray-500">
                  Attach GST, PAN, or Brand Logo (PDF, JPG, PNG, DOCX up to 10MB)
                </p>
              </div>
            </div>
            <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-100">
              Vault Attachment
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* GST Certificate */}
            <div className="p-3.5 bg-gray-50/80 border border-gray-200 rounded-xl space-y-2">
              <span className="text-xs font-bold text-gray-800">1. GST Certificate</span>
              <p className="text-[10px] text-gray-500">PDF or Clear Image scan</p>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.docx,.doc"
                onChange={(e) => setGstFile(e.target.files?.[0] || null)}
                className="w-full text-[11px] text-gray-500 file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-[11px] file:font-semibold file:bg-blue-50 file:text-[#1677FF] hover:file:bg-blue-100 cursor-pointer"
              />
              {gstFile && (
                <p className="text-[10px] text-emerald-600 font-semibold truncate flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> {gstFile.name}
                </p>
              )}
            </div>

            {/* PAN Card */}
            <div className="p-3.5 bg-gray-50/80 border border-gray-200 rounded-xl space-y-2">
              <span className="text-xs font-bold text-gray-800">2. PAN Card</span>
              <p className="text-[10px] text-gray-500">Business or Director PAN</p>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.docx,.doc"
                onChange={(e) => setPanFile(e.target.files?.[0] || null)}
                className="w-full text-[11px] text-gray-500 file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-[11px] file:font-semibold file:bg-blue-50 file:text-[#1677FF] hover:file:bg-blue-100 cursor-pointer"
              />
              {panFile && (
                <p className="text-[10px] text-emerald-600 font-semibold truncate flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> {panFile.name}
                </p>
              )}
            </div>

            {/* Brand Logo */}
            <div className="p-3.5 bg-gray-50/80 border border-gray-200 rounded-xl space-y-2">
              <span className="text-xs font-bold text-gray-800">3. Brand Profile Logo</span>
              <p className="text-[10px] text-gray-500">PNG / JPG Profile Logo</p>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.docx,.doc"
                onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
                className="w-full text-[11px] text-gray-500 file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-[11px] file:font-semibold file:bg-blue-50 file:text-[#1677FF] hover:file:bg-blue-100 cursor-pointer"
              />
              {logoFile && (
                <p className="text-[10px] text-emerald-600 font-semibold truncate flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> {logoFile.name}
                </p>
              )}
            </div>

            {/* Marketing Banner */}
            <div className="p-3.5 bg-gray-50/80 border border-gray-200 rounded-xl space-y-2">
              <span className="text-xs font-bold text-gray-800">4. Marketing Hero Banner</span>
              <p className="text-[10px] text-gray-500">PNG / JPG Header Asset</p>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                onChange={(e) => setBannerFile(e.target.files?.[0] || null)}
                className="w-full text-[11px] text-gray-500 file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-[11px] file:font-semibold file:bg-blue-50 file:text-[#1677FF] hover:file:bg-blue-100 cursor-pointer"
              />
              {bannerFile && (
                <p className="text-[10px] text-emerald-600 font-semibold truncate flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> {bannerFile.name}
                </p>
              )}
            </div>

            {/* Other Document / Meta Agreement */}
            <div className="p-3.5 bg-gray-50/80 border border-gray-200 rounded-xl space-y-2 sm:col-span-2 lg:col-span-1">
              <span className="text-xs font-bold text-gray-800">5. Other Compliance Doc / Authorization</span>
              <p className="text-[10px] text-gray-500">KYC, Agreement, Meta letter (PDF/Doc)</p>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.docx,.doc,.xlsx,.xls"
                onChange={(e) => setOtherDocFile(e.target.files?.[0] || null)}
                className="w-full text-[11px] text-gray-500 file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-[11px] file:font-semibold file:bg-blue-50 file:text-[#1677FF] hover:file:bg-blue-100 cursor-pointer"
              />
              {otherDocFile && (
                <p className="text-[10px] text-emerald-600 font-semibold truncate flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> {otherDocFile.name}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* SECTION 4: Status, Assignment & Notes */}
        <div className="p-6 bg-white rounded-2xl border border-gray-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-gray-100">
            <div className="p-2 rounded-xl bg-blue-50 text-[#1677FF]">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">Assignment & Status Control</h3>
              <p className="text-xs text-gray-500">Assign onboarding executive and track progress</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Onboarding Status
              </label>
              <select
                {...register('status')}
                className="w-full px-3.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Assigned Employee Staff
              </label>
              <select
                {...register('assigned_to')}
                className="w-full px-3.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
              >
                <option value="">-- Unassigned --</option>
                {(employees || []).map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.full_name} ({emp.corporate_email})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
              Internal Notes & Scope
            </label>
            <textarea
              {...register('notes')}
              rows={3}
              placeholder="e.g. Client requested 10 custom template messages and interactive catalog setup..."
              className="w-full px-3.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
            />
          </div>
        </div>

        {/* Action Buttons with Primary Submit */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate(isEditing ? `/onboarding/${id}` : '/onboarding')}
            className="px-5 py-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 px-8 py-3 text-xs font-bold text-white bg-[#1677FF] hover:bg-[#0B5FE0] rounded-xl shadow-md transition-all disabled:opacity-50 cursor-pointer"
          >
            <Send className="w-4 h-4" />
            {isSubmitting
              ? isEditing
                ? 'Updating...'
                : 'Submitting WhatsApp Onboarding...'
              : isEditing
              ? 'Update WhatsApp Record'
              : 'Submit WhatsApp Onboarding'}
          </button>
        </div>
      </form>

      {/* Submission Success Confirmation Modal */}
      {successModalData && (
        <SubmissionSuccessModal
          open={successModalData.open}
          onClose={() => {
            setSuccessModalData(null);
            navigate(`/onboarding/${successModalData.recordId}`);
          }}
          onViewRecord={() => {
            setSuccessModalData(null);
            navigate(`/onboarding/${successModalData.recordId}`);
          }}
          type="whatsapp"
          brandName={successModalData.brandName}
          recordId={successModalData.recordId}
          submittedAt={successModalData.submittedAt}
          status={successModalData.status}
        />
      )}
    </PageLayout>
  );
}

export default OnboardingForm;
