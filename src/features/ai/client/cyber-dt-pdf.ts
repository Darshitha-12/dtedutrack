"use client";

/**
 * Turns a picked PDF into something the Cyber DT routes can send to Gemini.
 *
 * Netlify caps a request body at 6 MB, so a whole 50 MB PDF can never be POSTed
 * to the server. Instead the file is read IN THE BROWSER with pdf.js:
 *
 *   - small PDFs (≤ 3.4 MB)  → sent whole, as inline data (best fidelity)
 *   - large text PDFs        → the text layer is extracted and sent as text
 *   - large scanned PDFs     → the pages are rendered to JPEG and sent as images
 *
 * The student's file never leaves their device except as the small text/image
 * payload Gemini actually needs.
 */

import type { PDFDocumentProxy } from "pdfjs-dist";

export const CYBER_DT_PDF_ACCEPT = "application/pdf,.pdf";

/** Netlify caps the body at 6 MB; base64 of 3.4 MB is ~4.5 MB plus JSON. */
const INLINE_MAX_BYTES = 3_400_000;
/** Text is ~1 byte per char in JSON; stay well under the 6 MB body cap. */
const MAX_TEXT_CHARS = 3_500_000;
/**
 * A scanned page at 1400 px JPEG is ~150–300 KB of base64. Keep one request
 * comfortably under the 6 MB body cap AND small enough that a single Gemini
 * call stays fast: ~1.6 M base64 chars is roughly 7–8 pages, so a long scanned
 * book is sent in several small batches instead of one huge request that would
 * time out or trip the free-tier quota.
 */
const MAX_IMAGE_BASE64_CHARS = 1_600_000;
/** Upper bound on pages rendered for one action. */
const MAX_SCAN_PAGES = 40;
const SCAN_MAX_EDGE = 1400;
const SCAN_QUALITY = 0.72;
/** Below this much extracted text the document is treated as a scan. */
const TEXT_MIN_CHARS = 1200;

export interface CyberDTPdfImage {
  mimeType: string;
  /** Base64 payload WITHOUT the data: URL prefix. */
  data: string;
}

export type CyberDTPdfSource =
  | { kind: "inline"; name: string; size: number; pageCount: number; base64: string }
  | {
      kind: "text";
      name: string;
      size: number;
      pageCount: number;
      text: string;
      truncated: boolean;
    }
  | {
      kind: "images";
      name: string;
      size: number;
      pageCount: number;
      images: CyberDTPdfImage[];
      fromPage: number;
      toPage: number;
    };

export interface CyberDTPdfProgress {
  phase: "reading" | "text" | "rendering";
  page?: number;
  pageCount?: number;
}

/** The browser build of pdf.js, loaded on demand (never on the server). */
type PdfJs = typeof import("pdfjs-dist");
let pdfJsPromise: Promise<PdfJs> | null = null;

function loadPdfJs(): Promise<PdfJs> {
  if (!pdfJsPromise) {
    pdfJsPromise = import("pdfjs-dist").then((mod) => {
      // The worker ships in /public so the offline APK can serve it too.
      mod.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return mod;
    });
  }
  return pdfJsPromise;
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string" && result.startsWith("data:")) {
        resolve(result.slice(result.indexOf(",") + 1).replace(/\s+/g, ""));
      } else {
        reject(new Error("Could not read that PDF."));
      }
    };
    reader.onerror = () => reject(new Error("Could not read that PDF."));
    reader.readAsDataURL(file);
  });
}

function friendlyPdfError(error: unknown): string {
  const name = (error as { name?: string } | null)?.name;
  if (name === "PasswordException") {
    return "This PDF is password-protected. Please remove the password and upload it again.";
  }
  if (name === "InvalidPDFException") {
    return "That file is not a valid PDF. Please upload it again.";
  }
  return "Could not read that PDF. It may be damaged or in an unsupported format.";
}

async function openPdf(file: File): Promise<PDFDocumentProxy> {
  const pdfjs = await loadPdfJs();
  // pdf.js takes ownership of the buffer, so hand it a private copy.
  const data = new Uint8Array(await file.arrayBuffer());
  try {
    return await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  } catch (error) {
    throw new Error(friendlyPdfError(error));
  }
}

/** Extracts the text layer of a page, or "" when the page has none (a scan). */
async function pageText(doc: PDFDocumentProxy, pageNumber: number): Promise<string> {
  try {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    page.cleanup();
    return text;
  } catch {
    return "";
  }
}

/** Renders one page to a downscaled JPEG. */
async function renderPage(doc: PDFDocumentProxy, pageNumber: number): Promise<CyberDTPdfImage | null> {
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(3, SCAN_MAX_EDGE / Math.max(base.width, base.height));
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return null;

  // Scans are usually transparent-free, but a white base keeps JPEG clean.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // `intent: "print"` makes pdf.js step the render synchronously instead of via
  // requestAnimationFrame, so a big scan keeps rendering even while the tab is
  // not being painted (e.g. the student switches tabs). The page raster is the
  // same for a document like this.
  await page.render({ canvasContext: ctx, viewport, intent: "print" }).promise;
  const dataUrl = canvas.toDataURL("image/jpeg", SCAN_QUALITY);
  page.cleanup();
  return { mimeType: "image/jpeg", data: dataUrl.slice(dataUrl.indexOf(",") + 1) };
}

/** Renders a window of pages, stopping once the request-size budget is reached. */
async function renderWindow(
  doc: PDFDocumentProxy,
  fromPage: number,
  maxPages: number,
  onProgress?: (progress: CyberDTPdfProgress) => void,
  endPage?: number,
): Promise<{ images: CyberDTPdfImage[]; fromPage: number; toPage: number }> {
  const images: CyberDTPdfImage[] = [];
  let totalChars = 0;
  let toPage = fromPage - 1;
  const last = Math.min(doc.numPages, endPage ?? fromPage + maxPages - 1);

  for (let page = fromPage; page <= last; page++) {
    onProgress?.({ phase: "rendering", page, pageCount: doc.numPages });
    const image = await renderPage(doc, page);
    if (!image) continue;
    if (images.length > 0 && totalChars + image.data.length > MAX_IMAGE_BASE64_CHARS) break;
    images.push(image);
    totalChars += image.data.length;
    toPage = page;
  }

  return { images, fromPage, toPage };
}

/**
 * Reads a picked PDF and decides how it will be sent to the AI.
 * Throws a friendly Error when the file is not a usable PDF.
 */
export async function analyzeCyberDTPdf(
  file: File,
  onProgress?: (progress: CyberDTPdfProgress) => void,
): Promise<CyberDTPdfSource> {
  const name = file.name || "document.pdf";
  const size = file.size;
  if (!/pdf/i.test(file.type) && !/\.pdf$/i.test(name)) {
    throw new Error("Please choose a PDF file.");
  }

  // Small enough to send whole — the AI reads it natively, scans included.
  if (size <= INLINE_MAX_BYTES) {
    const base64 = await readAsBase64(file);
    if (!base64) throw new Error("Could not read that PDF.");
    return { kind: "inline", name, size, pageCount: 0, base64 };
  }

  onProgress?.({ phase: "reading" });
  const doc = await openPdf(file);
  const pageCount = doc.numPages;

  // A text layer means the document is digital: send the text (tiny, fast).
  const pages: string[] = [];
  let total = 0;
  for (let page = 1; page <= pageCount; page++) {
    onProgress?.({ phase: "text", page, pageCount });
    const text = await pageText(doc, page);
    pages.push(text);
    total += text.length;
    if (total > MAX_TEXT_CHARS * 1.15) break;
  }

  if (total >= TEXT_MIN_CHARS) {
    let text = "";
    let truncated = false;
    for (let i = 0; i < pages.length; i++) {
      if (!pages[i]) continue;
      const chunk = `[Page ${i + 1}]\n${pages[i]}`;
      if (text.length + chunk.length > MAX_TEXT_CHARS) {
        truncated = true;
        break;
      }
      text += (text ? "\n\n" : "") + chunk;
    }
    if (text) {
      void doc.destroy();
      return { kind: "text", name, size, pageCount, text, truncated };
    }
  }

  // No usable text layer: it is a scan. Render the pages to images.
  const rendered = await renderWindow(doc, 1, MAX_SCAN_PAGES, onProgress);
  void doc.destroy();
  if (rendered.images.length === 0) {
    throw new Error("Could not read any page from that PDF. Please try another file.");
  }
  return { kind: "images", name, size, pageCount, ...rendered };
}

/** Re-renders a scanned PDF from a different starting page. */
export async function renderCyberDTPdfFromPage(
  file: File,
  fromPage: number,
  onProgress?: (progress: CyberDTPdfProgress) => void,
): Promise<{ images: CyberDTPdfImage[]; fromPage: number; toPage: number }> {
  const doc = await openPdf(file);
  const start = Math.max(1, Math.min(fromPage, doc.numPages));
  const rendered = await renderWindow(doc, start, MAX_SCAN_PAGES, onProgress);
  void doc.destroy();
  return rendered;
}

/**
 * Renders an explicit page range [fromPage, toPage] to images, honouring the
 * same per-request size budget. Used by the batched "generate the full note"
 * flow: a long scan is split into several small ranges so each request stays
 * fast and never overloads the free-tier quota.
 */
export async function renderCyberDTPdfRange(
  file: File,
  fromPage: number,
  toPage: number,
  onProgress?: (progress: CyberDTPdfProgress) => void,
): Promise<{ images: CyberDTPdfImage[]; fromPage: number; toPage: number }> {
  const doc = await openPdf(file);
  const start = Math.max(1, Math.min(fromPage, doc.numPages));
  const end = Math.max(start, Math.min(toPage, doc.numPages));
  const rendered = await renderWindow(doc, start, MAX_SCAN_PAGES, onProgress, end);
  void doc.destroy();
  return rendered;
}

/** Largest number of pages one action can read from a scan. */
export const CYBER_DT_MAX_SCAN_PAGES = MAX_SCAN_PAGES;
