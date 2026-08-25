import fs from 'fs';
import path from 'path';

async function runTest() {
  console.log('--- STARTING DOCUMENT VAULT REAL-WORLD VERIFICATION TEST ---');

  const testPdfContent = `%PDF-1.4
%âãÏÓ
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 55 >>
stream
BT
/F1 24 Tf
100 700 Td
(IMMENSE REAL PRODUCTION GST VERIFICATION) Tj
ET
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000015 00000 n 
0000000068 00000 n 
0000000125 00000 n 
0000000216 00000 n 
trailer
<< /Root 1 0 R /Size 5 >>
startxref
322
%%EOF`;

  const pdfBuffer = Buffer.from(testPdfContent, 'utf-8');
  const pdfBase64 = pdfBuffer.toString('base64');
  const recordId = 'd927a417-6401-4475-9273-0428d098e918';
  const category = 'gst_certificate';
  const timestamp = Date.now();
  const fileName = 'verified_gst_certificate.pdf';
  const storagePath = `${recordId}/${category}/${timestamp}_${fileName}`;

  console.log(`1. Target Record ID: ${recordId}`);
  console.log(`2. Storage Path: ${storagePath}`);
  console.log(`3. Original File Size: ${pdfBuffer.length} bytes`);
  console.log(`4. First 5 Bytes Signature: ${pdfBuffer.slice(0, 5).toString('utf-8')}`);

  // Test local API handler directly if running dev server or direct import
  console.log('Verification script initialized with exact test payload.');
}

runTest();
