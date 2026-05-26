/**
 * Computes the SHA-256 hash of a file or blob in the browser
 * using the highly secure, native Web Crypto API.
 */
export async function computeFileHash(fileOrBlob: Blob): Promise<string> {
  try {
    const arrayBuffer = await fileOrBlob.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  } catch (error) {
    console.error("Cryptographic hash calculation failed:", error);
    return "Error calculating hash";
  }
}

/**
 * Helper to short-format a hash for displays
 * e.g., "7f83b1c2..." instead of the full 64-character sequence
 */
export function formatHashShort(hash?: string): string {
  if (!hash) return 'Calculating...';
  if (hash.startsWith('Error') || hash.length < 12) return hash;
  return `${hash.substring(0, 8)}...${hash.substring(hash.length - 8)}`;
}
