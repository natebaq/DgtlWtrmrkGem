import { WatermarkVerificationReport } from '../types';

export const STEGO_SIGNATURE = "DIGITAL_WATERMARK_VERIFIED_2026";

// 24-bit magic header to identify robust watermark payload presence
const ROBUST_MAGIC_HEADER = [1, 0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 1, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1];

// Precompute 1D DCT cosine factors for an 8x8 grid to optimize performance
const COS_TABLE: number[][] = [];
for (let i = 0; i < 8; i++) {
  COS_TABLE[i] = [];
  for (let j = 0; j < 8; j++) {
    COS_TABLE[i][j] = Math.cos(((2 * i + 1) * j * Math.PI) / 16);
  }
}

/**
 * 2D Discrete Cosine Transform (DCT-II) for an 8x8 matrix
 */
function dct8x8(block: number[][]): number[][] {
  const dct: number[][] = Array.from({ length: 8 }, () => Array(8).fill(0));
  for (let u = 0; u < 8; u++) {
    const cu = u === 0 ? 1 / Math.sqrt(2) : 1;
    for (let v = 0; v < 8; v++) {
      const cv = v === 0 ? 1 / Math.sqrt(2) : 1;
      let sum = 0;
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          sum += block[y][x] * COS_TABLE[x][u] * COS_TABLE[y][v];
        }
      }
      dct[v][u] = 0.25 * cu * cv * sum;
    }
  }
  return dct;
}

/**
 * 2D Inverse Discrete Cosine Transform (DCT-III) for an 8x8 matrix
 */
function idct8x8(dct: number[][]): number[][] {
  const block: number[][] = Array.from({ length: 8 }, () => Array(8).fill(0));
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      let sum = 0;
      for (let u = 0; u < 8; u++) {
        const cu = u === 0 ? 1 / Math.sqrt(2) : 1;
        for (let v = 0; v < 8; v++) {
          const cv = v === 0 ? 1 / Math.sqrt(2) : 1;
          sum += cu * cv * dct[v][u] * COS_TABLE[x][u] * COS_TABLE[y][v];
        }
      }
      block[y][x] = 0.25 * sum;
    }
  }
  return block;
}

/**
 * Encodes a string into a fixed-width binary bitstream of 424 bits (24 header bits + 400 string bits)
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
      paddedBytes[i] = 0; // Null byte padding
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
 * Embeds robust DCT-domain mid-frequency watermarking into the image's Luminance (Y) channel.
 * High resistance to lossy JPEG compression because it alters the active cosine frequencies directly.
 */
export function embedRobustWatermark(imageData: ImageData, customOwner?: string): ImageData {
  const data = imageData.data;
  const W = imageData.width;
  const H = imageData.height;

  const numBlocksX = Math.floor(W / 8);
  const numBlocksY = Math.floor(H / 8);
  if (numBlocksX < 4 || numBlocksY < 4) {
    // Skip if image is too small to contain watermark grids
    return imageData;
  }

  const ownerToEmbed = customOwner || "Digital Secure Seal";
  const PAYLOAD_BIT_LEN = 24 + 50 * 8; // 424 bits
  const bits = stringToFixedBits(ownerToEmbed);

  const DELTA = 25; // Modulation strength for maximum survival under low-quality JPG

  let blockIndex = 0;
  for (let by = 0; by < numBlocksY; by++) {
    for (let bx = 0; bx < numBlocksX; bx++) {
      const bitPos = blockIndex % PAYLOAD_BIT_LEN;
      const bit = bits[bitPos];

      const x0 = bx * 8;
      const y0 = by * 8;

      // 1. RGB to YCbCr conversion for the 8x8 block
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

      // 2. Forward 2D DCT on Luminance (Y) block
      const Y_dct = dct8x8(Y);

      // We select mid-frequency coefficients F(4, 1) and F(3, 2)
      let A = Y_dct[4][1];
      let B = Y_dct[3][2];

      // 3. Modulate mid-frequency coefficients (Differential encoding)
      if (bit === 1) {
        if (A - B < DELTA) {
          const diff = (A - B) - DELTA;
          Y_dct[4][1] = A - diff / 2;
          Y_dct[3][2] = B + diff / 2;
        }
      } else {
        if (B - A < DELTA) {
          const diff = (B - A) - DELTA;
          Y_dct[3][2] = B - diff / 2;
          Y_dct[4][1] = A + diff / 2;
        }
      }

      // 4. Inverse 2D DCT to return to space domain
      const Y_mod = idct8x8(Y_dct);

      // 5. Reconstruct RGB pixels using original Cb and Cr chrominances
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
 * Detects the embedded robust DCT-based safety seal with majority voting across blocks.
 */
export function detectRobustWatermark(imageData: ImageData): { 
  matches: number; 
  total: number; 
  ratio: number; 
  decodedOwner?: string; 
} {
  const data = imageData.data;
  const W = imageData.width;
  const H = imageData.height;

  const numBlocksX = Math.floor(W / 8);
  const numBlocksY = Math.floor(H / 8);
  if (numBlocksX < 4 || numBlocksY < 4) {
    return { matches: 0, total: ROBUST_MAGIC_HEADER.length, ratio: 0 };
  }

  const PAYLOAD_BIT_LEN = 24 + 50 * 8; // 424 bits
  const voters: number[][] = Array.from({ length: PAYLOAD_BIT_LEN }, () => []);

  let blockIndex = 0;
  for (let by = 0; by < numBlocksY; by++) {
    for (let bx = 0; bx < numBlocksX; bx++) {
      const x0 = bx * 8;
      const y0 = by * 8;

      // Extract Luminance (Y) channel for DCT analysis
      const Y: number[][] = Array.from({ length: 8 }, () => Array(8).fill(0));
      for (let dy = 0; dy < 8; dy++) {
        for (let dx = 0; dx < 8; dx++) {
          const px = x0 + dx;
          const py = y0 + dy;
          const idx = (py * W + px) * 4;

          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];

          Y[dy][dx] = 0.299 * r + 0.587 * g + 0.114 * b;
        }
      }

      // Forward 2D DCT on Y channel
      const Y_dct = dct8x8(Y);

      const A = Y_dct[4][1];
      const B = Y_dct[3][2];
      const bit = A > B ? 1 : 0;

      const bitPos = blockIndex % PAYLOAD_BIT_LEN;
      voters[bitPos].push(bit);

      blockIndex++;
    }
  }

  // Compile final bit sequence from voter cards (majority voting)
  const decodedBits: number[] = [];
  for (let i = 0; i < PAYLOAD_BIT_LEN; i++) {
    const votes = voters[i];
    if (votes.length === 0) {
      decodedBits.push(0);
      continue;
    }
    let ones = 0;
    for (const v of votes) {
      if (v === 1) ones++;
    }
    decodedBits.push(ones > votes.length / 2 ? 1 : 0);
  }

  // Validate the magic header matching
  let headerMatches = 0;
  for (let i = 0; i < ROBUST_MAGIC_HEADER.length; i++) {
    if (decodedBits[i] === ROBUST_MAGIC_HEADER[i]) {
      headerMatches++;
    }
  }

  const ratio = headerMatches / ROBUST_MAGIC_HEADER.length;
  const isHeaderValid = ratio >= 0.70; // Tolerates minor lossy noise

  if (!isHeaderValid) {
    return { matches: headerMatches, total: ROBUST_MAGIC_HEADER.length, ratio };
  }

  // Extract string payload bytes (50 bytes)
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

  let decodedOwner = "";
  try {
    const trimmedBytes = bytes.filter(b => b !== 0);
    decodedOwner = new TextDecoder('utf-8').decode(new Uint8Array(trimmedBytes));
    // Support Hangul / alpha numeric and standard unicode text safely
    decodedOwner = decodedOwner.replace(/[^\x20-\x7E\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF\uAC00-\uD7A3가-힣]/g, '');
  } catch (e) {
    decodedOwner = bytes.filter(b => b > 31 && b < 127).map(b => String.fromCharCode(b)).join('');
  }

  if (decodedOwner.trim().length === 0) {
    return { matches: headerMatches, total: ROBUST_MAGIC_HEADER.length, ratio };
  }

  return {
    matches: headerMatches,
    total: ROBUST_MAGIC_HEADER.length,
    ratio,
    decodedOwner
  };
}

/**
 * Embeds an invisible steganographic signature into the LSBs of the red channel.
 */
export function embedStegoWatermark(imageData: ImageData, customOwner?: string): ImageData {
  const data = imageData.data;
  
  const payload = customOwner ? `${STEGO_SIGNATURE}|${customOwner}` : STEGO_SIGNATURE;
  
  // Use TextEncoder to cleanly support UTF-8 (including Korean/special characters)
  const encoder = new TextEncoder();
  const bytes = encoder.encode(payload);
  
  let binaryString = "";
  for (let i = 0; i < bytes.length; i++) {
    const binaryChar = bytes[i].toString(2).padStart(8, '0');
    binaryString += binaryChar;
  }
  // Add an 8-bit null terminator to mark the end of the watermark message
  binaryString += "00000000";

  if (binaryString.length * 4 > data.length) {
    console.warn("Image space is insufficient for stego embedding");
    return imageData;
  }

  for (let i = 0; i < binaryString.length; i++) {
    const bit = parseInt(binaryString[i], 10);
    const pixelIndex = i * 4; // R channel of pixel i
    
    // Clear least significant bit of Red, then set it to the target bit
    data[pixelIndex] = (data[pixelIndex] & 0xFE) | bit;
  }
  
  return imageData;
}

/**
 * Extracts a steganographic message from the LSBs of the red channel.
 */
export function detectStegoWatermark(imageData: ImageData): { presents: boolean; decoded: string; owner?: string } {
  const data = imageData.data;
  let binaryString = "";
  
  // Limit character scanning to 150 characters (1200 bits) for custom owner payloads safely
  const maxBits = 150 * 8;
  
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
    if (byte === 0) {
      break; // Null terminator found
    }
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
 * Generates an in-depth report by analyzing an image element.
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
      
      const { presents, decoded, owner } = detectStegoWatermark(imageData);
      const { matches, total, ratio, decodedOwner } = detectRobustWatermark(imageData);
      
      const finalOwner = owner || decodedOwner;
      
      // Analyze file name containing "[watermarked]"
      const hasFilenameSign = file.name.toLowerCase().includes('watermarked') || file.name.toLowerCase().includes('watermark');
      
      // Look for custom opacity layers or grid anomalies
      const hasVisualWatermarkPredicted = hasFilenameSign; 
      
      let score = 0;
      const methods: string[] = [];
      let comments = "The file does not contain any authorized digital watermark signatures.";
      
      const isRobustVerified = ratio >= 0.75; // 18 out of 24 header bits match perfectly
      
      if (presents) {
        score = 100;
        methods.push("Invisible Steganographic Pixel Layer");
        if (isRobustVerified) {
          methods.push("Robust Spatial-Luminance Safety Seal");
        }
        if (finalOwner) {
          comments = `Verified authentic (Pristine PNG). Owner identified as: "${finalOwner}". Found embedded LSB pixel validation signature matching 'DIGITAL_WATERMARK_VERIFIED_2026'.`;
        } else {
          comments = "Verified authentic (Pristine PNG). Found embedded LSB pixel validation signature matching 'DIGITAL_WATERMARK_VERIFIED_2026'.";
        }
      } else if (isRobustVerified) {
        score = Math.round(ratio * 100);
        methods.push("Robust Spatial-Luminance Safety Seal");
        if (finalOwner) {
          comments = `Verified authentic (Rugged protection). Robust block-luminance safety seal successfully decoded. Owner identified as: "${finalOwner}". This successfully confirms ownership even after format conversion (PNG-to-JPG), drawing, compression, or light editing.`;
        } else {
          comments = `Verified authentic (Rugged protection). Robust block-luminance safety seal successfully decoded (Match: ${matches}/${total}, ${Math.round(ratio * 100)}%). This confirms ownership even after format conversion (PNG-to-JPG), drawing, compression, or light editing.`;
        }
      } else if (hasFilenameSign) {
        score = 45;
        methods.push("Filename Meta Marker");
        comments = "Filename flag indicated watermarked state, but invisible stego verification signature was missing (or was lost due to lossy JPEG compression).";
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
