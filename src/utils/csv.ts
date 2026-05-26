import { BatchFile, WatermarkConfig } from '../types';

/**
 * Escapes CSV special characters to prevent formulas injection and syntax breaking
 */
function escapeCSVValue(value: string | number | boolean | undefined): string {
  if (value === undefined || value === null) return '';
  const str = String(value);
  // If value contains comma, quotes or newlines, surround with double quotes and escape internal quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Packs processing batch records and active watermark configs into an elegant CSV file,
 * adds UTF-8 BOM so Excel opens it automatically with perfect Korean / multilingual formatting.
 */
export function exportBatchAuditToCSV(files: BatchFile[], currentConfig: WatermarkConfig): void {
  // Define columns for our forensic audit sheet
  const headers = [
    'Original Filename',
    'Relative Folder Path',
    'File Type',
    'Dimensions',
    'File Size (Bytes)',
    'Original File SHA-256 Hash',
    'Watermarked File SHA-255 Hash',
    'Visual Overlay Text/Logo Name',
    'Watermark Opacity',
    'Watermark Placement',
    'Stego Invisible Signature Embedded',
    'Stego Owner Info Attached',
    'Autoguard Verification Verdict',
    'Autoguard Seal Score (%)',
    'Batch Process Timestamp'
  ];

  const rows = files.map(item => {
    // Determine dimensions
    const dims = item.width && item.height ? `${item.width}x${item.height}` : 'Unknown';
    // Stego embed status
    const stegoActive = currentConfig.embedSteganography ? 'YES' : 'NO';
    // Verification results
    const isVerified = item.verificationResult?.isVerified ? 'VERIFIED' : 'NOT VERIFIED';
    const score = item.verificationResult?.score !== undefined ? `${item.verificationResult.score}%` : 'N/A';
    const watermarkText = currentConfig.type === 'text' ? currentConfig.text : (currentConfig.logoName || 'Custom Image Logo');
    const timestamp = item.verificationResult?.timestamp
      ? new Date(item.verificationResult.timestamp).toLocaleString()
      : new Date().toLocaleString() + ' (Generated)';

    return [
      escapeCSVValue(item.name),
      escapeCSVValue(item.relativePath || '/Root'),
      escapeCSVValue(item.type.toUpperCase()),
      escapeCSVValue(dims),
      escapeCSVValue(item.size),
      escapeCSVValue(item.originalHash || 'Calculating...'),
      escapeCSVValue(item.resultHash || (item.status === 'completed' ? 'Success' : 'Failed')),
      escapeCSVValue(watermarkText),
      escapeCSVValue(currentConfig.opacity),
      escapeCSVValue(currentConfig.placement),
      escapeCSVValue(stegoActive),
      escapeCSVValue(currentConfig.stegoOwner || 'N/A'),
      escapeCSVValue(isVerified),
      escapeCSVValue(score),
      escapeCSVValue(timestamp)
    ];
  });

  // Assemble full CSV content with lines terminated by CR-LF
  const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\r\n');

  // Excel UTF-8 BOM prefix
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
  
  // Trigger file download
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  
  const datestr = new Date().toISOString().substring(0, 10);
  link.setAttribute('download', `watermark_audit_report_${datestr}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
