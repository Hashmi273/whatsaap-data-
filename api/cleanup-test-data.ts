import type { IncomingMessage, ServerResponse } from 'http';

export default async function handler(req: IncomingMessage & { body?: any }, res: ServerResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://ztrskyefkugevypzfecl.supabase.co';
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    let deletedRecordsCount = 0;
    let deletedDocsCount = 0;
    let deletedStorageFilesCount = 0;

    if (supabaseUrl && supabaseServiceKey) {
      // 1. Find test onboarding records with test / demo identifiers
      const recordsRes = await fetch(`${supabaseUrl}/rest/v1/onboarding_records?select=id,brand_name`, {
        headers: {
          apikey: supabaseServiceKey.trim(),
          Authorization: `Bearer ${supabaseServiceKey.trim()}`,
        },
      });

      const allRecords: any[] = await recordsRes.json().catch(() => []);
      const testKeywords = ['test', 'demo', 'dummy', 'sample', 'prestige', 'tata motors', 'apollo diagnostics', 'himalaya'];

      const testRecords = Array.isArray(allRecords)
        ? allRecords.filter((r) => {
            const name = (r.brand_name || '').toLowerCase();
            return testKeywords.some((kw) => name.includes(kw));
          })
        : [];

      for (const rec of testRecords) {
        // Find associated documents
        const docsRes = await fetch(`${supabaseUrl}/rest/v1/onboarding_documents?onboarding_id=eq.${rec.id}&select=id,storage_path`, {
          headers: {
            apikey: supabaseServiceKey.trim(),
            Authorization: `Bearer ${supabaseServiceKey.trim()}`,
          },
        });

        const docs: any[] = await docsRes.json().catch(() => []);
        if (Array.isArray(docs)) {
          for (const doc of docs) {
            if (doc.storage_path) {
              // Delete from Supabase Storage
              try {
                await fetch(`${supabaseUrl}/storage/v1/object/onboarding-documents/${doc.storage_path}`, {
                  method: 'DELETE',
                  headers: {
                    apikey: supabaseServiceKey.trim(),
                    Authorization: `Bearer ${supabaseServiceKey.trim()}`,
                  },
                });
                deletedStorageFilesCount++;
              } catch {
                // Ignore
              }
            }
          }

          // Delete document rows
          if (docs.length > 0) {
            await fetch(`${supabaseUrl}/rest/v1/onboarding_documents?onboarding_id=eq.${rec.id}`, {
              method: 'DELETE',
              headers: {
                apikey: supabaseServiceKey.trim(),
                Authorization: `Bearer ${supabaseServiceKey.trim()}`,
              },
            });
            deletedDocsCount += docs.length;
          }
        }

        // Delete test onboarding record
        await fetch(`${supabaseUrl}/rest/v1/onboarding_records?id=eq.${rec.id}`, {
          method: 'DELETE',
          headers: {
            apikey: supabaseServiceKey.trim(),
            Authorization: `Bearer ${supabaseServiceKey.trim()}`,
          },
        });
        deletedRecordsCount++;
      }
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        success: true,
        message: 'TEST DATA CLEANUP COMPLETE',
        deletedRecordsCount,
        deletedDocsCount,
        deletedStorageFilesCount,
      })
    );
  } catch (err: any) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        success: false,
        error: err.message || 'Error during test data cleanup.',
      })
    );
  }
}
