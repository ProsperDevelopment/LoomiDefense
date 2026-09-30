import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  // Deployed under a subpath on GitHub Pages (CI sets VITE_BASE);
  // local dev and default builds stay at '/'.
  base: process.env.VITE_BASE ?? '/',
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 3000,
    host: true, // reachable on the LAN (e.g. 192.168.1.45:3000), not just localhost
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:4000',
        ws: true,
      },
    },
  },
  build: {
    target: 'ES2022',
  },
});
