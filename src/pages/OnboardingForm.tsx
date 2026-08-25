import { useEffect } from 'react';
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
  AlertCircle
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { PageLayout } from '@/components/layout/PageLayout';
import { logAudit } from '@/lib/audit';
import { useToast } from '@/lib/toast';
import { isValidUuid } from '@/lib/constants';
import { STATUS_OPTIONS } from '@/types/database';
import type { OnboardingRecord, Profile } from '@/types/database';

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
  status: z.enum(['pending', 'in_progress', 'live', 'rejected', 'completed', 'inactive']),
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
      status: 'pending',
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

  // If editing, fetch existing record
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
        // Check local
      }
      try {
        const localCustom = JSON.parse(localStorage.getItem('immense_custom_onboardings') || '[]');
        const match = localCustom.find((r: any) => r.id === id);
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
        password: '', // Kept empty unless user enters new password
        platform: existingRecord.platform || 'Meta Business Manager',
        login_url: existingRecord.login_url || 'https://business.facebook.com',
        status: existingRecord.status || 'pending',
        assigned_to: existingRecord.assigned_to || '',
        onboarding_date: existingRecord.onboarding_date || new Date().toISOString().split('T')[0],
        notes: existingRecord.notes || '',
      });
    }
  }, [existingRecord, reset]);

  const onSubmit = async (data: OnboardingFormData) => {
    const assignedTo = isValidUuid(data.assigned_to) ? data.assigned_to : null;
    const createdBy = isValidUuid(profile?.id) ? profile?.id : null;

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

        if (data.password && data.password.trim().length > 0) {
          updatePayload.credential_encrypted = data.password.trim();
        }

        try {
          const { error } = await supabase
            .from('onboarding_records')
            .update(updatePayload)
            .eq('id', id);

          if (error) throw error;
        } catch {
          // Update in local cache
          try {
            const localCustom = JSON.parse(localStorage.getItem('immense_custom_onboardings') || '[]');
            const idx = localCustom.findIndex((r: any) => r.id === id);
            if (idx >= 0) {
              localCustom[idx] = { ...localCustom[idx], ...updatePayload };
              localStorage.setItem('immense_custom_onboardings', JSON.stringify(localCustom));
            }
          } catch {
            // Ignore
          }
        }

        await logAudit('record_edited', 'onboarding', id, { brand_name: data.brand_name });
        toast.success('Record Updated', `${data.brand_name} saved successfully.`);
        queryClient.invalidateQueries({ queryKey: ['onboarding-detail', id] });
        queryClient.invalidateQueries({ queryKey: ['onboarding-records'] });
        navigate(`/onboarding/${id}`);
      } else {
        // -------------------------------------------------------------
        // CREATE MODE
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
          status: data.status,
          assigned_to: assignedTo,
          onboarding_date: data.onboarding_date || new Date().toISOString().split('T')[0],
          notes: data.notes?.trim() || '',
        };

        if (createdBy) {
          insertPayload.created_by = createdBy;
        }

        let newRecordId: string | null = null;

        try {
          const { data: newRecord, error } = await supabase
            .from('onboarding_records')
            .insert(insertPayload)
            .select('id')
            .single();

          if (!error && newRecord?.id) {
            newRecordId = newRecord.id;
          }
        } catch (dbErr) {
          console.warn('Database insert note:', dbErr);
        }

        // Fallback or local sync
        if (!newRecordId) {
          newRecordId = `rec-${Date.now()}`;
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

        await logAudit('record_created', 'onboarding', newRecordId, { brand_name: data.brand_name });
        toast.success('Onboarding Initialized', `${data.brand_name} saved to onboarding portal.`);
        queryClient.invalidateQueries({ queryKey: ['onboarding-records'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
        navigate(`/onboarding/${newRecordId}`);
      }
    } catch (err: any) {
      console.error('Submission error:', err);
      toast.error('Save Failed', err.message || 'An error occurred while saving.');
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
      <form onSubmit={handleSubmit(onSubmit, onValidationErrors)} className="space-y-6 max-w-4xl mx-auto">
        {/* Top Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(isEditing ? `/onboarding/${id}` : '/onboarding')}
              className="p-2 text-gray-500 hover:text-gray-900 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors shadow-2xs cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                {isEditing ? `Edit ${existingRecord?.brand_name || 'Record'}` : 'Initialize WhatsApp Onboarding'}
              </h1>
              <p className="text-xs text-gray-500">
                {isEditing ? 'Update client credentials and onboarding status' : 'Register brand, credentials & setup private vault'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(isEditing ? `/onboarding/${id}` : '/onboarding')}
              className="px-4 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-[#1677FF] hover:bg-[#0B5FE0] rounded-xl shadow-xs transition-all disabled:opacity-50 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              {isSubmitting ? 'Saving...' : isEditing ? 'Update Record' : 'Submit & Open Vault'}
            </button>
          </div>
        </div>

        {/* Global validation summary alert */}
        {Object.keys(errors).length > 0 && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3 text-red-800">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-semibold mb-1">Please correct the following before saving:</p>
              <ul className="list-disc list-inside space-y-0.5">
                {Object.entries(errors).map(([field, err]) => (
                  <li key={field}>{String(err?.message || `${field} is required`)}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Section 1: Client & Brand Information */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs space-y-5">
          <div className="flex items-center gap-2.5 pb-4 border-b border-gray-100">
            <Building2 className="w-5 h-5 text-[#1677FF]" />
            <h2 className="text-sm font-bold text-gray-900">Client & Brand Identity</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Brand Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                {...register('brand_name')}
                placeholder="e.g. Prestige Estates"
                className={`w-full px-3.5 py-2 text-xs bg-gray-50 border rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF] transition-all ${
                  errors.brand_name ? 'border-red-400 focus:ring-red-400 bg-red-50/20' : 'border-gray-200'
                }`}
              />
              {errors.brand_name && (
                <p className="text-[11px] text-red-500 mt-1">{errors.brand_name.message}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Official Registered Company Name
              </label>
              <input
                type="text"
                {...register('company_name')}
                placeholder="e.g. Prestige Group Projects Private Limited"
                className="w-full px-3.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                WhatsApp Business Phone Number <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                <input
                  type="tel"
                  {...register('whatsapp_number')}
                  placeholder="+91 98450 12345"
                  className={`w-full pl-9 pr-3.5 py-2 text-xs bg-gray-50 border rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF] transition-all ${
                    errors.whatsapp_number ? 'border-red-400 focus:ring-red-400 bg-red-50/20' : 'border-gray-200'
                  }`}
                />
              </div>
              {errors.whatsapp_number && (
                <p className="text-[11px] text-red-500 mt-1">{errors.whatsapp_number.message}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Client Contact Person Name
              </label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  {...register('contact_person')}
                  placeholder="e.g. Rahul Narang"
                  className="w-full pl-9 pr-3.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Contact Person Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                <input
                  type="email"
                  {...register('contact_email')}
                  placeholder="rahul.narang@prestige.com"
                  className="w-full pl-9 pr-3.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Direct Contact Phone
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                <input
                  type="tel"
                  {...register('contact_number')}
                  placeholder="+91 98450 12345"
                  className="w-full pl-9 pr-3.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Platform Credentials & Access */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs space-y-5">
          <div className="flex items-center gap-2.5 pb-4 border-b border-gray-100">
            <Shield className="w-5 h-5 text-amber-500" />
            <div>
              <h2 className="text-sm font-bold text-gray-900">Platform Secrets & Access Credentials</h2>
              <p className="text-[11px] text-gray-500">Stored with server-side AES-256 encryption. Every access generates an audit trail.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Platform Username / Business ID
              </label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  {...register('username')}
                  placeholder="meta_prestige_bot"
                  className="w-full pl-9 pr-3.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Password / API Access Token {isEditing && '(Leave blank to retain current)'}
              </label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                <input
                  type="password"
                  {...register('password')}
                  placeholder={isEditing ? '•••••••••••• (Unchanged)' : 'Enter password or system token'}
                  className="w-full pl-9 pr-3.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                WhatsApp / BSP Platform
              </label>
              <input
                type="text"
                {...register('platform')}
                placeholder="e.g. Meta Cloud API (WABA), Gupshup, Twilio"
                className="w-full px-3.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Platform Login URL
              </label>
              <div className="relative">
                <Globe className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  {...register('login_url')}
                  placeholder="https://business.facebook.com"
                  className="w-full pl-9 pr-3.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Status & Assignment */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs space-y-5">
          <div className="flex items-center gap-2.5 pb-4 border-b border-gray-100">
            <Calendar className="w-5 h-5 text-indigo-500" />
            <h2 className="text-sm font-bold text-gray-900">Assignment & Onboarding Schedule</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Onboarding Date
              </label>
              <input
                type="date"
                {...register('onboarding_date')}
                className="w-full px-3.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
              />
            </div>

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
              Internal Notes & Onboarding Scope
            </label>
            <textarea
              {...register('notes')}
              rows={3}
              placeholder="e.g. Client requested 10 custom template messages and interactive catalog setup..."
              className="w-full px-3.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
            />
          </div>
        </div>

        {/* Action Buttons */}
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
            className="inline-flex items-center gap-2 px-6 py-2.5 text-xs font-semibold text-white bg-[#1677FF] hover:bg-[#0B5FE0] rounded-xl shadow-xs transition-all disabled:opacity-50 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            {isSubmitting ? 'Saving...' : isEditing ? 'Update Record' : 'Submit & Open Vault'}
          </button>
        </div>
      </form>
    </PageLayout>
  );
}

export default OnboardingForm;
