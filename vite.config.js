import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  build: {
    target: 'es2020',
    outDir: 'dist',
    // MapLibre is ~800 kB minified; keep it in its own long-cached chunk.
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      // index.html is the planner app; home.html becomes the home page (see scripts/prerender.mjs).
      input: { app: 'index.html', home: 'home.html' },
      output: { manualChunks: { maplibre: ['maplibre-gl'] } },
    },
  },
  worker: {
    format: 'es',
  },
  server: {
    port: 5173,
    open: true,
  },
});
