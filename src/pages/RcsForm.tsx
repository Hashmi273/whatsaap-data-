import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Radio,
  Building2,
  Globe,
  Mail,
  Phone,
  FileText,
  UserCheck,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  Save,
  ShieldCheck,
  UploadCloud,
  FolderLock,
  Sparkles,
  Send
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { PageLayout } from '@/components/layout/PageLayout';
import { SubmissionSuccessModal } from '@/components/shared/SubmissionSuccessModal';
import { logAudit } from '@/lib/audit';
import { useToast } from '@/lib/toast';
import { isValidUuid } from '@/lib/constants';
import { STATUS_OPTIONS, MAX_FILE_SIZE } from '@/types/database';
import type { RcsOnboardingRecord, OnboardingStatus, Profile, DocumentCategory } from '@/types/database';
import { format } from 'date-fns';

export function RcsForm() {
  const { id } = useParams<{ id: string }>();
  const isEditing = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  // Form State
  const [brandName, setBrandName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [website, setWebsite] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [rcsBusinessName, setRcsBusinessName] = useState('');
  const [rcsAgentId, setRcsAgentId] = useState('');
  const [status, setStatus] = useState<OnboardingStatus>('submitted');
  const [assignedTo, setAssignedTo] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Document Attachments for RCS Submission
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [gstFile, setGstFile] = useState<File | null>(null);
  const [panFile, setPanFile] = useState<File | null>(null);

  // Success Confirmation Modal State
  const [successModalData, setSuccessModalData] = useState<{
    open: boolean;
    brandName: string;
    recordId: string;
    submittedAt: string;
    status: OnboardingStatus;
  } | null>(null);

  // Fetch Team Profiles for assignment dropdown
  const { data: teamMembers } = useQuery({
    queryKey: ['team-profiles'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from('profiles').select('*').eq('is_active', true);
        if (!error && data) return data as Profile[];
      } catch {
        // Ignore
      }
      return [];
    },
  });

  // Prepopulate form if editing
  useEffect(() => {
    if (!isEditing || !id) return;

    // Check local cache first
    try {
      const localRcs = JSON.parse(localStorage.getItem('immense_rcs_records') || '[]');
      const match = localRcs.find((r: any) => r.id === id);
      if (match) {
        setBrandName(match.brand_name || '');
        setCompanyName(match.company_name || '');
        setGstNumber(match.gst_number || '');
        setWebsite(match.website || '');
        setContactPerson(match.contact_person || '');
        setContactNumber(match.contact_number || '');
        setContactEmail(match.contact_email || '');
        setRcsBusinessName(match.rcs_business_name || '');
        setRcsAgentId(match.rcs_agent_id || '');
        setStatus(match.status || 'pending');
        setAssignedTo(match.assigned_to || '');
        setNotes(match.notes || '');
        return;
      }
    } catch {
      // Ignore
    }

    // Try Supabase fetch
    supabase
      .from('onboarding_records')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data, error }) => {
        if (!error && data) {
          setBrandName(data.brand_name || '');
          setCompanyName(data.company_name || '');
          setWebsite(data.login_url || '');
          setContactPerson(data.contact_person || '');
          setContactNumber(data.contact_number || '');
          setContactEmail(data.contact_email || '');
          setRcsBusinessName(data.username || data.brand_name || '');
          setRcsAgentId(data.credential_encrypted || '');
          setStatus(data.status || 'pending');
          setAssignedTo(data.assigned_to || '');
          setNotes(data.notes || '');
        }
      });
  }, [id, isEditing]);

  // Helper to upload document to storage and cache
  const uploadDoc = async (file: File, category: DocumentCategory, recordId: string) => {
    try {
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const uniqueFileName = `${Date.now()}_${sanitizedName}`;
      const storagePath = `${recordId}/${category}/${uniqueFileName}`;
      const uploaderId = profile?.id && isValidUuid(profile.id) ? profile.id : null;

      try {
        await supabase.storage.from('onboarding-documents').upload(storagePath, file, {
          cacheControl: '3600',
          upsert: true,
        });
      } catch (e) {
        console.warn('Storage upload note:', e);
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

      try {
        await supabase.from('onboarding_documents').insert(docPayload);
      } catch (e) {
        console.warn('DB doc insert note:', e);
      }

      let blobUrl = '';
      try {
        blobUrl = URL.createObjectURL(file);
      } catch {
        // Ignore
      }

      const newDocItem: any = {
        id: `doc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        ...docPayload,
        created_at: new Date().toISOString(),
        localPreviewUrl: blobUrl,
        uploader_profile: {
          id: profile?.id || 'immense-admin-001',
          full_name: profile?.full_name || 'Immense Super Admin',
          corporate_email: profile?.corporate_email || 'support@immensesmartsolutions.com',
        },
      };

      const localDocs = JSON.parse(localStorage.getItem(`immense_docs_${recordId}`) || '[]');
      localDocs.unshift(newDocItem);
      localStorage.setItem(`immense_docs_${recordId}`, JSON.stringify(localDocs));

      const globalDocs = JSON.parse(localStorage.getItem('immense_all_vault_docs') || '[]');
      globalDocs.unshift(newDocItem);
      localStorage.setItem('immense_all_vault_docs', JSON.stringify(globalDocs));
    } catch (err) {
      console.warn('Doc upload helper error:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!brandName.trim()) {
      setFormError('Please enter the client brand name.');
      return;
    }

    setIsSubmitting(true);
    const newRecordId = isEditing ? id! : `rcs-${Date.now()}`;
    const submissionStatus: OnboardingStatus = isEditing ? status : 'submitted';

    const rcsPayload: RcsOnboardingRecord = {
      id: newRecordId,
      brand_name: brandName.trim(),
      company_name: companyName.trim(),
      gst_number: gstNumber.trim(),
      website: website.trim(),
      contact_person: contactPerson.trim(),
      contact_number: contactNumber.trim(),
      contact_email: contactEmail.trim(),
      rcs_business_name: rcsBusinessName.trim() || brandName.trim(),
      rcs_agent_id: rcsAgentId.trim() || `rcs_agent_${Date.now()}`,
      status: submissionStatus,
      assigned_to: assignedTo || null,
      onboarding_date: new Date().toISOString().split('T')[0],
      notes: notes.trim(),
      created_by: profile?.id || 'immense-admin-001',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    try {
      // 1. Try DB save
      const dbPayload = {
        id: newRecordId,
        brand_name: rcsPayload.brand_name,
        company_name: rcsPayload.company_name,
        whatsapp_number: rcsPayload.contact_number || '+91 99999 99999',
        contact_person: rcsPayload.contact_person,
        contact_email: rcsPayload.contact_email,
        contact_number: rcsPayload.contact_number,
        username: rcsPayload.rcs_business_name,
        credential_encrypted: rcsPayload.rcs_agent_id,
        platform: 'RCS Business Messaging',
        login_url: rcsPayload.website,
        status: submissionStatus,
        assigned_to: rcsPayload.assigned_to,
        notes: `GST: ${rcsPayload.gst_number}\n${rcsPayload.notes}`,
        updated_at: new Date().toISOString(),
      };

      try {
        if (isEditing) {
          await supabase.from('onboarding_records').update(dbPayload).eq('id', newRecordId);
        } else {
          await supabase.from('onboarding_records').insert(dbPayload);
        }
      } catch (dbErr) {
        console.warn('DB save note:', dbErr);
      }

      // 2. Persist to local RCS cache
      try {
        const local = JSON.parse(localStorage.getItem('immense_rcs_records') || '[]');
        if (isEditing) {
          const idx = local.findIndex((r: any) => r.id === newRecordId);
          if (idx >= 0) local[idx] = rcsPayload;
          else local.unshift(rcsPayload);
        } else {
          local.unshift(rcsPayload);
        }
        localStorage.setItem('immense_rcs_records', JSON.stringify(local));

        const localCustom = JSON.parse(localStorage.getItem('immense_custom_onboardings') || '[]');
        const customIdx = localCustom.findIndex((r: any) => r.id === newRecordId);
        if (customIdx >= 0) localCustom[customIdx] = dbPayload;
        else localCustom.unshift(dbPayload);
        localStorage.setItem('immense_custom_onboardings', JSON.stringify(localCustom));
      } catch {
        // Ignore
      }

      // 3. Upload attached media & documents
      if (logoFile) await uploadDoc(logoFile, 'logo', newRecordId);
      if (bannerFile) await uploadDoc(bannerFile, 'banner_creative', newRecordId);
      if (gstFile) await uploadDoc(gstFile, 'gst_certificate', newRecordId);
      if (panFile) await uploadDoc(panFile, 'pan_card', newRecordId);

      // 4. Log Audit
      await logAudit(isEditing ? 'record_edited' : 'record_created', 'onboarding', newRecordId, {
        brand_name: rcsPayload.brand_name,
        platform: 'RCS Business Messaging',
        status: submissionStatus,
      });

      toast.success(
        isEditing ? 'RCS Record Updated' : 'RCS Onboarding Submitted',
        `${rcsPayload.brand_name} saved successfully.`
      );

      queryClient.invalidateQueries({ queryKey: ['rcs-records'] });
      queryClient.invalidateQueries({ queryKey: ['vault-records-grouped'] });
      queryClient.invalidateQueries({ queryKey: ['rcs-record-detail', newRecordId] });

      if (isEditing) {
        navigate(`/rcs/${newRecordId}`);
      } else {
        // Show Success Confirmation Modal
        setSuccessModalData({
          open: true,
          brandName: rcsPayload.brand_name,
          recordId: newRecordId,
          submittedAt: format(new Date(), 'dd MMM yyyy, hh:mm a'),
          status: 'submitted',
        });
      }
    } catch (err: any) {
      console.error('Save error:', err);
      setFormError(err.message || 'Could not submit RCS onboarding record. Your data has been preserved.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PageLayout title={isEditing ? 'Edit RCS Record' : 'New RCS Onboarding'}>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Back Link & Header */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate('/rcs')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-900 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" /> Back to RCS Directory
          </button>

          <div className="flex items-center gap-1.5 text-xs text-blue-700 bg-blue-50 px-3 py-1 rounded-full font-medium border border-blue-100">
            <Radio className="w-3.5 h-3.5" />
            Google RCS Business Messaging
          </div>
        </div>

        {formError && (
          <div className="p-4 rounded-2xl bg-red-50 border border-red-200 flex items-start gap-2.5 text-red-700 text-xs">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Submission Error</p>
              <p>{formError}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Card 1: Client Information */}
          <div className="p-6 bg-white rounded-2xl border border-gray-200 shadow-xs space-y-4">
            <div className="flex items-center gap-2.5 pb-3 border-b border-gray-100">
              <div className="p-2 rounded-xl bg-blue-50 text-[#1677FF]">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">Client & Entity Information</h3>
                <p className="text-[11px] text-gray-500">Legal business entity details and primary communications point</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Brand Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  placeholder="e.g. Nexus Retail India"
                  required
                  className="w-full px-3.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Legal Company / Entity Name
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g. Nexus Commercial Retail Pvt Ltd"
                  className="w-full px-3.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  GST Number
                </label>
                <input
                  type="text"
                  value={gstNumber}
                  onChange={(e) => setGstNumber(e.target.value.toUpperCase())}
                  placeholder="e.g. 29ABCDE1234F1Z5"
                  className="w-full px-3.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl font-mono focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Official Website
                </label>
                <div className="relative">
                  <Globe className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                  <input
                    type="url"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="https://nexusretail.in"
                    className="w-full pl-9 pr-3.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-gray-100">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Contact Person Name
                </label>
                <input
                  type="text"
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                  placeholder="e.g. Rahul Sharma"
                  className="w-full px-3.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Contact Number
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                  <input
                    type="tel"
                    value={contactNumber}
                    onChange={(e) => setContactNumber(e.target.value)}
                    placeholder="+91 98450 11223"
                    className="w-full pl-9 pr-3.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Contact Email
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                  <input
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="contact@company.com"
                    className="w-full pl-9 pr-3.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: RCS Provisioning & Status */}
          <div className="p-6 bg-white rounded-2xl border border-gray-200 shadow-xs space-y-4">
            <div className="flex items-center gap-2.5 pb-3 border-b border-gray-100">
              <div className="p-2 rounded-xl bg-blue-50 text-[#1677FF]">
                <Radio className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">RCS Provisioning & Operations</h3>
                <p className="text-[11px] text-gray-500">Agent registration, status lifecycle, and operational notes</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  RCS Business Display Name
                </label>
                <input
                  type="text"
                  value={rcsBusinessName}
                  onChange={(e) => setRcsBusinessName(e.target.value)}
                  placeholder="e.g. Nexus India Verified"
                  className="w-full px-3.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  RCS Agent / Sender ID
                </label>
                <input
                  type="text"
                  value={rcsAgentId}
                  onChange={(e) => setRcsAgentId(e.target.value)}
                  placeholder="e.g. nexus_retail_bot_v1"
                  className="w-full px-3.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl font-mono focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  RCS Onboarding Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as OnboardingStatus)}
                  className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
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
                  Assigned Employee
                </label>
                <select
                  value={assignedTo}
                  onChange={(e) => setAssignedTo(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
                >
                  <option value="">-- Unassigned --</option>
                  {(teamMembers || []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.full_name} ({m.corporate_email})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Internal Operational Notes
              </label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any carrier approval notes, bot configuration parameters, or webhook references..."
                className="w-full px-3.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1677FF]"
              />
            </div>
          </div>

          {/* Card 3: Attach RCS Media Assets & Compliance Documents */}
          <div className="p-6 bg-white rounded-2xl border border-gray-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-50 text-[#1677FF]">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">Attach RCS Media Assets & Compliance Documents</h3>
                  <p className="text-xs text-gray-500">
                    Upload official RCS Brand Logo, Hero Banner, GST Certificate, and PAN Card
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-100">
                Media & Vault Attachment
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* RCS Logo */}
              <div className="p-3.5 bg-gray-50/80 border border-gray-200 rounded-xl space-y-2">
                <span className="text-xs font-bold text-gray-800">1. RCS Brand Logo (1:1 Ratio)</span>
                <p className="text-[10px] text-gray-500">JPG, PNG, WebP (Max 10MB)</p>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                  onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
                  className="w-full text-[11px] text-gray-500 file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-[11px] file:font-semibold file:bg-blue-50 file:text-[#1677FF] hover:file:bg-blue-100 cursor-pointer"
                />
                {logoFile && (
                  <p className="text-[10px] text-emerald-600 font-semibold truncate flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> {logoFile.name}
                  </p>
                )}
              </div>

              {/* RCS Hero Banner */}
              <div className="p-3.5 bg-gray-50/80 border border-gray-200 rounded-xl space-y-2">
                <span className="text-xs font-bold text-gray-800">2. RCS Hero Banner (3:1 / 16:9)</span>
                <p className="text-[10px] text-gray-500">JPG, PNG, WebP (Max 10MB)</p>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                  onChange={(e) => setBannerFile(e.target.files?.[0] || null)}
                  className="w-full text-[11px] text-gray-500 file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-[11px] file:font-semibold file:bg-blue-50 file:text-[#1677FF] hover:file:bg-blue-100 cursor-pointer"
                />
                {bannerFile && (
                  <p className="text-[10px] text-emerald-600 font-semibold truncate flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> {bannerFile.name}
                  </p>
                )}
              </div>

              {/* GST Certificate */}
              <div className="p-3.5 bg-gray-50/80 border border-gray-200 rounded-xl space-y-2">
                <span className="text-xs font-bold text-gray-800">3. GST Certificate</span>
                <p className="text-[10px] text-gray-500">PDF, JPG, PNG, DOCX</p>
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
                <span className="text-xs font-bold text-gray-800">4. PAN Card</span>
                <p className="text-[10px] text-gray-500">PDF, JPG, PNG, DOCX</p>
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
            </div>
          </div>

          {/* Actions with Primary Submit Button */}
          <div className="flex items-center justify-end gap-3 pt-3">
            <button
              type="button"
              onClick={() => navigate('/rcs')}
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
                  ? 'Saving Changes...'
                  : 'Submitting RCS Onboarding...'
                : isEditing
                ? 'Save Changes'
                : 'Submit RCS Onboarding'}
            </button>
          </div>
        </form>
      </div>

      {/* Submission Success Confirmation Modal */}
      {successModalData && (
        <SubmissionSuccessModal
          open={successModalData.open}
          onClose={() => {
            setSuccessModalData(null);
            navigate(`/rcs/${successModalData.recordId}`);
          }}
          onViewRecord={() => {
            setSuccessModalData(null);
            navigate(`/rcs/${successModalData.recordId}`);
          }}
          type="rcs"
          brandName={successModalData.brandName}
          recordId={successModalData.recordId}
          submittedAt={successModalData.submittedAt}
          status={successModalData.status}
        />
      )}
    </PageLayout>
  );
}

export default RcsForm;
