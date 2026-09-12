import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const repositoryRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.join(repositoryRoot, "demo"),
  base: "/ActionMail/",
  publicDir: path.join(repositoryRoot, "public"),
  plugins: [react()],
  resolve: {
    alias: {
      "@": repositoryRoot,
    },
  },
  build: {
    outDir: path.join(repositoryRoot, "dist-pages"),
    emptyOutDir: true,
  },
});
