export type WatermarkPlacement = 'top-left' | 'top-right' | 'center' | 'bottom-left' | 'bottom-right' | 'tile' | 'custom';

export interface WatermarkConfig {
  type: 'text' | 'image';
  text: string;
  fontFamily: string;
  fontSize: number;
  textColor: string;
  logoUrl: string | null;
  logoName: string | null;
  opacity: number;
  placement: WatermarkPlacement;
  customX: number; // percentage (0 - 100)
  customY: number; // percentage (0 - 100)
  scale: number; // multiplier (e.g., 0.1 to 2.0)
  rotation: number; // degrees (-180 to 180)
  embedSteganography: boolean; // hide invisible signature in pixels
  enableVisibleWatermark: boolean; // toggle visible overlay
  stegoOwner?: string; // custom owner info embedded in steganography
}

export interface BatchFile {
  id: string;
  file: File;
  name: string;
  relativePath?: string; // Optional directory path from folder upload
  type: 'image' | 'video';
  size: number;
  url: string; // Object URL for preview
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  error?: string;
  resultUrl?: string; // Watermarked download URL
  width?: number;
  height?: number;
  duration?: number; // for videos
  isAlreadyWatermarked?: boolean; // initial auto-verification check
  originalHash?: string; // SHA-256 hash of original file
  resultHash?: string; // SHA-256 hash of watermarked output file
  verificationResult?: WatermarkVerificationReport;
}

export interface WatermarkVerificationReport {
  isVerified: boolean;
  score: number; // 0 to 100
  timestamp: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  dimensions: string;
  hasStegoSignature: boolean;
  hasVisualWatermarkPredicted: boolean;
  watermarkMethodUsed: string[];
  comments: string;
  owner?: string;
}
