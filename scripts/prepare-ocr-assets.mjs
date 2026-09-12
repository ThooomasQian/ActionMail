import { cp, copyFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, "public", "vendor");

await rm(target, { recursive: true, force: true });
await mkdir(path.join(target, "pdfjs"), { recursive: true });
await copyFile(
  path.join(root, "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs"),
  path.join(target, "pdfjs", "pdf.worker.min.mjs"),
);
for (const folder of ["cmaps", "standard_fonts", "wasm", "iccs"]) {
  await cp(
    path.join(root, "node_modules", "pdfjs-dist", folder),
    path.join(target, "pdfjs", folder),
    { recursive: true },
  );
}

await mkdir(path.join(target, "tesseract", "core"), { recursive: true });
await mkdir(path.join(target, "tesseract", "lang"), { recursive: true });
await copyFile(
  path.join(root, "node_modules", "tesseract.js", "dist", "worker.min.js"),
  path.join(target, "tesseract", "worker.min.js"),
);
for (const filename of [
  "tesseract-core-lstm.wasm.js",
  "tesseract-core-simd-lstm.wasm.js",
  "tesseract-core-relaxedsimd-lstm.wasm.js",
]) {
  await copyFile(
    path.join(root, "node_modules", "tesseract.js-core", filename),
    path.join(target, "tesseract", "core", filename),
  );
}
for (const language of ["eng", "chi_sim"]) {
  await copyFile(
    path.join(root, "node_modules", `@tesseract.js-data/${language}`, "4.0.0_best_int", `${language}.traineddata.gz`),
    path.join(target, "tesseract", "lang", `${language}.traineddata.gz`),
  );
}

console.log("[ActionMail] Prepared same-origin PDF and OCR runtime assets.");
