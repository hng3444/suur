import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'mobile',
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  build: {
    outDir: '../mobile-dist',
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    port: 4173,
    strictPort: true,
  },
});
