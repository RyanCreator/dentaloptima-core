import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5175,
  },
  build: {
    target: "es2020",
    sourcemap: false,
    // Chunk vendor deps separately so:
    //   1. First-load JS is smaller (app code-only in the main bundle)
    //   2. Long-cached vendor chunks stay warm across route changes + redeploys
    //   3. Vendor cache hits carry across clients using the same template
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          motion: ["framer-motion"],
          supabase: ["@supabase/supabase-js"],
          forms: ["react-hook-form", "@hookform/resolvers", "zod"],
          icons: ["lucide-react"],
        },
      },
    },
  },
});
