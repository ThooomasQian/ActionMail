import assert from "node:assert/strict";
import test from "node:test";

import { resolveClientAssetUrl } from "../lib/client-extraction.ts";

test("resolves client runtime assets from the root base used by Sites", () => {
  assert.equal(
    resolveClientAssetUrl("vendor/tesseract/worker.min.js", "/", "https://example.test/inbox"),
    "https://example.test/vendor/tesseract/worker.min.js",
  );
  assert.equal(
    resolveClientAssetUrl("vendor/pdfjs/cmaps/", "/", "https://example.test/inbox"),
    "https://example.test/vendor/pdfjs/cmaps/",
  );
});

test("resolves client runtime assets from the GitHub Pages project base", () => {
  assert.equal(
    resolveClientAssetUrl("vendor/tesseract/lang", "/ActionMail/", "https://example.test/ActionMail/"),
    "https://example.test/ActionMail/vendor/tesseract/lang",
  );
  assert.equal(
    resolveClientAssetUrl("vendor/pdfjs/wasm/", "/ActionMail/", "https://example.test/ActionMail/"),
    "https://example.test/ActionMail/vendor/pdfjs/wasm/",
  );
});

test("normalizes base and asset slashes without escaping the project base", () => {
  assert.equal(
    resolveClientAssetUrl("/vendor/pdfjs/iccs/", "/ActionMail", "https://example.test/ActionMail/inbox"),
    "https://example.test/ActionMail/vendor/pdfjs/iccs/",
  );
});
