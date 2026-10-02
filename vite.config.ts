import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1', port: 5173, strictPort: true,
  },
  preview: { host: '127.0.0.1' },
  build: {
    sourcemap: true,
    manifest: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalized = id.replaceAll('\\', '/');
          if (normalized.includes('/node_modules/leaflet/')) return 'map-engine';
          if (/\/node_modules\/(?:react|react-dom|scheduler)\//.test(normalized)) return 'react-runtime';
        },
      },
    },
  },
});
