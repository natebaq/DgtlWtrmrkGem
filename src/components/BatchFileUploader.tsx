import React, { useState, useRef } from 'react';
import { Upload, FileImage, Film, FolderOpen, Trash2, ShieldAlert, AlertTriangle, ChevronRight } from 'lucide-react';
import { BatchFile } from '../types';

interface BatchFileUploaderProps {
  files: BatchFile[];
  onFilesAdded: (newFiles: BatchFile[]) => void;
  onRemoveFile: (id: string) => void;
  onClearAll: () => void;
}

// Helper to check if file has any Adobe extension
function isAdobeExtension(filename: string): boolean {
  const ext = filename.toLowerCase().split('.').pop() || '';
  return ['psd', 'ai', 'eps', 'indd', 'pdf'].includes(ext);
}

// Function to recursively traverse file system entries (dropped folders)
async function traverseFileTree(entry: any, path = ""): Promise<File[]> {
  return new Promise((resolve) => {
    if (entry.isFile) {
      entry.file((file: File) => {
        // Build the relative path from the drop point
        const relativePath = path ? `${path}/${file.name}` : file.name;
        // Attach a helper field since webkitRelativePath is read-only in some environments
        const extendedFile = file as any;
        extendedFile.customRelativePath = relativePath;
        resolve([file]);
      });
    } else if (entry.isDirectory) {
      const dirReader = entry.createReader();
      
      const readAllEntries = async (): Promise<any[]> => {
        const resultEntries: any[] = [];
        const read = async (): Promise<any[]> => {
          return new Promise((res) => {
            dirReader.readEntries((results: any[]) => {
              res(results || []);
            });
          });
        };
        
        while (true) {
          const chunk = await read();
          if (chunk.length === 0) break;
          resultEntries.push(...chunk);
        }
        return resultEntries;
      };

      readAllEntries().then(async (entries) => {
        const promises = entries.map((subEntry) =>
          traverseFileTree(subEntry, path ? `${path}/${entry.name}` : entry.name)
        );
        const nestedFiles = await Promise.all(promises);
        resolve(nestedFiles.flat());
      });
    } else {
      resolve([]);
    }
  });
}

export const BatchFileUploader: React.FC<BatchFileUploaderProps> = ({
  files,
  onFilesAdded,
  onRemoveFile,
  onClearAll,
}) => {
  const [isDragActive, setIsDragActive] = useState(false);
  const [ignoredAdobeCount, setIgnoredAdobeCount] = useState(0);
  const [ignoredAdobeNames, setIgnoredAdobeNames] = useState<string[]>([]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const processFilesList = (uploadedFiles: File[]) => {
    const newBatchFiles: BatchFile[] = [];
    let adobeCount = 0;
    const adobeNames: string[] = [];

    for (let i = 0; i < uploadedFiles.length; i++) {
      const file = uploadedFiles[i];
      
      if (isAdobeExtension(file.name)) {
        adobeCount++;
        if (adobeNames.length < 5) {
          adobeNames.push(file.name);
        }
        continue;
      }

      const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(file.name);
      const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov|ogg|mkv)$/i.test(file.name);

      if (!isImage && !isVideo) {
        continue; // skip unsupported files (such as .txt, .zip, etc.)
      }

      const id = Math.random().toString(36).substring(2, 9);
      const url = URL.createObjectURL(file);
      const relPath = (file as any).customRelativePath || file.webkitRelativePath || "";

      const batchItem: BatchFile = {
        id,
        file,
        name: file.name,
        relativePath: relPath,
        type: isImage ? 'image' : 'video',
        size: file.size,
        url,
        status: 'pending',
        progress: 0,
      };

      // Extract metadata dimensions for previewing nicely
      if (isImage) {
        const img = new Image();
        img.onload = () => {
          batchItem.width = img.naturalWidth;
          batchItem.height = img.naturalHeight;
        };
        img.src = url;
      } else {
        const video = document.createElement('video');
        video.onloadedmetadata = () => {
          batchItem.width = video.videoWidth;
          batchItem.height = video.videoHeight;
          batchItem.duration = video.duration;
        };
        video.src = url;
      }

      newBatchFiles.push(batchItem);
    }

    if (adobeCount > 0) {
      setIgnoredAdobeCount(prev => prev + adobeCount);
      setIgnoredAdobeNames(prev => {
        const united = [...prev, ...adobeNames];
        return Array.from(new Set(united)).slice(0, 5);
      });
    }

    if (newBatchFiles.length > 0) {
      onFilesAdded(newBatchFiles);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.items) {
      const items = Array.from(e.dataTransfer.items) as DataTransferItem[];
      const entryPromises = items.map((item) => {
        // Modern recursive directory checking
        if (typeof item.webkitGetAsEntry === 'function') {
          const entry = item.webkitGetAsEntry();
          if (entry) {
            return traverseFileTree(entry);
          }
        }
        return Promise.resolve([] as File[]);
      });

      const filesArrays = await Promise.all(entryPromises);
      const allFiles = filesArrays.flat() as File[];
      if (allFiles.length > 0) {
        processFilesList(allFiles);
      } else {
        // Fallback for flat transfer files if entry mapping is not supported
        if (e.dataTransfer.files) {
          processFilesList(Array.from(e.dataTransfer.files) as File[]);
        }
      }
    } else if (e.dataTransfer.files) {
      processFilesList(Array.from(e.dataTransfer.files) as File[]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      processFilesList(Array.from(e.target.files) as File[]);
    }
  };

  const handleFolderInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const arrayFiles = Array.from(e.target.files) as File[];
      // Ensure folder upload preserves paths
      arrayFiles.forEach(f => {
        if (f.webkitRelativePath) {
          (f as any).customRelativePath = f.webkitRelativePath;
        }
      });
      processFilesList(arrayFiles);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const handleResetAdobeNotice = () => {
    setIgnoredAdobeCount(0);
    setIgnoredAdobeNames([]);
  };

  return (
    <div className="flex flex-col gap-4" id="batch-file-uploader-section">
      {/* Drag & Drop Zone */}
      <div
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        className={`relative flex flex-col items-center justify-center border-2 border-dashed rounded-2xl py-11 px-6 text-center transition-all ${
          isDragActive
            ? 'border-slate-900 bg-slate-50/70 scale-[0.99] shadow-inner font-sans'
            : 'border-slate-200 bg-white hover:border-slate-350 hover:bg-slate-50/20 font-sans'
        }`}
        id="drop-zone-container"
      >
        {/* Input for discrete individual files */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileInputChange}
          multiple
          accept="image/*,video/*"
          className="hidden"
          id="input-multi-file"
        />

        {/* Input specifically configured for recursive full folder tree choice */}
        <input
          type="file"
          ref={folderInputRef}
          onChange={handleFolderInputChange}
          className="hidden"
          id="input-folder-upload"
          {...({
            webkitdirectory: "",
            directory: "",
            multiple: true
          } as any)}
        />

        <div className="w-12 h-12 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center mb-3 transition-colors" id="icon-container">
          <Upload className={`w-5 h-5 ${isDragActive ? 'text-slate-900 animate-bounce' : 'text-slate-400'}`} />
        </div>

        <h3 className="text-sm font-semibold text-slate-800 mb-1">
          Drag & drop Files or Folders directly here
        </h3>
        <p className="text-xs text-slate-400 max-w-sm mb-4 leading-relaxed">
          Analyzes files recursively inside nested directories. All target folder models will be accurately mapped and maintained.
        </p>
        
        <div className="flex items-center gap-3" id="uploader-selector-buttons">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 hover:text-slate-900 bg-slate-50 border border-slate-200 hover:border-slate-350 px-3 py-1.5 rounded-xl transition-all cursor-pointer"
            id="btn-select-individual-files"
          >
            <Upload className="w-3.5 h-3.5 text-slate-500" />
            Select Files
          </button>
          
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              folderInputRef.current?.click();
            }}
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 hover:text-slate-900 bg-slate-50 border border-slate-200 hover:border-slate-350 px-3 py-1.5 rounded-xl transition-all cursor-pointer"
            id="btn-select-directory-folder"
          >
            <FolderOpen className="w-3.5 h-3.5 text-slate-500" />
            Select Folder
          </button>
        </div>
      </div>

      {/* Adobe Filter Warning Notice */}
      {ignoredAdobeCount > 0 && (
        <div className="bg-amber-50/50 border border-amber-200/50 rounded-xl p-3.5 text-amber-900 flex items-start gap-2.5" id="adobe-filter-warning">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs flex-1">
            <div className="font-semibold flex items-center justify-between">
              <span>Skipped Unsupported Adobe Formats ({ignoredAdobeCount})</span>
              <button 
                onClick={handleResetAdobeNotice} 
                className="text-amber-500 hover:text-amber-700 text-[10px] font-bold underline"
              >
                Dismiss Notice
              </button>
            </div>
            <p className="text-amber-700 font-medium text-[10px] mt-0.5 leading-relaxed">
              We identified and skipped Adobe Photoshop/Illustrator files (e.g., .psd, .ai) to keep processing speed optimal. Only standard digital images and raw videos were sent to queue.
            </p>
            {ignoredAdobeNames.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1 font-mono text-[9px] text-amber-800">
                {ignoredAdobeNames.map((name, idx) => (
                  <span key={idx} className="bg-amber-100/60 border border-amber-200/30 px-1 py-0.2 rounded">
                    {name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Batch Queued File List */}
      {files.length > 0 && (
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-[0_8px_30px_rgb(0,0,0,0.01)] space-y-4" id="queued-list-card">
          <div className="flex items-center justify-between" id="queued-header">
            <div>
              <h4 className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                Batch Upload Queue
                <span className="bg-slate-50 border border-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  {files.length} {files.length === 1 ? 'file' : 'files'}
                </span>
              </h4>
              <p className="text-[10px] text-slate-450 mt-0.5 font-medium">Ready for global watermarking parameters</p>
            </div>
            <button
              onClick={onClearAll}
              className="text-[11px] font-semibold text-red-600 hover:text-red-700 hover:bg-red-50/55 px-2 py-1 rounded-md transition-colors"
              id="btn-remove-all-queue"
            >
              Clear Queue
            </button>
          </div>

          <div className="max-h-[340px] overflow-y-auto divide-y divide-slate-100 pr-1 select-none" id="queue-scrollable-container">
            {files.map((item) => (
              <div key={item.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0 gap-4" id={`queue-item-${item.id}`}>
                <div className="flex items-center gap-3 overflow-hidden">
                  {/* Thumbnail */}
                  <div className="w-11 h-11 bg-slate-50 border border-slate-100 rounded-lg overflow-hidden shrink-0 flex items-center justify-center relative">
                    {item.type === 'image' ? (
                      <img src={item.url} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center relative">
                        <video src={item.url} className="w-full h-full object-cover" muted playsInline />
                        <div className="absolute right-1 bottom-1 bg-black/60 text-[8px] text-white px-1 py-0.2 rounded font-mono">
                          {item.duration ? `${Math.round(item.duration)}s` : 'Video'}
                        </div>
                      </div>
                    )}
                    <span className="absolute top-0.5 left-0.5 px-1 py-0.2 bg-white/90 text-[7px] font-bold text-slate-600 border border-slate-100 rounded">
                      {item.type.toUpperCase()}
                    </span>
                  </div>

                  {/* Metadata labels */}
                  <div className="overflow-hidden">
                    <p className="text-xs font-semibold text-slate-700 truncate max-w-[200px]" title={item.name}>
                      {item.name}
                    </p>
                    
                    {/* Folder relative path visual trace */}
                    {item.relativePath && item.relativePath.includes('/') && (
                      <div className="font-mono text-[9px] text-slate-500 bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded inline-flex items-center gap-0.5 mt-0.5 max-w-[240px] truncate">
                        <span className="text-slate-400">📁</span>
                        <span className="truncate">{item.relativePath.substring(0, item.relativePath.lastIndexOf('/'))}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                      <span>{formatSize(item.size)}</span>
                      {item.width && item.height && (
                        <>
                          <span className="text-slate-200 font-light">•</span>
                          <span>{item.width}×{item.height}px</span>
                        </>
                      )}
                      <span className="text-slate-200 font-light">•</span>
                      <span 
                        className="font-mono text-[9px] text-slate-500 bg-slate-50/80 border border-slate-100 px-1 py-0.2 rounded inline-flex items-center gap-1"
                        title={item.originalHash ? `Original SHA-256 Hash: ${item.originalHash}` : 'Calculating file hash...'}
                      >
                        {item.originalHash ? (
                          <>
                            <span className="text-emerald-500 text-[8px]">•</span>
                            SHA256:{item.originalHash.substring(0, 6)}...
                          </>
                        ) : (
                          <>
                            <span className="animate-pulse text-amber-500 text-[8px]">•</span>
                            Hashing...
                          </>
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {item.status === 'processing' && (
                    <span className="text-[10px] text-blue-600 bg-blue-50/50 border border-blue-100 font-bold px-2 py-0.5 rounded-full animate-pulse">
                      Processing
                    </span>
                  )}
                  {item.status === 'completed' && (
                    <span className="text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-100 font-bold px-2 py-0.5 rounded-full">
                      Success
                    </span>
                  )}
                  {item.status === 'failed' && (
                    <span className="text-[10px] text-red-600 bg-red-50 font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5">
                      <ShieldAlert className="w-3 h-3" /> Fail
                    </span>
                  )}
                  <button
                    onClick={() => onRemoveFile(item.id)}
                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-slate-50 rounded-lg transition-all"
                    title="Remove from batch queue"
                    id={`btn-remove-queue-item-${item.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
