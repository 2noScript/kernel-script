import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import tailwindcss from "@tailwindcss/vite"
import manifest from './manifest.json'
import path from "path"

// https://vite.dev/config/
export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      port: 5173
    },
    cors: true,
  },
  plugins: [
    tailwindcss(),
    react(),
    crx({ manifest })
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    minify: false,
    target: "esnext"
  }
})
