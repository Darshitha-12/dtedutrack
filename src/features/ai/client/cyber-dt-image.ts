"use client";

/**
 * Turns a picked/captured photo into something small enough to send to the
 * Cyber DT routes. Phone cameras produce 4–12 MB photos, which blow past
 * Netlify's 6 MB request cap once base64-encoded, so images are downscaled
 * and re-encoded in the browser first.
 */

export interface CyberDTImageAttachment {
  /** Full data: URL, used only for the thumbnail preview. */
  dataUrl: string;
  mimeType: string;
  /** Base64 payload without the data: URL prefix. */
  base64: string;
  name: string;
}

/** PNG + JPEG, matching what the upload buttons and the API accept. */
export const CYBER_DT_IMAGE_ACCEPT = "image/png,image/jpeg";

/** Gemini tiles images at 768 px; 1568 px keeps handwriting and labels legible. */
const MAX_EDGE = 1568;
/** Under Netlify's 6 MB body limit even with JSON overhead. */
const MAX_BASE64_CHARS = 4_500_000;
const JPEG_QUALITY = 0.85;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string" && result.startsWith("data:")) resolve(result);
      else reject(new Error("Could not read that image."));
    };
    reader.onerror = () => reject(new Error("Could not read that image."));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read that image."));
    img.src = src;
  });
}

async function downscale(dataUrl: string): Promise<string> {
  const img = await loadImage(dataUrl);
  const longest = Math.max(img.naturalWidth, img.naturalHeight, 1);
  const scale = Math.min(1, MAX_EDGE / longest);
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  // JPEG has no transparency — fill white so PNG diagrams don't come out black.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

export async function prepareCyberDTImage(file: File): Promise<CyberDTImageAttachment> {
  if (!/^image\/(png|jpe?g)$/i.test(file.type)) {
    throw new Error("Only PNG and JPEG images are supported.");
  }

  const original = await readAsDataUrl(file);
  let dataUrl = original;
  // Small JPEGs go straight through; everything else (large camera photos,
  // PNG screenshots) is shrunk to keep the request light.
  if (file.type !== "image/jpeg" || file.size > 900_000) {
    try {
      dataUrl = await downscale(original);
    } catch {
      /* canvas unavailable — send the original and let the size check decide */
    }
  }

  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1).replace(/\s+/g, "");
  if (!base64) throw new Error("Could not read that image.");
  if (base64.length > MAX_BASE64_CHARS) {
    throw new Error("That image is too large. Try a smaller photo.");
  }

  const rawMime = /^data:([^;,]+)[;,]/.exec(dataUrl)?.[1]?.toLowerCase() ?? "";
  const mimeType = rawMime === "image/jpg" ? "image/jpeg" : rawMime || "image/jpeg";
  return { dataUrl, mimeType, base64, name: file.name || "photo.jpg" };
}
