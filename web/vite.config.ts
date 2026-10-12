import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// Two pages share one build: the librarian dashboard at /library/manage and the
// check-in kiosk at /library/kiosk. Shared chunks land in /library/assets, which is
// outside the Cloudflare Access-protected /library/manage path so the kiosk can load them.
export default defineConfig({
  root: import.meta.dirname,
  base: "/library/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
    },
  },
  build: {
    outDir: resolve(import.meta.dirname, "../dist/client/library"),
    emptyOutDir: true,
    // Fonts ship as files so the Content-Security-Policy can stay at font-src 'self'.
    assetsInlineLimit: 0,
    // React, Base UI and the icon set make up most of the shell; it is cached immutably.
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      input: {
        manage: resolve(import.meta.dirname, "manage/index.html"),
        kiosk: resolve(import.meta.dirname, "kiosk/index.html"),
      },
    },
  },
})
