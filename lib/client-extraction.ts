"use client";

import type { ExtractionResult } from "./actionmail-types";

export type OcrLanguage = "eng" | "eng+chi_sim";
export type ExtractionProgress = {
  stage: "reading" | "pdf" | "ocr" | "done";
  progress: number;
  detail: string;
};

type ProgressCallback = (progress: ExtractionProgress) => void;

let cachedWorker: Awaited<ReturnType<typeof import("tesseract.js")["createWorker"]>> | null = null;
let cachedLanguage: OcrLanguage | null = null;

async function getOcrWorker(language: OcrLanguage, onProgress: ProgressCallback) {
  if (cachedWorker && cachedLanguage === language) return cachedWorker;
  if (cachedWorker) await cachedWorker.terminate();
  const tesseract = await import("tesseract.js");
  cachedLanguage = language;
  cachedWorker = await tesseract.createWorker(language, tesseract.OEM.LSTM_ONLY, {
    workerPath: new URL("/vendor/tesseract/worker.min.js", window.location.origin).href,
    corePath: new URL("/vendor/tesseract/core", window.location.origin).href,
    langPath: new URL("/vendor/tesseract/lang", window.location.origin).href,
    workerBlobURL: false,
    logger: (message) => {
      if (typeof message.progress === "number") {
        onProgress({ stage: "ocr", progress: message.progress, detail: message.status ?? "Reading image" });
      }
    },
  });
  await cachedWorker.setParameters({
    tessedit_pageseg_mode: tesseract.PSM.AUTO,
    preserve_interword_spaces: "1",
    user_defined_dpi: "192",
  });
  return cachedWorker;
}

async function recognizeImage(image: File | HTMLCanvasElement, language: OcrLanguage, onProgress: ProgressCallback) {
  const worker = await getOcrWorker(language, onProgress);
  const result = await worker.recognize(image);
  return {
    text: result.data.text.trim(),
    confidence: Math.max(0, Math.min(100, Math.round(result.data.confidence))),
  };
}

async function prepareImageForOcr(file: File, onProgress: ProgressCallback) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const longestEdge = Math.max(bitmap.width, bitmap.height);
  if (longestEdge <= 2800) {
    bitmap.close();
    return { source: file as File | HTMLCanvasElement, cleanup: () => undefined };
  }

  onProgress({ stage: "reading", progress: 0.08, detail: "Optimizing a high-resolution scan" });
  const scale = 2800 / longestEdge;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) {
    bitmap.close();
    throw new Error("This browser could not prepare the image for OCR.");
  }
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return {
    source: canvas as File | HTMLCanvasElement,
    cleanup: () => {
      canvas.width = 1;
      canvas.height = 1;
    },
  };
}

async function extractPdf(file: File, language: OcrLanguage, onProgress: ProgressCallback): Promise<ExtractionResult> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("/vendor/pdfjs/pdf.worker.min.mjs", window.location.origin).href;
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    cMapUrl: "/vendor/pdfjs/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: "/vendor/pdfjs/standard_fonts/",
    wasmUrl: "/vendor/pdfjs/wasm/",
    iccUrl: "/vendor/pdfjs/iccs/",
  });

  try {
    const pdf = await loadingTask.promise;
    if (pdf.numPages > 20) throw new Error("PDFs are limited to 20 pages in this version.");
    const pageCount = pdf.numPages;
    const pages: string[] = [];
    const ocrConfidences: number[] = [];
    const scanPages: Array<{ number: number; page: Awaited<ReturnType<typeof pdf.getPage>> }> = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      onProgress({ stage: "pdf", progress: pageNumber / pdf.numPages, detail: `Reading page ${pageNumber} of ${pdf.numPages}` });
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items.map((item) => ("str" in item ? `${item.str}${item.hasEOL ? "\n" : " "}` : "")).join("").trim();
      pages.push(text);
      if (text.replace(/\s/g, "").length < 35) scanPages.push({ number: pageNumber, page });
    }

    if (scanPages.length) {
      for (let index = 0; index < scanPages.length; index += 1) {
        const { number, page } = scanPages[index];
        onProgress({ stage: "ocr", progress: index / scanPages.length, detail: `OCR on scanned page ${number}` });
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = Math.min(2.2, 2500 / Math.max(baseViewport.width, baseViewport.height));
        const viewport = page.getViewport({ scale: Math.max(1.5, scale) });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvas, viewport }).promise;
        const recognized = await recognizeImage(canvas, language, onProgress);
        pages[number - 1] = recognized.text;
        ocrConfidences.push(recognized.confidence);
        canvas.width = 1;
        canvas.height = 1;
      }
    }
    await pdf.destroy();
    return {
      text: pages.join("\n\n").trim(),
      mode: scanPages.length ? "image-ocr" : "pdf-text",
      pageCount,
      ocrConfidence: ocrConfidences.length
        ? Math.round(ocrConfidences.reduce((total, value) => total + value, 0) / ocrConfidences.length)
        : undefined,
    };
  } finally {
    await loadingTask.destroy();
  }
}

export async function extractDocument(
  file: File,
  language: OcrLanguage,
  onProgress: ProgressCallback,
): Promise<ExtractionResult> {
  onProgress({ stage: "reading", progress: 0.03, detail: "Opening document" });
  if (file.size > 12 * 1024 * 1024) throw new Error("Choose a file smaller than 12 MB.");
  const extension = file.name.toLowerCase().split(".").pop() ?? "";
  const mimeType = file.type.toLowerCase();
  if (mimeType === "text/plain" || extension === "txt") {
    const text = (await file.text()).trim();
    onProgress({ stage: "done", progress: 1, detail: "Text ready" });
    return { text, mode: "plain-text" };
  }
  if (mimeType === "application/pdf" || extension === "pdf") {
    const result = await extractPdf(file, language, onProgress);
    onProgress({ stage: "done", progress: 1, detail: "Document ready" });
    return result;
  }
  if (["image/png", "image/jpeg", "image/jpg", "image/webp"].includes(mimeType) || ["png", "jpg", "jpeg", "webp"].includes(extension)) {
    const prepared = await prepareImageForOcr(file, onProgress);
    try {
      const recognized = await recognizeImage(prepared.source, language, onProgress);
      onProgress({ stage: "done", progress: 1, detail: "Image ready" });
      return { text: recognized.text, mode: "image-ocr", pageCount: 1, ocrConfidence: recognized.confidence };
    } finally {
      prepared.cleanup();
    }
  }
  throw new Error("Use a PDF, PNG, JPEG, WebP, or plain-text file.");
}
