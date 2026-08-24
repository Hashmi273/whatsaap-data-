// ============================================================
// Excel Import Component
// Allows Admin/Manager to upload an Excel file with onboarding data.
// SECURITY: Never logs imported passwords to console or audit metadata.
// ============================================================

import { useState, useCallback } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, XCircle, AlertTriangle, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { logAudit } from '@/lib/audit';
import type { OnboardingStatus } from '@/types/database';

interface ImportRow {
  username: string;
  password: string;
  brand_name: string;
  whatsapp_number: string;
  status: string;
  assigned_employee: string;
  onboarding_date: string;
  company_name?: string;
  contact_person?: string;
  contact_email?: string;
}

interface ParsedRow extends ImportRow {
  isValid: boolean;
  isDuplicate: boolean;
  errors: string[];
  rowIndex: number;
}

const VALID_STATUSES: OnboardingStatus[] = ['pending', 'in_progress', 'live', 'rejected', 'completed', 'inactive'];

interface ImportExcelProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function ImportExcel({ open, onClose, onSuccess }: ImportExcelProps) {
  const { profile } = useAuth();
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [step, setStep] = useState<'upload' | 'preview' | 'complete'>('upload');

  const resetState = useCallback(() => {
    setFile(null);
    setParsedRows([]);
    setImporting(false);
    setStep('upload');
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [onClose, resetState]);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    if (!f.name.match(/\.(xlsx|xls)$/i)) {
      toast.error('Invalid file type', 'Please upload an Excel file (.xlsx or .xls)');
      return;
    }

    setFile(f);

    try {
      const data = await f.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows: ImportRow[] = XLSX.utils.sheet_to_json(sheet);

      // Fetch existing records for duplicate detection
      const { data: existing } = await supabase
        .from('onboarding_records')
        .select('whatsapp_number, brand_name');

      const existingSet = new Set(
        (existing || []).map(r => `${r.brand_name}::${r.whatsapp_number}`)
      );

      const parsed: ParsedRow[] = rawRows.map((row, idx) => {
        const errors: string[] = [];

        if (!row.brand_name?.trim()) errors.push('Brand name is required');
        if (!row.whatsapp_number?.trim()) errors.push('WhatsApp number is required');
        if (row.status && !VALID_STATUSES.includes(row.status as OnboardingStatus)) {
          errors.push(`Invalid status: ${row.status}`);
        }

        const isDuplicate = existingSet.has(`${row.brand_name}::${row.whatsapp_number}`);
        if (isDuplicate) errors.push('Duplicate: record already exists');

        return {
          ...row,
          isValid: errors.length === 0,
          isDuplicate,
          errors,
          rowIndex: idx + 2, // Excel row (1-indexed + header)
        };
      });

      setParsedRows(parsed);
      setStep('preview');
    } catch {
      toast.error('Error reading file', 'Could not parse the Excel file. Please check the format.');
    }
  }, [toast]);

  const handleImport = useCallback(async () => {
    const validRows = parsedRows.filter(r => r.isValid);
    if (validRows.length === 0) {
      toast.warning('No valid rows', 'There are no valid rows to import.');
      return;
    }

    setImporting(true);

    try {
      const records = validRows.map(row => ({
        brand_name: row.brand_name.trim(),
        company_name: row.company_name?.trim() || '',
        whatsapp_number: row.whatsapp_number.trim(),
        username: row.username?.trim() || '',
        credential_encrypted: row.password || '', // DB trigger handles encryption
        status: (row.status as OnboardingStatus) || 'pending',
        onboarding_date: row.onboarding_date || new Date().toISOString().split('T')[0],
        contact_person: row.contact_person?.trim() || '',
        contact_email: row.contact_email?.trim() || '',
        created_by: profile?.id,
      }));

      const { error } = await supabase.from('onboarding_records').insert(records);

      if (error) throw error;

      // SECURITY: Log import without any credential data in metadata
      await logAudit('excel_imported', 'onboarding', undefined, {
        rows_imported: validRows.length,
        rows_skipped: parsedRows.length - validRows.length,
        // NEVER log passwords or credential values
      });

      toast.success('Import successful', `${validRows.length} records imported.`);
      setStep('complete');
      onSuccess();
    } catch (err) {
      toast.error('Import failed', 'An error occurred while importing records. Please try again.');
      console.error('Import error:', err);
    } finally {
      setImporting(false);
    }
  }, [parsedRows, profile?.id, toast, onSuccess]);

  if (!open) return null;

  const validCount = parsedRows.filter(r => r.isValid).length;
  const invalidCount = parsedRows.filter(r => !r.isValid && !r.isDuplicate).length;
  const duplicateCount = parsedRows.filter(r => r.isDuplicate).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center modal-overlay">
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] overflow-hidden modal-content">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="w-5 h-5 text-blue-500" />
            <h2 className="text-lg font-semibold text-gray-900">Import from Excel</h2>
          </div>
          <button onClick={handleClose} className="p-1 rounded-lg hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 overflow-y-auto max-h-[calc(80vh-130px)]">
          {step === 'upload' && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4">
                <Upload className="w-8 h-8 text-blue-500" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Upload Excel File</h3>
              <p className="text-sm text-gray-500 mb-1">
                Upload an .xlsx or .xls file with columns:
              </p>
              <p className="text-xs text-gray-400 mb-6 text-center">
                brand_name, whatsapp_number, username, password, status, assigned_employee, onboarding_date
              </p>
              <label className="cursor-pointer px-6 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium text-sm transition-colors">
                Choose File
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            </div>
          )}

          {step === 'preview' && (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-4 gap-3 mb-4">
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-gray-900">{parsedRows.length}</p>
                  <p className="text-xs text-gray-500">Total Rows</p>
                </div>
                <div className="bg-emerald-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-600">{validCount}</p>
                  <p className="text-xs text-emerald-600">Valid</p>
                </div>
                <div className="bg-red-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-red-600">{invalidCount}</p>
                  <p className="text-xs text-red-600">Invalid</p>
                </div>
                <div className="bg-amber-50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-amber-600">{duplicateCount}</p>
                  <p className="text-xs text-amber-600">Duplicates</p>
                </div>
              </div>

              {/* Preview Table */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="px-3 py-2 text-left font-medium text-gray-600">Row</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">Status</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">Brand</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">Number</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">Username</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">Issues</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedRows.slice(0, 50).map((row, i) => (
                        <tr key={i} className={`border-b border-gray-100 ${!row.isValid ? 'bg-red-50/50' : ''}`}>
                          <td className="px-3 py-2 text-gray-500">{row.rowIndex}</td>
                          <td className="px-3 py-2">
                            {row.isValid ? (
                              <CheckCircle className="w-4 h-4 text-emerald-500" />
                            ) : row.isDuplicate ? (
                              <AlertTriangle className="w-4 h-4 text-amber-500" />
                            ) : (
                              <XCircle className="w-4 h-4 text-red-500" />
                            )}
                          </td>
                          <td className="px-3 py-2 font-medium text-gray-900">{row.brand_name}</td>
                          <td className="px-3 py-2 text-gray-600">{row.whatsapp_number}</td>
                          <td className="px-3 py-2 text-gray-600">{row.username}</td>
                          <td className="px-3 py-2 text-xs text-red-600">
                            {row.errors.join(', ')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {parsedRows.length > 50 && (
                <p className="text-xs text-gray-400 mt-2 text-center">
                  Showing first 50 of {parsedRows.length} rows
                </p>
              )}
            </>
          )}

          {step === 'complete' && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mb-4">
                <CheckCircle className="w-8 h-8 text-emerald-500" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Import Complete</h3>
              <p className="text-sm text-gray-500">
                {validCount} records were successfully imported.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          {step === 'preview' && (
            <>
              <button
                onClick={resetState}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={importing || validCount === 0}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {importing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Importing...
                  </>
                ) : (
                  `Confirm Import (${validCount} rows)`
                )}
              </button>
            </>
          )}
          {step === 'complete' && (
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default ImportExcel;
