import { WatermarkConfig, BatchFile, WatermarkVerificationReport } from '../types';
import { embedStegoWatermark, embedRobustWatermark, generateVerificationReport } from './steganography';

/**
 * Renders the visual watermark on top of a canvas context.
 */
export function applyVisualWatermark(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  config: WatermarkConfig,
  loadedLogoImg: HTMLImageElement | null
): void {
  if (config.enableVisibleWatermark === false) {
    return;
  }
  ctx.save();
  ctx.globalAlpha = config.opacity;

  let markWidth = 160;
  let markHeight = 45;

  if (config.type === 'text') {
    // Dynamically size target width based on text metrics
    ctx.font = `bold ${config.fontSize}px ${config.fontFamily.includes('system-ui') ? 'Inter, sans-serif' : config.fontFamily}`;
    const metrics = ctx.measureText(config.text);
    markWidth = metrics.width;
    markHeight = config.fontSize;
  } else if (config.type === 'image' && loadedLogoImg) {
    markWidth = loadedLogoImg.naturalWidth * config.scale;
    markHeight = loadedLogoImg.naturalHeight * config.scale;
    // Safe margins
    if (markWidth === 0) markWidth = 120;
    if (markHeight === 0) markHeight = 120;
  }

  const margin = 24;

  const drawMarkAt = (x: number, y: number) => {
    ctx.save();
    // Translate to center of placement for smooth custom rotations
    ctx.translate(x + markWidth / 2, y + markHeight / 2);
    ctx.rotate((config.rotation * Math.PI) / 180);

    if (config.type === 'text') {
      ctx.fillStyle = config.textColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(config.text, 0, 0);
    } else if (config.type === 'image' && loadedLogoImg) {
      ctx.drawImage(
        loadedLogoImg,
        -markWidth / 2,
        -markHeight / 2,
        markWidth,
        markHeight
      );
    }
    ctx.restore();
  };

  if (config.placement === 'tile') {
    const spacingX = markWidth + 120;
    const spacingY = markHeight + 80;
    for (let x = 10; x < canvasWidth; x += spacingX) {
      for (let y = 10; y < canvasHeight; y += spacingY) {
        drawMarkAt(x, y);
      }
    }
  } else {
    let targetX = 0;
    let targetY = 0;

    switch (config.placement) {
      case 'top-left':
        targetX = margin;
        targetY = margin;
        break;
      case 'top-right':
        targetX = canvasWidth - markWidth - margin;
        targetY = margin;
        break;
      case 'center':
        targetX = (canvasWidth - markWidth) / 2;
        targetY = (canvasHeight - markHeight) / 2;
        break;
      case 'bottom-left':
        targetX = margin;
        targetY = canvasHeight - markHeight - margin;
        break;
      case 'bottom-right':
        targetX = canvasWidth - markWidth - margin;
        targetY = canvasHeight - markHeight - margin;
        break;
      case 'custom':
        targetX = (config.customX / 100) * (canvasWidth - markWidth);
        targetY = (config.customY / 100) * (canvasHeight - markHeight);
        break;
    }
    drawMarkAt(targetX, targetY);
  }

  ctx.restore();
}

/**
 * Programmatically draw, watermark, and output a signed Image Blob
 */
export async function processImageWatermark(
  item: BatchFile,
  config: WatermarkConfig,
  loadedLogoImg: HTMLImageElement | null
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error("Could not access offscreen drawing context"));
          return;
        }

        // Draw primary image
        ctx.drawImage(img, 0, 0);

        // Apply Customizable Visual Protection Overlay
        applyVisualWatermark(ctx, canvas.width, canvas.height, config, loadedLogoImg);

        // Apply Cryptographic Steganography layer in Red LSB if selected
        if (config.embedSteganography) {
          let rawData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          // Apply robust differential average block watermark first (extreme JPEG and rewrite survivability)
          rawData = embedRobustWatermark(rawData, config.stegoOwner);
          // Apply pristine LSB steganography watermark second (for perfect lossless integrity checks)
          rawData = embedStegoWatermark(rawData, config.stegoOwner);
          ctx.putImageData(rawData, 0, 0);
        }

        // Output as PNG (recommended for lossless pixel accuracy)
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Failed to export image canvas"));
          }
        }, 'image/png');
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => {
      reject(new Error("Failed to load source image file"));
    };
    img.src = item.url;
  });
}

/**
 * Watermarks a Video file frame-by-frame on the client-side
 */
export async function processVideoWatermark(
  item: BatchFile,
  config: WatermarkConfig,
  loadedLogoImg: HTMLImageElement | null,
  onProgress: (percent: number) => void
): Promise<Blob> {
  const video = document.createElement('video');
  video.src = item.url;
  video.muted = true;
  video.playsInline = true;

  return new Promise<Blob>((resolve, reject) => {
    video.onloadedmetadata = async () => {
      try {
        const width = video.videoWidth || 640;
        const height = video.videoHeight || 360;

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error("Failed to initialize canvas stream"));
          return;
        }

        // Capture canvas stream at 24 frames per second
        const stream = canvas.captureStream(24);
        
        // Setup Media Recorder with clean formats list
        let mediaRecorder: MediaRecorder;
        const recordedChunks: Blob[] = [];

        const options = [
          { mimeType: 'video/webm;codecs=vp9' },
          { mimeType: 'video/webm' },
          { mimeType: 'video/mp4' }
        ];

        let selectedOption = options.find(opt => MediaRecorder.isTypeSupported(opt.mimeType)) || { mimeType: '' };
        
        mediaRecorder = new MediaRecorder(stream, selectedOption);
        
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            recordedChunks.push(event.data);
          }
        };

        mediaRecorder.onstop = () => {
          const finalBlob = new Blob(recordedChunks, { type: selectedOption.mimeType || 'video/webm' });
          resolve(finalBlob);
        };

        // Standard timeline tracking parameters
        const duration = video.duration || 1;
        video.currentTime = 0;

        mediaRecorder.start();

        // Loop play video to render onto frame canvas
        const frameInterval = 1000 / 24; // 24 FPS redraws
        
        video.play().catch(() => {});

        const processFrameLoop = () => {
          if (video.paused || video.ended) {
            mediaRecorder.stop();
            return;
          }

          // Draw baseline frame
          ctx.drawImage(video, 0, 0, width, height);

          // Apply overlay stamp
          applyVisualWatermark(ctx, width, height, config, loadedLogoImg);

          // Update real-time progress callbacks
          const pct = Math.min(Math.round((video.currentTime / duration) * 100), 100);
          onProgress(pct);

          requestAnimationFrame(processFrameLoop);
        };

        video.onplay = () => {
          requestAnimationFrame(processFrameLoop);
        };

        video.onended = () => {
          if (mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
          }
        };

        video.onerror = () => {
          reject(new Error("Video playback error during encoding"));
        };
      } catch (e) {
        reject(e);
      }
    };

    video.onerror = () => {
      reject(new Error("Could not parse video frames descriptor"));
    };
  });
}
