"use client";

/**
 * Turns a picked PDF into something the Cyber DT routes can send to Gemini.
 *
 * The whole file is sent as inline data — Gemini reads PDFs natively (including
 * the text inside scanned pages), so the browser never has to parse the PDF
 * itself, which keeps the offline APK light. Netlify caps a request body at
 * 6 MB, so oversized files are rejected with a friendly message instead of
 * failing deep inside the network layer.
 */

export interface CyberDTPdfAttachment {
  /** Full data: URL, kept only for the file-name preview. */
  dataUrl: string;
  mimeType: string;
  /** Base64 payload without the data: URL prefix. */
  base64: string;
  name: string;
  /** Original file size in bytes, for the UI. */
  size: number;
}

export const CYBER_DT_PDF_ACCEPT = "application/pdf,.pdf";

/**
 * Base64 chars, kept below Netlify's 6 MB body cap once the JSON wrapper and
 * any conversation history are added. ~4.2 MB of base64 ≈ a 3.1 MB PDF.
 */
const MAX_BASE64_CHARS = 4_200_000;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string" && result.startsWith("data:")) resolve(result);
      else reject(new Error("Could not read that PDF."));
    };
    reader.onerror = () => reject(new Error("Could not read that PDF."));
    reader.readAsDataURL(file);
  });
}

export async function prepareCyberDTPdf(file: File): Promise<CyberDTPdfAttachment> {
  const looksPdf = /pdf/i.test(file.type) || /\.pdf$/i.test(file.name);
  if (!looksPdf) {
    throw new Error("Please choose a PDF file.");
  }

  const dataUrl = await readAsDataUrl(file);
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1).replace(/\s+/g, "");
  if (!base64) throw new Error("Could not read that PDF.");
  if (base64.length > MAX_BASE64_CHARS) {
    throw new Error("That PDF is too large. Use a file under about 3 MB.");
  }

  return {
    dataUrl,
    mimeType: "application/pdf",
    base64,
    name: file.name || "document.pdf",
    size: file.size,
  };
}
