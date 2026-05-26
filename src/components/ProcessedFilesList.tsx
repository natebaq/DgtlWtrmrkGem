import React, { useState } from 'react';
import { Download, FileImage, Film, CheckCircle2, AlertTriangle, ShieldCheck, SearchCode, Eye, RefreshCw, FileSpreadsheet } from 'lucide-react';
import { BatchFile, WatermarkVerificationReport, WatermarkConfig } from '../types';
import { exportBatchAuditToCSV } from '../utils/csv';
import JSZip from 'jszip';

interface ProcessedFilesListProps {
  files: BatchFile[];
  config: WatermarkConfig;
  onOpenReport: (report: WatermarkVerificationReport, name: string) => void;
}

export const ProcessedFilesList: React.FC<ProcessedFilesListProps> = ({ files, config, onOpenReport }) => {
  const [filterType, setFilterType] = useState<'all' | 'image' | 'video'>('all');
  const [isBundling, setIsBundling] = useState(false);

  const processedFiles = files.filter(f => f.status === 'completed' || f.status === 'failed');
  const filteredFiles = processedFiles.filter(f => {
    if (filterType === 'all') return true;
    return f.type === filterType;
  });

  const triggerDownload = (item: BatchFile) => {
    if (!item.resultUrl) return;
    const link = document.createElement('a');
    link.href = item.resultUrl;
    link.download = `watermarked_${item.name}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadAll = async () => {
    // Check if there are any completed files
    const completed = processedFiles.filter(f => f.status === 'completed' && f.resultUrl);
    if (completed.length === 0) return;

    setIsBundling(true);
    try {
      const zip = new JSZip();

      for (const f of completed) {
        if (!f.resultUrl) continue;
        
        // Fetch the local blob representation
        const res = await fetch(f.resultUrl);
        const blob = await res.blob();
        
        if (f.relativePath) {
          // Re-create exact folder path hierarchy
          zip.file(f.relativePath, blob);
        } else {
          // Flatten standard image
          zip.file(`watermarked_${f.name}`, blob);
        }
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const downloadUrl = URL.createObjectURL(zipBlob);
      
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `watermarked_organized_archive.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);
    } catch (e) {
      console.error("Failed to package watermarked files into structured zip archive:", e);
    } finally {
      setIsBundling(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  if (processedFiles.length === 0) {
    return null; // Don't show anything unless there are processed results
  }

  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.01)] space-y-5 animate-fade-in animate-duration-300" id="processed-results-card">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100/50 pb-4" id="results-header">
        <div>
          <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            Processed Watermark Batches
          </h3>
          <p className="text-xs text-slate-450 mt-0.5">Below are your finalized protected outputs, complete with instant verifications</p>
        </div>

        {/* Buttons for filters and Download All */}
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 self-start sm:self-auto" id="results-filter-controls">
          <div className="flex bg-slate-50 border border-slate-150/40 rounded-lg p-0.5 animate-fade-in" id="fil-buttons">
            <button
              onClick={() => setFilterType('all')}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all ${
                filterType === 'all' ? 'bg-white text-slate-800 shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-800'
              }`}
              id="btn-filter-all"
            >
              All
            </button>
            <button
              onClick={() => setFilterType('image')}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all ${
                filterType === 'image' ? 'bg-white text-slate-800 shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-800'
              }`}
              id="btn-filter-images"
            >
              Images
            </button>
            <button
              onClick={() => setFilterType('video')}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all ${
                filterType === 'video' ? 'bg-white text-slate-800 shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-800'
              }`}
              id="btn-filter-videos"
            >
              Videos
            </button>
          </div>

          <button
            onClick={() => exportBatchAuditToCSV(processedFiles, config)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 transition-all shadow-sm cursor-pointer"
            id="btn-export-hash-csv"
            title="Export complete watermarked audit trail with SHA-256 hashes to an Excel-compatible CSV database."
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Export Audit Log (CSV)
          </button>

          <button
            onClick={handleDownloadAll}
            disabled={isBundling || processedFiles.filter(f => f.status === 'completed').length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-850 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-all shadow-sm"
            id="btn-download-all-results"
          >
            {isBundling ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Bundling Folders...
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                Save Structured ZIP
              </>
            )}
          </button>
        </div>
      </div>

      {/* Grid of Results */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4" id="processed-files-grid">
        {filteredFiles.map((item) => {
          const report = item.verificationResult;
          const isSuccess = item.status === 'completed';

          return (
            <div
              key={item.id}
              className={`border rounded-xl p-4 flex flex-col justify-between gap-3 transition-all hover:shadow-[0_4px_20px_rgb(0,0,0,0.015)] ${
                isSuccess ? 'border-slate-100 bg-white' : 'border-red-100 bg-red-50/10'
              }`}
              id={`processed-card-${item.id}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 overflow-hidden">
                  {/* Watermarked Output Preview */}
                  <div className="w-16 h-16 bg-slate-50 border border-slate-100 rounded-lg overflow-hidden shrink-0 flex items-center justify-center relative shadow-inner">
                    {isSuccess && item.resultUrl ? (
                      item.type === 'image' ? (
                        <img src={item.resultUrl} alt={item.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full relative">
                          <video src={item.resultUrl} className="w-full h-full object-cover" muted playsInline />
                          <div className="absolute inset-0 bg-black/10 flex items-center justify-center">
                            <Film className="w-4 h-4 text-white drop-shadow-md" />
                          </div>
                        </div>
                      )
                    ) : (
                      <AlertTriangle className="w-6 h-6 text-red-500" />
                    )}
                  </div>

                  <div className="overflow-hidden">
                    <p className="text-xs font-bold text-slate-850 truncate max-w-[200px]" title={item.name}>
                      {item.name}
                    </p>

                    {/* Dir path check inside results items */}
                    {item.relativePath && item.relativePath.includes('/') && (
                      <div className="font-mono text-[9px] text-slate-450 bg-slate-50 border border-slate-100 px-1 py-0.5 rounded inline-flex items-center gap-0.5 mt-1 max-w-[180px] truncate" title={item.relativePath}>
                        <span>📁</span>
                        <span className="truncate">{item.relativePath}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-1">
                      <span>{item.type.toUpperCase()}</span>
                      <span>•</span>
                      <span>{formatSize(item.size)}</span>
                    </div>

                    {/* Integrated Autoguard check status */}
                    {isSuccess && report && (
                      <div className="flex flex-col gap-1.5 mt-2">
                        <div className="flex items-center gap-1.5">
                          {report.isVerified ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                              <ShieldCheck className="w-2.5 h-2.5" /> Stego Seal Validated
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-slate-50 text-slate-650 border border-slate-100">
                              <Eye className="w-2.5 h-2.5" /> Visual Overlaid Only
                            </span>
                          )}
                        </div>

                        {/* Fingerprint block */}
                        <div className="mt-1 bg-slate-50/50 border border-slate-100/60 p-2 rounded-lg text-[9px] font-mono space-y-1 text-slate-500 overflow-hidden max-w-[240px]">
                          <div className="flex justify-between gap-1">
                            <span className="text-slate-400 font-sans shrink-0">Orig-SHA:</span>
                            <span className="truncate font-semibold text-slate-700" title={item.originalHash || 'Calculating...'}>
                              {item.originalHash ? `${item.originalHash.substring(0, 10)}...${item.originalHash.substring(item.originalHash.length - 6)}` : 'N/A'}
                            </span>
                          </div>
                          <div className="flex justify-between gap-1 col-span-2">
                            <span className="text-slate-400 font-sans shrink-0">Result-SHA:</span>
                            <span className="truncate font-semibold text-slate-700" title={item.resultHash || 'Generating...'}>
                              {item.resultHash ? `${item.resultHash.substring(0, 10)}...${item.resultHash.substring(item.resultHash.length - 6)}` : 'Generating...'}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Card Footer Actions */}
              <div className="flex items-center gap-2 border-t border-slate-50/60 pt-3 mt-1 justify-between">
                {isSuccess && report ? (
                  <button
                    onClick={() => onOpenReport(report, item.name)}
                    className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-850 px-2 py-1.5 rounded-lg hover:bg-slate-50 border border-slate-100 transition-colors"
                    id={`btn-view-report-${item.id}`}
                  >
                    <SearchCode className="w-3.5 h-3.5" />
                    Verification Report
                  </button>
                ) : (
                  <span className="text-[10px] text-red-500 font-semibold">{item.error || 'Conversion error'}</span>
                )}

                {isSuccess && item.resultUrl && (
                  <button
                    onClick={() => triggerDownload(item)}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-950 border border-slate-950 text-white hover:bg-slate-850 rounded-lg text-[11px] font-semibold transition-colors"
                    id={`btn-dl-individual-${item.id}`}
                  >
                    <Download className="w-3.5 h-3.5" />
                    File
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
