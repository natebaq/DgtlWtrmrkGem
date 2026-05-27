/**
 * NPM Package Installation commands:
 * npm install watermark-js-plus
 */

import { BlindWatermark } from 'watermark-js-plus';

interface WatermarkOptions {
  /**
   * The secret signature text to embed as a blind watermark (e.g. copyright info)
   */
  text: string;
  /**
   * Robustness intensity coefficient (tuning Alpha to maximum boundary while keeping it visually invisible)
   * Higher values increase resistance but may slightly affect visual fidelity.
   * Suggested value: 0.05 to 0.15 (Max safe invisible range)
   */
  alpha?: number;
  /**
   * Font size of the embedded blind watermark pattern.
   * Larger fonts survive resizing and compressions better.
   */
  fontSize?: number;
  /**
   * Grid density of the watermark tiles (shorter gaps mean higher redundancy = better crop survival)
   */
  gap?: number;
}

/**
 * 1. EMBED WATERMARK ENGINE (using watermark-js-plus)
 * Takes a source image (File, Blob, or image URL) and embeds an invisible blind watermark,
 * returning the watermarked image as a Base64 string.
 */
export async function embedWatermark(
  imageSrc: File | Blob | string,
  options: WatermarkOptions
): Promise<string> {
  return new Promise(async (resolve, reject) => {
    try {
      let url = '';
      if (imageSrc instanceof File || imageSrc instanceof Blob) {
        url = URL.createObjectURL(imageSrc);
      } else {
        url = imageSrc;
      }

      // Configure watermark-js-plus BlindWatermark with maximum robust parameters
      const blindWatermark = new BlindWatermark({
        content: options.text,
        width: 150,                     // Redundant pattern tiling tile width
        height: 150,                    // Redundant pattern tiling tile height
        fontSize: `${options.fontSize || 18}px`, // Large font size to survive screenshots
        fontColor: '#000000',           // Solid color to build high-amplitude frequency seals
        globalAlpha: options.alpha ?? 0.10, // Fine-tuned Max Alpha (Invisible boundary: 0.05 - 0.15)
        rotate: 30,                     // Angled embedding to break JPEG horizontal/vertical scanning block artifacts
        // Set dense grid spacing for high crop resistance (redundancy)
        translate: [10, 10],
      } as any);

      // Load original image and apply invisible watermark
      const watermarkedBase64 = await (blindWatermark as any).create({
        image: url,
        onSuccess: (base64: string) => {
          // Cleanup object URL if created dynamically
          if (imageSrc instanceof File || imageSrc instanceof Blob) {
            URL.revokeObjectURL(url);
          }
          resolve(base64);
        },
        onError: (err: any) => {
          reject(err);
        }
      }) as any;

      // Secure callback fallback if promise resolved early or returned differently
      if (typeof watermarkedBase64 === 'string' && (watermarkedBase64 as string).startsWith('data:image')) {
        resolve(watermarkedBase64);
      }

    } catch (error) {
      reject(error);
    }
  });
}

/**
 * 2. DECODE WATERMARK ENGINE (using watermark-js-plus)
 * Takes a potentially distorted captured image (screenshot, crop, resize)
 * and decodes the hidden frequency/spatial components to output a visual verification canvas.
 * 
 * Note: Blind watermarking libraries like watermark-js-plus extract the watermark
 * by exposing hidden patterns as a high-contrast visual (white text on a black canvas).
 */
export async function decodeWatermark(
  distortedImageSrc: File | Blob | string
): Promise<HTMLCanvasElement> {
  return new Promise(async (resolve, reject) => {
    try {
      let url = '';
      if (distortedImageSrc instanceof File || distortedImageSrc instanceof Blob) {
        url = URL.createObjectURL(distortedImageSrc);
      } else {
        url = distortedImageSrc;
      }

      const blindWatermark = new BlindWatermark({
        // Standard parameters used for decoding
        content: '', 
        rotate: 30,
      } as any);

      // Decode the hidden patterns
      (blindWatermark as any).decode({
        image: url,
        onSuccess: (decodedCanvas: HTMLCanvasElement | string) => {
          if (distortedImageSrc instanceof File || distortedImageSrc instanceof Blob) {
            URL.revokeObjectURL(url);
          }

          if (decodedCanvas instanceof HTMLCanvasElement) {
            resolve(decodedCanvas);
          } else if (typeof decodedCanvas === 'string') {
            // If the library returns a Base64 string, convert it to a canvas for downstream processes
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();
            img.onload = () => {
              canvas.width = img.width;
              canvas.height = img.height;
              ctx?.drawImage(img, 0, 0);
              resolve(canvas);
            };
            img.onerror = () => reject(new Error('Failed to render decoded image string onto canvas'));
            img.src = decodedCanvas;
          } else {
            reject(new Error('Unknown format returned during watermark decoding.'));
          }
        },
        onError: (err: any) => {
          reject(err);
        }
      });

    } catch (error) {
      reject(error);
    }
  });
}
