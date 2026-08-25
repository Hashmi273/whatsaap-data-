import JSZip from 'jszip';
import type { OnboardingRecord, OnboardingDocument } from '@/types/database';

export async function downloadClientBackupZip(
  record: OnboardingRecord,
  documents: OnboardingDocument[],
  toast: {
    info: (title: string, message: string) => void;
    success: (title: string, message: string) => void;
    error: (title: string, message: string) => void;
  }
) {
  const companyName = (record.company_name || record.brand_name || 'Client').replace(/[^a-zA-Z0-9_-]/g, '_');
  toast.info('Packaging Archive', `Preparing complete Disaster Recovery ZIP backup for ${record.brand_name}...`);

  try {
    const zip = new JSZip();
    const rootFolder = zip.folder(`${companyName}_IMMENSE_BACKUP`);

    if (!rootFolder) throw new Error('Could not create ZIP folder root.');

    // 1. Client Summary Manifest (.txt)
    const summaryText = `=====================================================
IMMENSE ENTERPRISE DISASTER RECOVERY ARCHIVE
=====================================================
Target Archive Account: parvejweb1@gmail.com
Generated Timestamp: ${new Date().toISOString()}

CLIENT IDENTIFICATION:
- Brand Name: ${record.brand_name}
- Company Name: ${record.company_name || 'N/A'}
- Primary Number: ${record.whatsapp_number}
- Contact Person: ${record.contact_person || 'N/A'}
- Contact Email: ${record.contact_email || 'N/A'}
- Contact Number: ${record.contact_number || 'N/A'}
- Platform / Gateway: ${record.platform || 'WhatsApp / RCS'}
- Status: ${record.status}
- Onboarding Date: ${record.onboarding_date || 'N/A'}
- Vault Reference ID: ${record.id}

BACKUP STRUCTURE:
├── GST/
├── PAN/
├── Logo/
├── Banner/
└── Other_Documents/

Total Attached Documents: ${documents.length}
=====================================================
CONFIDENTIAL & PROPRIETARY — IMMENSE SMART SOLUTIONS
=====================================================`;

    rootFolder.file('Client_Summary.txt', summaryText);

    // 2. Client Profile JSON (.json)
    const jsonMetadata = {
      manifestVersion: '1.0.0',
      archiveSource: 'Immense Enterprise Secondary Backup',
      backupAccount: 'parvejweb1@gmail.com',
      exportDate: new Date().toISOString(),
      record,
      documentsCount: documents.length,
      documentsList: documents.map((d) => ({
        id: d.id,
        fileName: d.file_name,
        category: d.category,
        fileSize: d.file_size,
        mimeType: d.mime_type,
        createdAt: d.created_at,
      })),
    };
    rootFolder.file('Client_Profile.json', JSON.stringify(jsonMetadata, null, 2));

    // 3. Create Categorized Subfolders
    const gstFolder = rootFolder.folder('GST');
    const panFolder = rootFolder.folder('PAN');
    const logoFolder = rootFolder.folder('Logo');
    const bannerFolder = rootFolder.folder('Banner');
    const otherFolder = rootFolder.folder('Other_Documents');

    // 4. Download and bundle each document into the matching folder
    for (const doc of documents) {
      const fileName = (doc.file_name || doc.original_name || 'document.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
      const cat = (doc.category || '').toLowerCase();

      let targetFolder = otherFolder;
      if (cat.includes('gst')) targetFolder = gstFolder;
      else if (cat.includes('pan')) targetFolder = panFolder;
      else if (cat.includes('logo')) targetFolder = logoFolder;
      else if (cat.includes('banner')) targetFolder = bannerFolder;

      if (!targetFolder) targetFolder = rootFolder;

      try {
        if ((doc as any).localPreviewUrl && typeof (doc as any).localPreviewUrl === 'string' && (doc as any).localPreviewUrl.startsWith('data:')) {
          // Convert data URI to blob
          const res = await fetch((doc as any).localPreviewUrl);
          const blob = await res.blob();
          targetFolder.file(fileName, blob);
        } else if (doc.storage_path) {
          // Fetch binary stream from download API
          const fetchUrl = `/api/download-document?path=${encodeURIComponent(doc.storage_path)}&name=${encodeURIComponent(fileName)}&disposition=inline`;
          const res = await fetch(fetchUrl);
          if (res.ok) {
            const blob = await res.blob();
            targetFolder.file(fileName, blob);
          } else {
            targetFolder.file(fileName, `IMMENSE Vault Document Reference: ${fileName}\nStorage Path: ${doc.storage_path}`);
          }
        } else {
          targetFolder.file(fileName, `IMMENSE Vault Document: ${fileName}\nCategory: ${doc.category}`);
        }
      } catch {
        targetFolder.file(fileName, `IMMENSE Vault Document: ${fileName}\nCategory: ${doc.category}`);
      }
    }

    // 5. Generate and trigger download of the ZIP file
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const zipUrl = URL.createObjectURL(zipBlob);
    const link = document.createElement('a');
    link.href = zipUrl;
    link.download = `${companyName}_IMMENSE_BACKUP.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(zipUrl), 2000);

    toast.success('Backup Downloaded', `${companyName}_IMMENSE_BACKUP.zip saved successfully.`);
  } catch (err: any) {
    console.error('ZIP generation error:', err);
    toast.error('ZIP Export Failed', err.message || 'Could not package client backup ZIP.');
  }
}
