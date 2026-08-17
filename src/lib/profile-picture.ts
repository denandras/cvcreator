"use client";

/**
 * Profile picture local storage utility.
 * Stores images in localStorage as base64 data URLs.
 * No backend storage — everything stays in the browser.
 */

const STORAGE_KEY = "cv:profile-picture";
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

/**
 * Read the stored profile picture as a data URL (or null if not set).
 */
export function getProfilePicture(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Store a profile picture. Accepts a File or data URL.
 * Images are resized/compressed to max 400x400px JPEG at 0.85 quality
 * to keep localStorage usage small.
 */
export async function setProfilePicture(input: File | string): Promise<string> {
  let dataUrl: string;

  if (typeof input === "string") {
    dataUrl = input;
  } else {
    if (input.size > MAX_FILE_SIZE) {
      throw new Error(`Image is too large. Maximum size is 20 MB. Your file is ${(input.size / 1024 / 1024).toFixed(1)} MB.`);
    }
    dataUrl = await fileToDataUrl(input);
  }

  // Compress/resize
  const compressed = await resizeImage(dataUrl, 400, 400, 0.85);

  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, compressed);
  }

  return compressed;
}

/**
 * Remove the stored profile picture.
 */
export function removeProfilePicture(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function resizeImage(
  dataUrl: string,
  maxWidth: number,
  maxHeight: number,
  quality: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;

      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl); // fallback to original
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}