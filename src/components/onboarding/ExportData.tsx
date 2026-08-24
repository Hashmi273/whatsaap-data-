// ============================================================
// Export Data Component
// Exports onboarding data to Excel/CSV.
// SECURITY: Passwords excluded by default. Warning shown before export.
// ============================================================

import { useState, useCallback } from 'react';
import { Download, AlertTriangle, X, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { logAudit } from '@/lib/audit';
import { formatStatusLabel } from '@/types/database';

interface ExportDataProps {
  open: boolean;
  onClose: () => void;
}

export function ExportData({ open, onClose }: ExportDataProps) {
  const { profile } = useAuth();
  const toast = useToast();
  const [exporting, setExporting] = useState(false);
  const [format, setFormat] = useState<'xlsx' | 'csv'>('xlsx');
  const [includeCredentials, setIncludeCredentials] = useState(false);
  const [showCredentialWarning, setShowCredentialWarning] = useState(false);

  const handleExport = useCallback(async () => {
    // SECURITY: Show double confirmation for credential export
    if (includeCredentials && !showCredentialWarning) {
      setShowCredentialWarning(true);
      return;
    }

    setExporting(true);

    try {
      // Fetch records
      const query = supabase
        .from('onboarding_records')
        .select(`
          brand_name, company_name, whatsapp_number, contact_person,
          contact_email, contact_number, username, platform, login_url,
          status, onboarding_date, notes, created_at, updated_at,
          assigned_profile:profiles!onboarding_records_assigned_to_fkey(full_name)
        `)
        .order('created_at', { ascending: false });

      const { data, error } = await query;
      if (error) throw error;

      // Transform for export — SECURITY: exclude credentials by default
      const exportRows = (data || []).map(row => {
        const base: Record<string, string> = {
          'Brand Name': row.brand_name,
          'Company Name': row.company_name,
          'WhatsApp Number': row.whatsapp_number,
          'Contact Person': row.contact_person,
          'Contact Email': row.contact_email,
          'Contact Number': row.contact_number,
          'Username': row.username,
          'Platform': row.platform,
          'Login URL': row.login_url,
          'Status': formatStatusLabel(row.status),
          'Onboarding Date': row.onboarding_date,
          'Assigned To': (row.assigned_profile as any)?.full_name || '',
          'Notes': row.notes,
          'Created': row.created_at,
          'Updated': row.updated_at,
        };

        // SECURITY: Only include credentials if explicitly requested by admin
        if (includeCredentials && profile?.role === 'super_admin') {
          base['Password/Credential'] = '[ENCRYPTED - View in portal]';
        }

        return base;
      });

      // Generate file
      const ws = XLSX.utils.json_to_sheet(exportRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Onboarding Records');

      const fileName = `onboarding-export-${new Date().toISOString().split('T')[0]}`;

      if (format === 'xlsx') {
        XLSX.writeFile(wb, `${fileName}.xlsx`);
      } else {
        XLSX.writeFile(wb, `${fileName}.csv`, { bookType: 'csv' });
      }

      // Audit log
      await logAudit('data_exported', 'onboarding', undefined, {
        format,
        record_count: exportRows.length,
        included_credentials: includeCredentials,
      });

      toast.success('Export complete', `${exportRows.length} records exported.`);
      onClose();
    } catch (err) {
      console.error('Export error:', err);
      toast.error('Export failed', 'Could not export data. Please try again.');
    } finally {
      setExporting(false);
      setShowCredentialWarning(false);
      setIncludeCredentials(false);
    }
  }, [format, includeCredentials, showCredentialWarning, profile?.role, toast, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center modal-overlay">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md modal-content">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="w-5 h-5 text-blue-500" />
            <h2 className="text-lg font-semibold text-gray-900">Export Data</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Security Warning */}
          <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-amber-800">
              <p className="font-medium">Security Notice</p>
              <p className="mt-1">
                Exported data may contain sensitive business information.
                Do not share with unauthorized parties.
              </p>
            </div>
          </div>

          {/* Format Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Export Format</label>
            <div className="flex gap-3">
              <label className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border rounded-lg cursor-pointer transition-colors ${format === 'xlsx' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 hover:border-gray-300'}`}>
                <input
                  type="radio"
                  value="xlsx"
                  checked={format === 'xlsx'}
                  onChange={() => setFormat('xlsx')}
                  className="hidden"
                />
                <FileSpreadsheet className="w-4 h-4" />
                Excel (.xlsx)
              </label>
              <label className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border rounded-lg cursor-pointer transition-colors ${format === 'csv' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 hover:border-gray-300'}`}>
                <input
                  type="radio"
                  value="csv"
                  checked={format === 'csv'}
                  onChange={() => setFormat('csv')}
                  className="hidden"
                />
                <Download className="w-4 h-4" />
                CSV (.csv)
              </label>
            </div>
          </div>

          {/* Credential Warning */}
          {showCredentialWarning && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800 font-medium">
                ⚠️ Are you sure you want to include credential information?
              </p>
              <p className="text-xs text-red-600 mt-1">
                Note: Actual passwords cannot be exported. The export will show
                a placeholder. View credentials directly in the portal instead.
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {exporting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Export
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ExportData;
