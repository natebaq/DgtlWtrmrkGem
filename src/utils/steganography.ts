import { WatermarkVerificationReport } from '../types';

export const STEGO_SIGNATURE = "DIGITAL_WATERMARK_VERIFIED_2026";

// 24-bit magic header to identify robust watermark payload presence
const ROBUST_MAGIC_HEADER = [1, 0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 1, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1];

// Selected 16 stable mid-frequency coefficients from the 4x4 Haar DWT sub-bands
const SELECTED_COEFFS = [
  { band: 'LH', r: 0, c: 1 },
  { band: 'LH', r: 0, c: 2 },
  { band: 'LH', r: 1, c: 0 },
  { band: 'LH', r: 1, c: 1 },
  { band: 'LH', r: 1, c: 2 },
  { band: 'LH', r: 2, c: 0 },
  { band: 'LH', r: 2, c: 1 },
  { band: 'LH', r: 2, c: 2 },
  { band: 'HL', r: 0, c: 1 },
  { band: 'HL', r: 0, c: 2 },
  { band: 'HL', r: 1, c: 0 },
  { band: 'HL', r: 1, c: 1 },
  { band: 'HL', r: 1, c: 2 },
  { band: 'HL', r: 2, c: 0 },
  { band: 'HL', r: 2, c: 1 },
  { band: 'HL', r: 2, c: 2 },
];

/**
 * 100% deterministic, platform-independent Mulberry32 PRNG
 */
function createSeededPRNG(seed: number) {
  let h = seed >>> 0;
  return function() {
    h = (h + 0x6D2B79F5) | 0;
    const imul = Math.imul;
    let t = imul(h ^ (h >>> 15), 1 | h);
    t = (t + imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generates an orthogonal pseudo-random noise (PN) sequence of length 16
 * corresponding deterministically to each payload bit index.
 */
function getPNSequence(bitIndex: number, length: number): number[] {
  const prng = createSeededPRNG(133719 + bitIndex);
  const seq: number[] = [];
  for (let i = 0; i < length; i++) {
    seq.push(prng() < 0.5 ? -1 : 1);
  }
  return seq;
}

/**
 * Performs a 2D 1-level Discrete Haar Wavelet Transform (DWT) on an 8x8 matrix
 */
function haarDWT8x8(block: number[][]): { LL: number[][]; LH: number[][]; HL: number[][]; HH: number[][] } {
  const temp = Array.from({ length: 8 }, () => Array(8).fill(0));
  const sqrt2 = Math.sqrt(2);
  
  // Row transform
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 4; j++) {
      temp[i][j] = (block[i][2 * j] + block[i][2 * j + 1]) / sqrt2;
      temp[i][j + 4] = (block[i][2 * j] - block[i][2 * j + 1]) / sqrt2;
    }
  }
  
  // Column transform
  const LL = Array.from({ length: 4 }, () => Array(4).fill(0));
  const HL = Array.from({ length: 4 }, () => Array(4).fill(0));
  const LH = Array.from({ length: 4 }, () => Array(4).fill(0));
  const HH = Array.from({ length: 4 }, () => Array(4).fill(0));
  
  for (let j = 0; j < 8; j++) {
    for (let i = 0; i < 4; i++) {
      const valSum = (temp[2 * i][j] + temp[2 * i + 1][j]) / sqrt2;
      const valDiff = (temp[2 * i][j] - temp[2 * i + 1][j]) / sqrt2;
      
      if (j < 4) {
        LL[i][j] = valSum;
        LH[i][j] = valDiff;
      } else {
        HL[i][j - 4] = valSum;
        HH[i][j - 4] = valDiff;
      }
    }
  }
  
  return { LL, LH, HL, HH };
}

/**
 * Performs a 2D 1-level Inverse Discrete Haar Wavelet Transform (IDWT)
 */
function haarIDWT8x8(LL: number[][], LH: number[][], HL: number[][], HH: number[][]): number[][] {
  const temp = Array.from({ length: 8 }, () => Array(8).fill(0));
  const sqrt2 = Math.sqrt(2);
  
  // Column inverse
  for (let j = 0; j < 8; j++) {
    for (let i = 0; i < 4; i++) {
      if (j < 4) {
        const s = LL[i][j];
        const d = LH[i][j];
        temp[2 * i][j] = (s + d) / sqrt2;
        temp[2 * i + 1][j] = (s - d) / sqrt2;
      } else {
        const s = HL[i][j - 4];
        const d = HH[i][j - 4];
        temp[2 * i][j] = (s + d) / sqrt2;
        temp[2 * i + 1][j] = (s - d) / sqrt2;
      }
    }
  }
  
  // Row inverse
  const block = Array.from({ length: 8 }, () => Array(8).fill(0));
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 4; j++) {
      const s = temp[i][j];
      const d = temp[i][j + 4];
      block[i][2 * j] = (s + d) / sqrt2;
      block[i][2 * j + 1] = (s - d) / sqrt2;
    }
  }
  
  return block;
}

/**
 * Encodes owner string with magic headers into a robust, fixed 424-bit stream
 */
function stringToFixedBits(str: string): number[] {
  const bits: number[] = [];
  
  // 1. Add Magic Header
  bits.push(...ROBUST_MAGIC_HEADER);
  
  // 2. Add padded UTF-8 owner data (exactly 50 bytes)
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  
  const paddedBytes = new Uint8Array(50);
  for (let i = 0; i < 50; i++) {
    if (i < bytes.length) {
      paddedBytes[i] = bytes[i];
    } else {
      paddedBytes[i] = 0;
    }
  }
  
  for (let i = 0; i < 50; i++) {
    const byte = paddedBytes[i];
    for (let j = 7; j >= 0; j--) {
      bits.push((byte >> j) & 1);
    }
  }
  
  return bits;
}

/**
 * Resamples an image using optimized browser graphics pipeline (bilinear interpolation)
 */
function resampleImageData(imageData: ImageData, targetWidth: number, targetHeight: number): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return imageData;
  
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = imageData.width;
  tempCanvas.height = imageData.height;
  tempCanvas.getContext('2d')?.putImageData(imageData, 0, 0);
  
  ctx.drawImage(tempCanvas, 0, 0, targetWidth, targetHeight);
  return ctx.getImageData(0, 0, targetWidth, targetHeight);
}

/**
 * Subsamples or crops a standard 384x384 patch in the absolute center of the image canvas
 */
function getCenterPatch(imageData: ImageData, size: number = 384): ImageData {
  const W = imageData.width;
  const H = imageData.height;
  if (W <= size && H <= size) {
    return imageData;
  }
  
  const startX = Math.floor((W - size) / 2);
  const startY = Math.floor((H - size) / 2);
  const actualW = Math.min(size, W);
  const actualH = Math.min(size, H);
  
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = W;
  tempCanvas.height = H;
  const tempCtx = tempCanvas.getContext('2d');
  if (!tempCtx) return imageData;
  tempCtx.putImageData(imageData, 0, 0);
  
  const targetCanvas = document.createElement('canvas');
  targetCanvas.width = actualW;
  targetCanvas.height = actualH;
  const targetCtx = targetCanvas.getContext('2d');
  if (!targetCtx) return imageData;
  
  targetCtx.drawImage(tempCanvas, startX, startY, actualW, actualH, 0, 0, actualW, actualH);
  return targetCtx.getImageData(0, 0, actualW, actualH);
}

/**
 * Helper to decode robust coefficients under specific translation offset parameters
 */
function decodeWithParameters(imageData: ImageData, dx: number, dy: number): {
  ratio: number;
  matches: number;
  decodedOwner?: string;
  decodedBits: number[];
} {
  const data = imageData.data;
  const W = imageData.width;
  const H = imageData.height;

  const numBlocksX = Math.floor((W - dx) / 8);
  const numBlocksY = Math.floor((H - dy) / 8);
  
  if (numBlocksX < 4 || numBlocksY < 4) {
    return { ratio: 0, matches: 0, decodedBits: [] };
  }

  const PAYLOAD_BIT_LEN = 24 + 50 * 8; // 424 bits

  const bitCorrelations = Array(PAYLOAD_BIT_LEN).fill(0);
  const bitCounts = Array(PAYLOAD_BIT_LEN).fill(0);

  let blockIndex = 0;
  for (let by = 0; by < numBlocksY; by++) {
    for (let bx = 0; bx < numBlocksX; bx++) {
      const x0 = dx + bx * 8;
      const y0 = dy + by * 8;

      const Y: number[][] = Array.from({ length: 8 }, () => Array(8).fill(0));
      for (let dyBlock = 0; dyBlock < 8; dyBlock++) {
        for (let dxBlock = 0; dxBlock < 8; dxBlock++) {
          const px = x0 + dxBlock;
          const py = y0 + dyBlock;
          const idx = (py * W + px) * 4;

          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];

          Y[dyBlock][dxBlock] = 0.299 * r + 0.587 * g + 0.114 * b;
        }
      }

      const { LH, HL } = haarDWT8x8(Y);

      const bitPos = blockIndex % PAYLOAD_BIT_LEN;
      const PN = getPNSequence(bitPos, 16);

      let S = 0;
      for (let i = 0; i < 16; i++) {
        const item = SELECTED_COEFFS[i];
        const val = item.band === 'LH' ? LH[item.r][item.c] : HL[item.r][item.c];
        S += val * PN[i];
      }

      bitCorrelations[bitPos] += S;
      bitCounts[bitPos]++;
      blockIndex++;
    }
  }

  const decodedBits: number[] = [];
  for (let i = 0; i < PAYLOAD_BIT_LEN; i++) {
    if (bitCounts[i] === 0) {
      decodedBits.push(0);
    } else {
      decodedBits.push(bitCorrelations[i] > 0 ? 1 : 0);
    }
  }

  let headerMatches = 0;
  for (let i = 0; i < ROBUST_MAGIC_HEADER.length; i++) {
    if (decodedBits[i] === ROBUST_MAGIC_HEADER[i]) {
      headerMatches++;
    }
  }

  const ratio = headerMatches / ROBUST_MAGIC_HEADER.length;

  let decodedOwner = "";
  if (ratio >= 0.70) {
    const bytes: number[] = [];
    let ptr = ROBUST_MAGIC_HEADER.length;
    for (let i = 0; i < 50; i++) {
      let byte = 0;
      for (let j = 0; j < 8; j++) {
        byte = (byte << 1) | decodedBits[ptr];
        ptr++;
      }
      bytes.push(byte);
    }

    try {
      const trimmedBytes = bytes.filter(b => b !== 0);
      decodedOwner = new TextDecoder('utf-8').decode(new Uint8Array(trimmedBytes));
      decodedOwner = decodedOwner.replace(/[^\x20-\x7E\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF\uAC00-\uD7A3가-힣]/g, '');
    } catch (e) {
      decodedOwner = bytes.filter(b => b > 31 && b < 127).map(b => String.fromCharCode(b)).join('');
    }
  }

  return {
    ratio,
    matches: headerMatches,
    decodedOwner: decodedOwner.trim() || undefined,
    decodedBits
  };
}

/**
 * Embeds robust Wavelet-domain Spread Spectrum (DWT-SS) watermark into image's Luminance
 */
export function embedRobustWatermark(imageData: ImageData, customOwner?: string): ImageData {
  const data = imageData.data;
  const W = imageData.width;
  const H = imageData.height;

  const numBlocksX = Math.floor(W / 8);
  const numBlocksY = Math.floor(H / 8);
  if (numBlocksX < 4 || numBlocksY < 4) {
    return imageData;
  }

  const ownerToEmbed = customOwner || "Digital Secure Seal";
  const PAYLOAD_BIT_LEN = 24 + 50 * 8; // 424 bits
  const bits = stringToFixedBits(ownerToEmbed);

  // G = 24 ensures excellent mathematical survival with 100% human-imperceptible pixels
  const TARGET_G = 24.0;

  let blockIndex = 0;
  for (let by = 0; by < numBlocksY; by++) {
    for (let bx = 0; bx < numBlocksX; bx++) {
      const bitPos = blockIndex % PAYLOAD_BIT_LEN;
      const bit = bits[bitPos];
      const bitVal = bit === 1 ? 1 : -1;

      const x0 = bx * 8;
      const y0 = by * 8;

      const Y: number[][] = Array.from({ length: 8 }, () => Array(8).fill(0));
      const Cb: number[][] = Array.from({ length: 8 }, () => Array(8).fill(0));
      const Cr: number[][] = Array.from({ length: 8 }, () => Array(8).fill(0));

      for (let dy = 0; dy < 8; dy++) {
        for (let dx = 0; dx < 8; dx++) {
          const px = x0 + dx;
          const py = y0 + dy;
          const idx = (py * W + px) * 4;

          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];

          Y[dy][dx] = 0.299 * r + 0.587 * g + 0.114 * b;
          Cb[dy][dx] = -0.168736 * r - 0.331264 * g + 0.5 * b + 128;
          Cr[dy][dx] = 0.5 * r - 0.418688 * g - 0.081312 * b + 128;
        }
      }

      // 1-Level Haar DWT
      const { LL, LH, HL, HH } = haarDWT8x8(Y);

      // Extract current correlation for selected 16 coefficients
      const PN = getPNSequence(bitPos, 16);
      let S = 0;
      for (let i = 0; i < 16; i++) {
        const item = SELECTED_COEFFS[i];
        const val = item.band === 'LH' ? LH[item.r][item.c] : HL[item.r][item.c];
        S += val * PN[i];
      }

      // Modulate correlation value with Spread Spectrum guard gap
      if (S * bitVal < TARGET_G) {
        const diff = bitVal * TARGET_G - S;
        const adjustment = diff / 16;
        for (let i = 0; i < 16; i++) {
          const item = SELECTED_COEFFS[i];
          if (item.band === 'LH') {
            LH[item.r][item.c] += adjustment * PN[i];
          } else {
            HL[item.r][item.c] += adjustment * PN[i];
          }
        }
      }

      // Inverse DWT
      const Y_mod = haarIDWT8x8(LL, LH, HL, HH);

      // Reconstruct pixels in original space
      for (let dy = 0; dy < 8; dy++) {
        for (let dx = 0; dx < 8; dx++) {
          const px = x0 + dx;
          const py = y0 + dy;
          const idx = (py * W + px) * 4;

          const r_val = Y_mod[dy][dx] + 1.402 * (Cr[dy][dx] - 128);
          const g_val = Y_mod[dy][dx] - 0.344136 * (Cb[dy][dx] - 128) - 0.714136 * (Cr[dy][dx] - 128);
          const b_val = Y_mod[dy][dx] + 1.772 * (Cb[dy][dx] - 128);

          data[idx] = Math.max(0, Math.min(255, Math.round(r_val)));
          data[idx + 1] = Math.max(0, Math.min(255, Math.round(g_val)));
          data[idx + 2] = Math.max(0, Math.min(255, Math.round(b_val)));
        }
      }

      blockIndex++;
    }
  }

  return imageData;
}

/**
 * Sweeps potential translations and scales to blinds-decode robust Wavelet-domain watermark
 */
export function detectRobustWatermark(imageData: ImageData): { 
  matches: number; 
  total: number; 
  ratio: number; 
  decodedOwner?: string; 
} {
  const W = imageData.width;
  const H = imageData.height;

  // 1. Instant test at native scale/alignment for rapid validation
  const baseResult = decodeWithParameters(imageData, 0, 0);
  if (baseResult.ratio >= 0.78) {
    return {
      matches: baseResult.matches,
      total: ROBUST_MAGIC_HEADER.length,
      ratio: baseResult.ratio,
      decodedOwner: baseResult.decodedOwner
    };
  }

  // 2. Multi-scale & multi-offset grid sweep on optimized centermost patch
  const centerPatch = getCenterPatch(imageData, 384);
  const SCALE_FACTORS = [1.0, 0.75, 0.67, 0.5, 0.8, 1.2, 1.33, 1.5, 2.0];
  
  let bestScale = 1.0;
  let bestDx = 0;
  let bestDy = 0;
  let bestRatio = baseResult.ratio;
  let bestMatches = baseResult.matches;

  for (const scale of SCALE_FACTORS) {
    let scaledPatch = centerPatch;
    if (scale !== 1.0) {
      const targetW = Math.max(128, Math.floor(centerPatch.width * scale));
      const targetH = Math.max(128, Math.floor(centerPatch.height * scale));
      scaledPatch = resampleImageData(centerPatch, targetW, targetH);
    }

    for (let dy = 0; dy < 8; dy += 1) {
      for (let dx = 0; dx < 8; dx += 1) {
        const result = decodeWithParameters(scaledPatch, dx, dy);
        if (result.ratio > bestRatio) {
          bestRatio = result.ratio;
          bestMatches = result.matches;
          bestScale = scale;
          bestDx = dx;
          bestDy = dy;
          if (bestRatio >= 0.88) break;
        }
      }
      if (bestRatio >= 0.88) break;
    }
    if (bestRatio >= 0.88) break;
  }

  // 3. Complete final decode over entire canvas on winning parameters
  const confidenceThreshold = 0.70;
  if (bestRatio >= confidenceThreshold) {
    let finalDecodedImage = imageData;
    if (bestScale !== 1.0) {
      const finalW = Math.max(256, Math.floor(W * bestScale));
      const finalH = Math.max(256, Math.floor(H * bestScale));
      finalDecodedImage = resampleImageData(imageData, finalW, finalH);
    }

    const finalResult = decodeWithParameters(finalDecodedImage, bestDx, bestDy);
    return {
      matches: finalResult.matches,
      total: ROBUST_MAGIC_HEADER.length,
      ratio: finalResult.ratio,
      decodedOwner: finalResult.decodedOwner
    };
  }

  return {
    matches: bestMatches,
    total: ROBUST_MAGIC_HEADER.length,
    ratio: bestRatio,
    decodedOwner: undefined
  };
}

/**
 * Embeds an invisible steganographic LSB watermark in the red channel
 */
export function embedStegoWatermark(imageData: ImageData, customOwner?: string): ImageData {
  const data = imageData.data;
  const payload = customOwner ? `${STEGO_SIGNATURE}|${customOwner}` : STEGO_SIGNATURE;
  
  const encoder = new TextEncoder();
  const bytes = encoder.encode(payload);
  
  let binaryString = "";
  for (let i = 0; i < bytes.length; i++) {
    const binaryChar = bytes[i].toString(2).padStart(8, '0');
    binaryString += binaryChar;
  }
  binaryString += "00000000"; // Null terminator

  if (binaryString.length * 4 > data.length) {
    console.warn("Image space is insufficient for steganography embedding");
    return imageData;
  }

  for (let i = 0; i < binaryString.length; i++) {
    const bit = parseInt(binaryString[i], 10);
    const pixelIndex = i * 4;
    data[pixelIndex] = (data[pixelIndex] & 0xFE) | bit;
  }
  
  return imageData;
}

/**
 * Extracts the LSB steganographic watermark from the red channel
 */
export function detectStegoWatermark(imageData: ImageData): { presents: boolean; decoded: string; owner?: string } {
  const data = imageData.data;
  let binaryString = "";
  const maxBits = 150 * 8; // Max 150 characters
  
  for (let i = 0; i < maxBits; i++) {
    const pixelIndex = i * 4;
    if (pixelIndex >= data.length) break;
    const bit = data[pixelIndex] & 1;
    binaryString += bit;
  }
  
  const bytes: number[] = [];
  for (let i = 0; i < binaryString.length; i += 8) {
    const byteString = binaryString.substring(i, i + 8);
    if (byteString.length < 8) break;
    
    const byte = parseInt(byteString, 2);
    if (byte === 0) break;
    bytes.push(byte);
  }

  let decodedText = "";
  try {
    decodedText = new TextDecoder('utf-8').decode(new Uint8Array(bytes));
  } catch (e) {
    decodedText = bytes.map(b => String.fromCharCode(b)).join('');
  }

  const presents = decodedText.startsWith(STEGO_SIGNATURE);
  let owner: string | undefined = undefined;
  if (presents && decodedText.includes('|')) {
    const parts = decodedText.split('|');
    owner = parts.slice(1).join('|');
  }

  return { presents, decoded: decodedText, owner };
}

/**
 * Analyzes file canvas and produces forensically detailed status checks
 */
export function generateVerificationReport(
  file: File, 
  canvas: HTMLCanvasElement, 
  duration?: number
): Promise<WatermarkVerificationReport> {
  return new Promise((resolve) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      resolve({
        isVerified: false,
        score: 0,
        timestamp: new Date().toISOString(),
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        dimensions: "Unknown",
        hasStegoSignature: false,
        hasVisualWatermarkPredicted: false,
        watermarkMethodUsed: [],
        comments: "Could not access image decoding context."
      });
      return;
    }

    try {
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const imageData = ctx.getImageData(0, 0, imgWidth, imgHeight);
      
      const { presents, owner: lsbOwner } = detectStegoWatermark(imageData);
      const { matches, total, ratio, decodedOwner: robustOwner } = detectRobustWatermark(imageData);
      
      const finalOwner = lsbOwner || robustOwner;
      const hasFilenameSign = file.name.toLowerCase().includes('watermarked') || file.name.toLowerCase().includes('watermark');
      const hasVisualWatermarkPredicted = hasFilenameSign; 
      
      let score = 0;
      const methods: string[] = [];
      let comments = "The file does not contain any authorized digital watermark signatures.";
      
      const isRobustVerified = ratio >= 0.70;
      
      if (presents) {
        score = 100;
        methods.push("Invisible Steganographic Pixel Layer");
        if (isRobustVerified) {
          methods.push("Robust Spatial-Luminance Wavelet Seal");
        }
        if (finalOwner) {
          comments = `Verified authentic (Pristine PNG). Owner identified as: "${finalOwner}". Found embedded LSB pixel validation signature matching 'DIGITAL_WATERMARK_VERIFIED_2026'.`;
        } else {
          comments = "Verified authentic (Pristine PNG). Found embedded LSB pixel validation signature matching 'DIGITAL_WATERMARK_VERIFIED_2026'.";
        }
      } else if (isRobustVerified) {
        score = Math.round(ratio * 100);
        methods.push("Robust Spatial-Luminance Wavelet Seal");
        if (finalOwner) {
          comments = `Verified authentic (Rugged proof). Robust Wavelet-Spread Spectrum seal decoded. Owner: "${finalOwner}". Successfully survived edits, screenshots/captures, or cropping.`;
        } else {
          comments = `Verified authentic (Rugged proof). Robust Wavelet-Spread Spectrum seal decoded (Match: ${matches}/${total}, ${Math.round(ratio * 100)}%). Successfully survived screenshots/captures or cropping.`;
        }
      } else if (hasFilenameSign) {
        score = 45;
        methods.push("Filename Meta Marker");
        comments = "Filename flag indicated watermarked state, but invisible stego verification signature was missing (or lost due to low resolution).";
      }

      const isVerified = presents || isRobustVerified;

      resolve({
        isVerified: isVerified,
        score: score,
        timestamp: new Date().toISOString(),
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        dimensions: `${imgWidth} × ${imgHeight}`,
        hasStegoSignature: presents || isRobustVerified,
        hasVisualWatermarkPredicted: hasVisualWatermarkPredicted,
        watermarkMethodUsed: methods,
        comments: comments,
        owner: finalOwner
      });
    } catch (e) {
      resolve({
        isVerified: false,
        score: 0,
        timestamp: new Date().toISOString(),
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        dimensions: "Error reading",
        hasStegoSignature: false,
        hasVisualWatermarkPredicted: false,
        watermarkMethodUsed: [],
        comments: `Analysis aborted: ${e instanceof Error ? e.message : String(e)}`
      });
    }
  });
}
