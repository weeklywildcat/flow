import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// The dashboard is served by the Worker at /library/manage, so the build lands in the
// static assets directory under that same path.
export default defineConfig({
  root: import.meta.dirname,
  base: "/library/manage/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
    },
  },
  build: {
    outDir: resolve(import.meta.dirname, "../dist/client/library/manage"),
    emptyOutDir: true,
    // Fonts ship as files so the Content-Security-Policy can stay at font-src 'self'.
    assetsInlineLimit: 0,
    // React, Base UI and the icon set make up most of the shell; it is cached immutably.
    chunkSizeWarningLimit: 800,
  },
})
