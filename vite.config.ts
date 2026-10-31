import { defineConfig } from 'vite';
export default defineConfig({
  // Relative assets work at / as well as /<repository>/; there are no history routes.
  base: './',
  build: { target: 'es2022', rollupOptions: { output: { manualChunks: (id) => id.includes('node_modules') && id.includes('three') ? 'three' : undefined } } },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
