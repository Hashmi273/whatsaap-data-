import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Search, Plus, Building2, MessageSquare, Phone, ShieldCheck, ShieldAlert,
  CheckCircle2, AlertTriangle, Clock3, ExternalLink, Save, X, ChevronRight,
  FileText, Users, Hash, RefreshCw
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { PageLayout } from '@/components/layout/PageLayout';
import { useToast } from '@/lib/toast';
import { logAudit } from '@/lib/audit';
import { hasPermission } from '@/lib/permissions';

interface ClientRecord { id: string; brand_name: string; company_name: string; whatsapp_number: string; status: string; }
interface MetaAsset {
  id: string; onboarding_id: string; portfolio_name: string; portfolio_id: string; portfolio_owner: string;
  meta_login_email: string; verification_status: string; verification_checked_at: string | null;
  waba_name: string; waba_id: string; waba_status: string; messaging_limit: string;
  admin_access_status: string; admin_notes: string; recovery_email: string; recovery_phone: string;
  login_url: string; notes: string;
}
interface PhoneNumber { id: string; meta_asset_id: string; phone_number: string; phone_number_id: string; display_name: string; quality_rating: string; status: string; mapped_waba_id: string; }

const emptyAsset: Omit<MetaAsset, 'id'> = {
  onboarding_id: '', portfolio_name: '', portfolio_id: '', portfolio_owner: '', meta_login_email: '',
  verification_status: 'unknown', verification_checked_at: null, waba_name: '', waba_id: '',
  waba_status: 'unknown', messaging_limit: '', admin_access_status: 'unknown', admin_notes: '',
  recovery_email: '', recovery_phone: '', login_url: 'https://business.facebook.com', notes: ''
};

const statusMeta: Record<string, { label: string; cls: string; icon: typeof CheckCircle2 }> = {
  verified: { label: 'Verified', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  pending: { label: 'Pending', cls: 'bg-amber-50 text-amber-700 border-amber-200', icon: Clock3 },
  not_verified: { label: 'Not Verified', cls: 'bg-red-50 text-red-700 border-red-200', icon: ShieldAlert },
  restricted: { label: 'Restricted', cls: 'bg-red-50 text-red-700 border-red-200', icon: ShieldAlert },
  unknown: { label: 'Not Checked', cls: 'bg-gray-50 text-gray-600 border-gray-200', icon: AlertTriangle },
  active: { label: 'Active', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  disabled: { label: 'Disabled', cls: 'bg-red-50 text-red-700 border-red-200', icon: ShieldAlert },
  available: { label: 'Available', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  limited: { label: 'Limited', cls: 'bg-amber-50 text-amber-700 border-amber-200', icon: AlertTriangle },
  missing: { label: 'Missing', cls: 'bg-red-50 text-red-700 border-red-200', icon: ShieldAlert },
};

function Badge({ value }: { value: string }) {
  const meta = statusMeta[value] || statusMeta.unknown;
  const Icon = meta.icon;
  return <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full border text-[11px] font-semibold ${meta.cls}`}><Icon className="w-3 h-3" />{meta.label}</span>;
}

export function MetaAssetRegistry() {
  const { profile } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const canEdit = hasPermission(profile?.role, 'onboarding:edit');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Omit<MetaAsset, 'id'>>(emptyAsset);
  const [phoneDraft, setPhoneDraft] = useState({ phone_number: '', phone_number_id: '', display_name: '', status: 'unknown', quality_rating: 'unknown', mapped_waba_id: '' });

  const { data: clients = [], isLoading: clientsLoading } = useQuery({
    queryKey: ['meta-registry-clients'],
    queryFn: async () => {
      const { data, error } = await supabase.from('onboarding_records').select('id, brand_name, company_name, whatsapp_number, status').order('brand_name');
      if (error) throw error;
      return (data || []) as ClientRecord[];
    },
  });

  const { data: assets = [], isLoading: assetsLoading } = useQuery({
    queryKey: ['meta-business-assets'],
    queryFn: async () => {
      const { data, error } = await supabase.from('meta_business_assets').select('*');
      if (error) return [] as MetaAsset[];
      return (data || []) as MetaAsset[];
    },
  });

  const { data: phones = [] } = useQuery({
    queryKey: ['meta-phone-numbers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('meta_phone_numbers').select('*').order('created_at', { ascending: false });
      if (error) return [] as PhoneNumber[];
      return (data || []) as PhoneNumber[];
    },
  });

  const saveAsset = useMutation({
    mutationFn: async (payload: Omit<MetaAsset, 'id'>) => {
      const { data, error } = await supabase.from('meta_business_assets').upsert(payload, { onConflict: 'onboarding_id' }).select().single();
      if (error) throw error;
      return data as MetaAsset;
    },
    onSuccess: async (data) => {
      await logAudit('meta_asset_updated', 'meta_asset', data.id, { onboarding_id: data.onboarding_id });
      toast.success('Meta profile saved', 'Business Portfolio and WhatsApp account details updated.');
      queryClient.invalidateQueries({ queryKey: ['meta-business-assets'] });
      setSelectedId(data.id); setShowForm(false);
    },
    onError: (e: any) => toast.error('Save failed', e.message || 'Could not save Meta asset.')
  });

  const addPhone = useMutation({
    mutationFn: async ({ assetId, phone }: { assetId: string; phone: typeof phoneDraft }) => {
      const { error } = await supabase.from('meta_phone_numbers').insert({ meta_asset_id: assetId, ...phone });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Number mapped', 'Phone number has been added to this WABA.');
      setPhoneDraft({ phone_number: '', phone_number_id: '', display_name: '', status: 'unknown', quality_rating: 'unknown', mapped_waba_id: '' });
      queryClient.invalidateQueries({ queryKey: ['meta-phone-numbers'] });
    },
    onError: (e: any) => toast.error('Could not map number', e.message || 'Please check the database migration.')
  });

  const selectedAsset = assets.find(a => a.id === selectedId) || null;
  const selectedClient = clients.find(c => c.id === selectedAsset?.onboarding_id);
  const selectedPhones = phones.filter(p => p.meta_asset_id === selectedId);

  const rows = useMemo(() => clients.filter(c => {
    const a = assets.find(x => x.onboarding_id === c.id);
    const hay = `${c.brand_name} ${c.company_name} ${c.whatsapp_number} ${a?.portfolio_name || ''} ${a?.portfolio_id || ''} ${a?.waba_id || ''}`.toLowerCase();
    return hay.includes(search.toLowerCase());
  }), [clients, assets, search]);

  const completeness = (asset?: MetaAsset) => {
    if (!asset) return 0;
    const fields = [asset.portfolio_name, asset.portfolio_id, asset.waba_name, asset.waba_id, asset.meta_login_email, asset.messaging_limit, asset.admin_access_status, asset.recovery_email || asset.recovery_phone];
    return Math.round(fields.filter(Boolean).length / fields.length * 100);
  };

  const startNew = (clientId: string) => {
    const existing = assets.find(a => a.onboarding_id === clientId);
    setForm(existing ? { ...existing } : { ...emptyAsset, onboarding_id: clientId });
    setSelectedId(existing?.id || null);
    setShowForm(true);
  };

  return (
    <PageLayout title="Meta & WhatsApp Assets">
      <div className="space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2"><h2 className="text-2xl font-bold text-gray-900">Meta & WhatsApp Asset Registry</h2><span className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide bg-blue-50 text-blue-700 rounded-full">Business Continuity</span></div>
            <p className="text-sm text-gray-500 mt-1">Keep Portfolio, WABA, phone-number mapping, verification and handover information in one place.</p>
          </div>
          <button onClick={() => { setShowForm(true); setForm({ ...emptyAsset, onboarding_id: clients[0]?.id || '' }); }} disabled={!canEdit || clients.length === 0} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#1677FF] text-white text-sm font-semibold hover:bg-[#0B5FE0] disabled:opacity-50"><Plus className="w-4 h-4" /> Add Meta Profile</button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white border border-gray-200 rounded-2xl p-4"><p className="text-xs text-gray-500">Clients</p><p className="text-2xl font-bold text-gray-900 mt-1">{clients.length}</p></div>
          <div className="bg-white border border-gray-200 rounded-2xl p-4"><p className="text-xs text-gray-500">Meta Profiles</p><p className="text-2xl font-bold text-gray-900 mt-1">{assets.length}</p></div>
          <div className="bg-white border border-gray-200 rounded-2xl p-4"><p className="text-xs text-gray-500">Verified</p><p className="text-2xl font-bold text-emerald-700 mt-1">{assets.filter(a => a.verification_status === 'verified').length}</p></div>
          <div className="bg-white border border-gray-200 rounded-2xl p-4"><p className="text-xs text-gray-500">Needs Documentation</p><p className="text-2xl font-bold text-amber-600 mt-1">{assets.filter(a => completeness(a) < 75).length}</p></div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <div className="relative"><Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search client, Portfolio name/ID, WABA ID or phone..." className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500" /></div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <div className="xl:col-span-1 bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 font-semibold text-gray-900">Client Accounts</div>
            <div className="max-h-[620px] overflow-y-auto divide-y divide-gray-100">
              {clientsLoading || assetsLoading ? <div className="p-6 text-sm text-gray-500">Loading accounts...</div> : rows.map(client => {
                const asset = assets.find(a => a.onboarding_id === client.id); const pct = completeness(asset);
                return <button key={client.id} onClick={() => { setSelectedId(asset?.id || null); if (asset) setForm({ ...asset }); }} className={`w-full text-left p-4 hover:bg-blue-50/50 transition ${selectedAsset?.onboarding_id === client.id ? 'bg-blue-50 border-l-4 border-blue-500' : ''}`}>
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-semibold text-gray-900 truncate">{client.brand_name}</p><p className="text-xs text-gray-500 truncate">{client.company_name || client.whatsapp_number}</p></div><ChevronRight className="w-4 h-4 text-gray-400 mt-1" /></div>
                  <div className="mt-3 flex items-center justify-between text-[11px]"><span className="text-gray-500">Documentation</span><span className={`font-bold ${pct >= 75 ? 'text-emerald-600' : 'text-amber-600'}`}>{pct}%</span></div><div className="h-1.5 bg-gray-100 rounded-full mt-1.5 overflow-hidden"><div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} /></div>
                </button>;
              })}
              {!clientsLoading && rows.length === 0 && <div className="p-6 text-sm text-gray-500">No matching clients.</div>}
            </div>
          </div>

          <div className="xl:col-span-2 space-y-5">
            {!selectedAsset ? <div className="bg-white border border-dashed border-gray-300 rounded-2xl min-h-[500px] flex flex-col items-center justify-center text-center p-8"><div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center"><Building2 className="w-7 h-7 text-blue-600" /></div><h3 className="mt-4 font-bold text-gray-900">Select a client account</h3><p className="text-sm text-gray-500 mt-1 max-w-md">Select an existing Meta profile or add one to start documenting Portfolio, WABA and phone-number ownership.</p></div> : <>
              <div className="bg-white border border-gray-200 rounded-2xl p-5">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4"><div><p className="text-xs text-gray-500 uppercase tracking-wide">Client</p><h3 className="text-xl font-bold text-gray-900 mt-1">{selectedClient?.brand_name}</h3><p className="text-sm text-gray-500">{selectedClient?.company_name}</p></div><div className="flex items-center gap-2"><Badge value={selectedAsset.verification_status} />{canEdit && <button onClick={() => { setForm({ ...selectedAsset }); setShowForm(true); }} className="px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold hover:bg-gray-50">Edit</button>}</div></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5"><Info icon={Building2} label="Business Portfolio" value={selectedAsset.portfolio_name || 'Not documented'} /><Info icon={Hash} label="Portfolio ID" value={selectedAsset.portfolio_id || 'Not documented'} mono /><Info icon={MessageSquare} label="WABA" value={selectedAsset.waba_name || 'Not documented'} /><Info icon={Hash} label="WABA ID" value={selectedAsset.waba_id || 'Not documented'} mono /><Info icon={Users} label="Portfolio Owner" value={selectedAsset.portfolio_owner || 'Not documented'} /><Info icon={ShieldCheck} label="Messaging Limit" value={selectedAsset.messaging_limit || 'Not documented'} /></div>
                <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3"><MiniStatus label="Business Verification" value={selectedAsset.verification_status} /><MiniStatus label="WABA Status" value={selectedAsset.waba_status} /><MiniStatus label="Admin Access" value={selectedAsset.admin_access_status} /></div>
              </div>

              <div className="bg-white border border-gray-200 rounded-2xl p-5"><div className="flex items-center justify-between"><div><h3 className="font-bold text-gray-900">Mapped Phone Numbers</h3><p className="text-xs text-gray-500 mt-1">Record which number belongs to which WABA.</p></div>{selectedAsset.waba_id && <Badge value={selectedAsset.waba_status} />}</div><div className="mt-4 space-y-2">{selectedPhones.map(p => <div key={p.id} className="flex flex-col md:flex-row md:items-center justify-between gap-2 p-3 bg-gray-50 rounded-xl border border-gray-100"><div className="flex items-center gap-3"><div className="w-9 h-9 rounded-lg bg-white border border-gray-200 flex items-center justify-center"><Phone className="w-4 h-4 text-blue-600" /></div><div><p className="font-semibold text-sm text-gray-900">{p.phone_number}</p><p className="text-[11px] text-gray-500">{p.display_name || 'No display name'} · Phone ID: {p.phone_number_id || '—'}</p></div></div><div className="flex items-center gap-2"><span className="text-[11px] text-gray-500">Quality: {p.quality_rating}</span><Badge value={p.status} /></div></div>)}{selectedPhones.length === 0 && <p className="text-sm text-gray-500 py-4">No phone numbers mapped yet.</p>}</div>{canEdit && <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-1 md:grid-cols-4 gap-2"><input placeholder="+91 98xxxxxx" value={phoneDraft.phone_number} onChange={e => setPhoneDraft({ ...phoneDraft, phone_number: e.target.value })} className="px-3 py-2 text-xs border border-gray-200 rounded-lg" /><input placeholder="Phone Number ID" value={phoneDraft.phone_number_id} onChange={e => setPhoneDraft({ ...phoneDraft, phone_number_id: e.target.value })} className="px-3 py-2 text-xs border border-gray-200 rounded-lg" /><input placeholder="Display name" value={phoneDraft.display_name} onChange={e => setPhoneDraft({ ...phoneDraft, display_name: e.target.value })} className="px-3 py-2 text-xs border border-gray-200 rounded-lg" /><button disabled={!phoneDraft.phone_number || addPhone.isPending} onClick={() => addPhone.mutate({ assetId: selectedAsset.id, phone: phoneDraft })} className="px-3 py-2 bg-gray-900 text-white rounded-lg text-xs font-semibold disabled:opacity-50"><Plus className="inline w-3 h-3 mr-1" />Map Number</button></div>}</div>

              <div className="bg-white border border-gray-200 rounded-2xl p-5"><div className="flex items-center gap-2"><FileText className="w-5 h-5 text-blue-600" /><div><h3 className="font-bold text-gray-900">Continuity & Recovery</h3><p className="text-xs text-gray-500">Operational information to avoid dependency on one employee/vendor.</p></div></div><div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5"><Info icon={Users} label="Admin Access" value={selectedAsset.admin_access_status} /><Info icon={FileText} label="Recovery Email" value={selectedAsset.recovery_email || 'Not documented'} /><Info icon={Phone} label="Recovery Phone" value={selectedAsset.recovery_phone || 'Not documented'} /><Info icon={ExternalLink} label="Meta Login" value={selectedAsset.meta_login_email || 'Not documented'} /></div>{selectedAsset.admin_notes && <div className="mt-4 p-3 rounded-xl bg-amber-50 border border-amber-100 text-xs text-amber-800"><b>Admin notes:</b> {selectedAsset.admin_notes}</div>}</div>
            </>}
          </div>
        </div>
      </div>

      {showForm && <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"><div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl"><div className="sticky top-0 bg-white z-10 px-5 py-4 border-b border-gray-200 flex items-center justify-between"><div><h3 className="font-bold text-gray-900">Meta Business Profile</h3><p className="text-xs text-gray-500">Document facts and ownership — never store access tokens here.</p></div><button onClick={() => setShowForm(false)} className="p-2 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button></div><form onSubmit={e => { e.preventDefault(); saveAsset.mutate(form); }} className="p-5 space-y-5"><div><label className="label">Client</label><select value={form.onboarding_id} onChange={e => setForm({ ...form, onboarding_id: e.target.value })} className="input" required><option value="">Select client</option>{clients.map(c => <option key={c.id} value={c.id}>{c.brand_name}{c.company_name ? ` — ${c.company_name}` : ''}</option>)}</select></div><Section title="Meta Business Portfolio"><div className="grid md:grid-cols-2 gap-3"><Field label="Portfolio Name" value={form.portfolio_name} onChange={v => setForm({ ...form, portfolio_name: v })} /><Field label="Portfolio ID" value={form.portfolio_id} onChange={v => setForm({ ...form, portfolio_id: v })} /><Field label="Portfolio Owner" value={form.portfolio_owner} onChange={v => setForm({ ...form, portfolio_owner: v })} /><Field label="Meta Login Email" value={form.meta_login_email} onChange={v => setForm({ ...form, meta_login_email: v })} /></div></Section><Section title="Verification & Limits"><div className="grid md:grid-cols-3 gap-3"><SelectField label="Verification" value={form.verification_status} options={['verified','pending','not_verified','restricted','unknown']} onChange={v => setForm({ ...form, verification_status: v })} /><Field label="Messaging / Account Limit" value={form.messaging_limit} onChange={v => setForm({ ...form, messaging_limit: v })} /><SelectField label="Admin Access" value={form.admin_access_status} options={['available','limited','missing','unknown']} onChange={v => setForm({ ...form, admin_access_status: v })} /></div></Section><Section title="WhatsApp Business Account"><div className="grid md:grid-cols-2 gap-3"><Field label="WABA Name" value={form.waba_name} onChange={v => setForm({ ...form, waba_name: v })} /><Field label="WABA ID" value={form.waba_id} onChange={v => setForm({ ...form, waba_id: v })} /><SelectField label="WABA Status" value={form.waba_status} options={['active','pending','restricted','disabled','unknown']} onChange={v => setForm({ ...form, waba_status: v })} /><Field label="Login URL" value={form.login_url} onChange={v => setForm({ ...form, login_url: v })} /></div></Section><Section title="Recovery & Handover"><div className="grid md:grid-cols-2 gap-3"><Field label="Recovery Email" value={form.recovery_email} onChange={v => setForm({ ...form, recovery_email: v })} /><Field label="Recovery Phone" value={form.recovery_phone} onChange={v => setForm({ ...form, recovery_phone: v })} /><Field label="Admin / Handover Notes" value={form.admin_notes} onChange={v => setForm({ ...form, admin_notes: v })} textarea /><Field label="General Notes" value={form.notes} onChange={v => setForm({ ...form, notes: v })} textarea /></div></Section><div className="flex justify-end gap-2 pt-2"><button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold">Cancel</button><button type="submit" disabled={saveAsset.isPending || !form.onboarding_id} className="px-4 py-2 rounded-xl bg-[#1677FF] text-white text-sm font-semibold disabled:opacity-50"><Save className="inline w-4 h-4 mr-1" />{saveAsset.isPending ? 'Saving...' : 'Save Profile'}</button></div></form></div></div>}
    </PageLayout>
  );
}

function Info({ icon: Icon, label, value, mono = false }: { icon: typeof Building2; label: string; value: string; mono?: boolean }) { return <div className="p-3 bg-gray-50 rounded-xl"><div className="flex items-center gap-2 text-[11px] text-gray-500"><Icon className="w-3.5 h-3.5" />{label}</div><p className={`mt-1.5 text-sm font-semibold text-gray-900 break-all ${mono ? 'font-mono' : ''}`}>{value}</p></div>; }
function MiniStatus({ label, value }: { label: string; value: string }) { return <div className="p-3 rounded-xl border border-gray-100"><p className="text-[11px] text-gray-500 mb-2">{label}</p><Badge value={value} /></div>; }
function Section({ title, children }: { title: string; children: React.ReactNode }) { return <div className="p-4 rounded-xl border border-gray-200"><h4 className="font-semibold text-sm text-gray-900 mb-3">{title}</h4>{children}</div>; }
function Field({ label, value, onChange, textarea = false }: { label: string; value: string; onChange: (v: string) => void; textarea?: boolean }) { return <label className="block"><span className="label">{label}</span>{textarea ? <textarea rows={3} value={value} onChange={e => onChange(e.target.value)} className="input resize-none" /> : <input value={value} onChange={e => onChange(e.target.value)} className="input" />}</label>; }
function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) { return <label className="block"><span className="label">{label}</span><select value={value} onChange={e => onChange(e.target.value)} className="input">{options.map(x => <option key={x} value={x}>{x.replaceAll('_', ' ')}</option>)}</select></label>; }
