import React, { useState, useRef } from 'react';
import { ShieldCheck, ShieldAlert, FileSearch, HelpCircle, Calendar, Hash, Image as ImageIcon, Zap, Search, Layers, RefreshCw } from 'lucide-react';
import { WatermarkVerificationReport } from '../types';
import { generateVerificationReport } from '../utils/steganography';

export const WatermarkVerifier: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [report, setReport] = useState<WatermarkVerificationReport | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // Magnifier glass coordinates
  const [showMagnifier, setShowMagnifier] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const [bgPos, setBgPos] = useState('0% 0%');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (uploadedFile) {
      processVerificationFile(uploadedFile);
    }
  };

  const processVerificationFile = (selectedFile: File) => {
    setFile(selectedFile);
    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);
    setIsAnalyzing(true);
    setReport(null);

    // Load image elements to extractImageData
    const img = new Image();
    img.onload = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        const rep = await generateVerificationReport(selectedFile, canvas);
        setTimeout(() => {
          setReport(rep);
          setIsAnalyzing(false);
        }, 1200); // realistic diagnostic delay
      } else {
        setIsAnalyzing(false);
      }
    };
    img.onerror = () => {
      setIsAnalyzing(false);
    };
    img.src = url;
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!imageRef.current) return;
    const { left, top, width, height } = imageRef.current.getBoundingClientRect();
    
    // Calculate cursor positions inside the bounds
    const x = e.pageX - left - window.scrollX;
    const y = e.pageY - top - window.scrollY;
    
    setCoords({ x, y });

    // Calculate background zoom positioning
    const px = (x / width) * 100;
    const py = (y / height) * 100;
    setBgPos(`${px}% ${py}%`);
  };

  const handleClear = () => {
    setFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setReport(null);
    setIsAnalyzing(false);
  };

  return (
    <div className="space-y-6" id="watermark-verifier-container">
      <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.01)]" id="verifier-card">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6" id="verifier-header">
          <div>
            <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <FileSearch className="w-5 h-5 text-slate-500" />
              Watermark Forensic Scanner
            </h3>
            <p className="text-xs text-slate-400 mt-1">Upload any PNG or JPG/JPEG image to decode steganographic signatures and verify origin status</p>
          </div>

          {file && (
            <button
              onClick={handleClear}
              className="px-3 py-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
              id="btn-scan-another"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
              Reset Scanner
            </button>
          )}
        </div>

        {!file ? (
          /* File Input dropzone specifically for verify */
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-200 hover:border-slate-400 bg-white hover:bg-slate-50/50 py-16 px-6 text-center cursor-pointer rounded-2xl transition-all"
            id="forensic-selector-dropzone"
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/png, image/jpeg, image/jpg"
              className="hidden"
              id="input-verification-file"
            />
            <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-4 border border-slate-100">
              <Search className="w-5 h-5 text-slate-400" />
            </div>
            <h4 className="text-sm font-semibold text-slate-800 mb-1">Upload Image for Digital Analysis</h4>
            <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed font-sans">
              We will scan pixel-level bit layers to extract authentic stego seals and metadata keys instantly.
            </p>
          </div>
        ) : (
          /* Report and Preview view */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="decoder-interactive-workspace">
            {/* Left Column: Image magnifier preview */}
            <div className="lg:col-span-5 space-y-4" id="verifier-preview-col">
              <div className="bg-slate-50/80 border border-slate-100 rounded-xl p-4 flex flex-col justify-between h-full min-h-[320px]" id="preview-col-wrapper">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Forensic Image Viewer</span>
                
                <div 
                  className="relative mx-auto my-4 border border-slate-200 rounded-lg overflow-hidden bg-white group cursor-crosshair max-w-full max-h-[240px] flex items-center justify-center shadow-inner"
                  onMouseEnter={() => setShowMagnifier(true)}
                  onMouseLeave={() => setShowMagnifier(false)}
                  onMouseMove={handleMouseMove}
                  id="magnifier-box-wrapper"
                >
                  {previewUrl && (
                    <img 
                      ref={imageRef}
                      src={previewUrl} 
                      alt="Verify Target"
                      className="max-h-[220px] object-contain max-w-full select-none"
                    />
                  )}

                  {/* Magnifying Glass Indicator */}
                  {showMagnifier && previewUrl && (
                    <div
                      className="absolute border-2 border-slate-950 rounded-full pointer-events-none shadow-md w-28 h-28 bg-no-repeat bg-white"
                      style={{
                        display: showMagnifier ? 'block' : 'none',
                        left: `${coords.x - 56}px`,
                        top: `${coords.y - 56}px`,
                        backgroundImage: `url(${previewUrl})`,
                        backgroundPosition: bgPos,
                        backgroundSize: '250%' // Zoom factor
                      }}
                      id="pixel-magnifier-lens"
                    />
                  )}
                </div>

                <div className="text-center text-[10px] text-slate-400">
                  Hover image to magnifying inspect pixel structures at 250% magnification
                </div>
              </div>
            </div>

            {/* Right Column: Diagnostic Analysis and Verification Report */}
            <div className="lg:col-span-7" id="verifier-diagnostics-col">
              {isAnalyzing ? (
                <div className="h-full flex flex-col items-center justify-center py-16 gap-3" id="diagnostic-spinner">
                  <div className="w-8 h-8 rounded-full border-2 border-slate-900 border-t-transparent animate-spin" />
                  <p className="text-xs font-semibold text-slate-800 font-display">Scanning cryptographic layers...</p>
                  <p className="text-[10px] text-slate-400">Decoding Least Significant Pixel bits</p>
                </div>
              ) : report ? (
                <div className="space-y-5 animate-fade-in" id="report-details-container">
                  {/* Verdict Header Badge */}
                  <div 
                    className={`border p-5 rounded-2xl flex items-start gap-4 ${
                      report.isVerified 
                        ? 'bg-emerald-50/30 border-emerald-100 text-emerald-950' 
                        : 'bg-slate-50/50 border-slate-100 text-slate-800'
                    }`}
                    id="forensic-verdict-banner"
                  >
                    <div className={`p-2.5 rounded-xl shrink-0 ${report.isVerified ? 'bg-emerald-100/50' : 'bg-slate-100'}`}>
                      {report.isVerified ? (
                        <ShieldCheck className="w-7 h-7 text-emerald-700" />
                      ) : (
                        <ShieldAlert className="w-7 h-7 text-slate-500" />
                      )}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold flex items-center gap-2">
                        {report.isVerified ? 'Authentication Verified' : 'Authentication Seal Not Found'}
                        <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full ${
                          report.isVerified ? 'bg-emerald-700 text-white' : 'bg-slate-200 text-slate-700'
                        }`}>
                          Score: {report.score}%
                        </span>
                      </h4>
                      <p className="text-xs text-slate-600 mt-1.5 leading-relaxed font-sans">{report.comments}</p>
                    </div>
                  </div>

                  {/* Metadata Stats Rows */}
                  <div className="bg-white border border-slate-100 rounded-xl divide-y divide-slate-55" id="report-stats-grid">
                    <div className="p-3 text-xs flex justify-between gap-4">
                      <span className="text-slate-400 flex items-center gap-1.5 font-medium">
                        <ImageIcon className="w-3.5 h-3.5" /> Target Image filename
                      </span>
                      <span className="font-semibold text-slate-700 truncate max-w-[240px]">{report.fileName}</span>
                    </div>

                    <div className="p-3 text-xs flex justify-between gap-4">
                      <span className="text-slate-400 flex items-center gap-1.5 font-medium">
                        <Layers className="w-3.5 h-3.5" /> Target Dimensions
                      </span>
                      <span className="font-mono text-slate-700 font-semibold">{report.dimensions}</span>
                    </div>

                    <div className="p-3 text-xs flex justify-between gap-4">
                      <span className="text-slate-400 flex items-center gap-1.5 font-medium">
                        <Zap className="w-3.5 h-3.5" /> Stego LSB Match Status
                      </span>
                      <span className={`font-semibold ${report.hasStegoSignature ? 'text-emerald-700' : 'text-slate-550'}`}>
                        {report.hasStegoSignature ? 'DECODED: Key match valid' : 'UNDETECTED: Raw pixel state'}
                      </span>
                    </div>

                    {report.owner && (
                      <div className="p-3 text-xs flex justify-between gap-4 bg-emerald-50/10 border-l-2 border-emerald-500" id="row-decoded-owner">
                        <span className="text-emerald-800 flex items-center gap-1.5 font-semibold">
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 animate-pulse" /> Decoded Owner Seal
                        </span>
                        <span className="font-bold text-emerald-950 truncate max-w-[245px] font-sans bg-emerald-100/30 px-2 py-0.5 rounded">
                          {report.owner}
                        </span>
                      </div>
                    )}

                    <div className="p-3 text-xs flex justify-between gap-4">
                      <span className="text-slate-400 flex items-center gap-1.5 font-medium">
                        <Calendar className="w-3.5 h-3.5" /> Forensic Timestamp
                      </span>
                      <span className="font-mono text-slate-500 text-[11px] font-semibold">{new Date(report.timestamp).toLocaleString()}</span>
                    </div>
                  </div>

                  {/* Visual Report Diagram Summary info */}
                  <div className="p-4 bg-slate-50/50 rounded-xl border border-slate-100" id="report-security-seal-panel">
                    <h5 className="text-[11px] uppercase font-bold text-slate-450 tracking-wider mb-2">Technical Report diagnostics</h5>
                    <ul className="text-xs font-medium text-slate-600 space-y-1.5">
                      <li className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full ${report.hasStegoSignature ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                        <span>Cryptography Scan: {report.hasStegoSignature ? 'Verified Secure Signed Layer Embedded Lossless Code' : 'No binary sequence embedded'}</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full ${report.hasVisualWatermarkPredicted ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                        <span>Visual Layer Classifier: {report.hasVisualWatermarkPredicted ? 'External name matches output signature style' : 'No structural overlay heuristics found'}</span>
                      </li>
                    </ul>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
