import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  CheckCircle2
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { PageLayout } from '@/components/layout/PageLayout';
import { logAudit } from '@/lib/audit';
import { useToast } from '@/lib/toast';
import { STATUS_OPTIONS } from '@/types/database';
import type { OnboardingRecord, OnboardingStatus, Profile } from '@/types/database';

const onboardingSchema = z.object({
  brand_name: z.string().min(2, 'Brand name is required (at least 2 characters)'),
  company_name: z.string().optional(),
  whatsapp_number: z.string().min(8, 'Valid WhatsApp phone number with country code is required'),
  contact_person: z.string().optional(),
  contact_email: z.string().email('Valid contact email is required').or(z.literal('')).optional(),
  contact_number: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  platform: z.string().optional(),
  login_url: z.string().url('Must be a valid URL (e.g. https://...)').or(z.literal('')).optional(),
  status: z.enum(['pending', 'in_progress', 'live', 'rejected', 'completed', 'inactive']),
  assigned_to: z.string().optional(),
  onboarding_date: z.string().min(1, 'Onboarding date is required'),
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
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, corporate_email')
        .eq('is_active', true)
        .order('full_name');
      return (data || []) as Profile[];
    },
  });

  // If editing, fetch existing record
  const { data: existingRecord, isLoading: recordLoading } = useQuery({
    queryKey: ['onboarding-detail', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('onboarding_records')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as OnboardingRecord;
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
        platform: existingRecord.platform || '',
        login_url: existingRecord.login_url || '',
        status: existingRecord.status || 'pending',
        assigned_to: existingRecord.assigned_to || '',
        onboarding_date: existingRecord.onboarding_date || new Date().toISOString().split('T')[0],
        notes: existingRecord.notes || '',
      });
    }
  }, [existingRecord, reset]);

  const onSubmit = async (data: OnboardingFormData) => {
    try {
      if (isEditing && id) {
        // Update record
        const updatePayload: any = {
          brand_name: data.brand_name.trim(),
          company_name: data.company_name?.trim() || '',
          whatsapp_number: data.whatsapp_number.trim(),
          contact_person: data.contact_person?.trim() || '',
          contact_email: data.contact_email?.trim() || '',
          contact_number: data.contact_number?.trim() || '',
          username: data.username?.trim() || '',
          platform: data.platform?.trim() || '',
          login_url: data.login_url?.trim() || '',
          status: data.status,
          assigned_to: data.assigned_to || null,
          onboarding_date: data.onboarding_date,
          notes: data.notes?.trim() || '',
          updated_at: new Date().toISOString(),
        };

        // Only update password if a new one was typed
        if (data.password && data.password.trim().length > 0) {
          updatePayload.credential_encrypted = data.password.trim();
        }

        const { error } = await supabase
          .from('onboarding_records')
          .update(updatePayload)
          .eq('id', id);

        if (error) throw error;

        await logAudit('record_edited', 'onboarding', id, {
          brand_name: data.brand_name,
        });

        toast.success('Record Updated', `${data.brand_name} record saved.`);
        queryClient.invalidateQueries({ queryKey: ['onboarding-detail', id] });
        queryClient.invalidateQueries({ queryKey: ['onboarding-records'] });
        navigate(`/onboarding/${id}`);
      } else {
        // Create new record
        const insertPayload: any = {
          brand_name: data.brand_name.trim(),
          company_name: data.company_name?.trim() || '',
          whatsapp_number: data.whatsapp_number.trim(),
          contact_person: data.contact_person?.trim() || '',
          contact_email: data.contact_email?.trim() || '',
          contact_number: data.contact_number?.trim() || '',
          username: data.username?.trim() || '',
          credential_encrypted: data.password?.trim() || '',
          platform: data.platform?.trim() || '',
          login_url: data.login_url?.trim() || '',
          status: data.status,
          assigned_to: data.assigned_to || null,
          onboarding_date: data.onboarding_date,
          notes: data.notes?.trim() || '',
          created_by: profile?.id,
        };

        const { data: newRecord, error } = await supabase
          .from('onboarding_records')
          .insert(insertPayload)
          .select('id')
          .single();

        if (error) throw error;

        await logAudit('record_created', 'onboarding', newRecord.id, {
          brand_name: data.brand_name,
        });

        toast.success('Onboarding Initialized', `${data.brand_name} successfully recorded.`);
        queryClient.invalidateQueries({ queryKey: ['onboarding-records'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
        navigate(`/onboarding/${newRecord.id}`);
      }
    } catch (err: any) {
      console.error('Save error:', err);
      toast.error('Save Failed', err.message || 'An error occurred while saving.');
    }
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
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-4xl mx-auto">
        {/* Top Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(isEditing ? `/onboarding/${id}` : '/onboarding')}
              className="p-2 text-gray-500 hover:text-gray-900 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors shadow-2xs"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h2 className="text-xl font-bold text-gray-900 tracking-tight">
                {isEditing ? 'Modify WhatsApp Business Record' : 'Register WhatsApp Onboarding'}
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Ensure brand information and WhatsApp numbers match Meta Business Manager verification.
              </p>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-[#1677FF] hover:bg-[#0B5FE0] rounded-xl shadow-xs transition-all disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                {isEditing ? 'Save Changes' : 'Create Onboarding Record'}
              </>
            )}
          </button>
        </div>

        {/* Section 1: Business & Client Details */}
        <div className="p-6 bg-white rounded-2xl border border-gray-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
            <div className="p-2 rounded-lg bg-blue-50 text-[#1677FF]">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">Client & Entity Information</h3>
              <p className="text-[11px] text-gray-500">Official business registration details</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Brand Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                {...register('brand_name')}
                placeholder="e.g. Prestige Estates, Tata Motors"
                className={`w-full px-3.5 py-2 text-xs bg-gray-50 border rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF] ${
                  errors.brand_name ? 'border-red-400' : 'border-gray-200'
                }`}
              />
              {errors.brand_name && (
                <p className="text-[11px] text-red-500 mt-1">{errors.brand_name.message}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Legal Entity / Company Name
              </label>
              <input
                type="text"
                {...register('company_name')}
                placeholder="e.g. Prestige Projects Pvt Ltd"
                className="w-full px-3.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                WhatsApp Business Number <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                {...register('whatsapp_number')}
                placeholder="e.g. +91 9876543210"
                className={`w-full px-3.5 py-2 text-xs bg-gray-50 border rounded-xl font-mono focus:outline-hidden focus:ring-2 focus:ring-[#1677FF] ${
                  errors.whatsapp_number ? 'border-red-400' : 'border-gray-200'
                }`}
              />
              {errors.whatsapp_number && (
                <p className="text-[11px] text-red-500 mt-1">{errors.whatsapp_number.message}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Onboarding Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                {...register('onboarding_date')}
                className="w-full px-3.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Contact Person */}
        <div className="p-6 bg-white rounded-2xl border border-gray-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
            <div className="p-2 rounded-lg bg-blue-50 text-[#1677FF]">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">Client Point of Contact</h3>
              <p className="text-[11px] text-gray-500">Authorized representative for verification</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Contact Person Name
              </label>
              <input
                type="text"
                {...register('contact_person')}
                placeholder="e.g. Rahul Sharma"
                className="w-full px-3.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Contact Email
              </label>
              <input
                type="email"
                {...register('contact_email')}
                placeholder="contact@clientdomain.com"
                className="w-full px-3.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
              />
              {errors.contact_email && (
                <p className="text-[11px] text-red-500 mt-1">{errors.contact_email.message}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Contact Phone
              </label>
              <input
                type="text"
                {...register('contact_number')}
                placeholder="+91 9876543210"
                className="w-full px-3.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
              />
            </div>
          </div>
        </div>

        {/* Section 3: Platform Credentials & Status */}
        <div className="p-6 bg-white rounded-2xl border border-gray-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
            <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
              <KeyRound className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">Platform Credentials & Security</h3>
              <p className="text-[11px] text-gray-500">
                Credentials are stored in AES-256 encrypted storage server-side
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Platform Username / App ID
              </label>
              <input
                type="text"
                {...register('username')}
                placeholder="e.g. meta_admin_prestige"
                className="w-full px-3.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl font-mono focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                {isEditing ? 'New Password (Leave empty to retain)' : 'Platform Password / Secret'}
              </label>
              <input
                type="password"
                {...register('password')}
                placeholder={isEditing ? '••••••••••••' : 'Enter secret credentials'}
                className="w-full px-3.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl font-mono focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Platform Service
              </label>
              <input
                type="text"
                {...register('platform')}
                placeholder="e.g. Meta Cloud API, Gupshup, Twilio"
                className="w-full px-3.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Management Console URL
              </label>
              <input
                type="url"
                {...register('login_url')}
                placeholder="https://business.facebook.com"
                className="w-full px-3.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
              />
              {errors.login_url && (
                <p className="text-[11px] text-red-500 mt-1">{errors.login_url.message}</p>
              )}
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
            className="px-5 py-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 px-6 py-2.5 text-xs font-semibold text-white bg-[#1677FF] hover:bg-[#0B5FE0] rounded-xl shadow-xs transition-all disabled:opacity-50"
          >
            {isSubmitting ? 'Saving...' : isEditing ? 'Update Record' : 'Submit & Open Vault'}
          </button>
        </div>
      </form>
    </PageLayout>
  );
}

export default OnboardingForm;
