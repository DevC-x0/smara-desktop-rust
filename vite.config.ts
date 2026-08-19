import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  clearScreen: false,
  resolve: {
    alias: [
      {
        find: /^dompurify$/,
        replacement: path.resolve(__dirname, 'src/dompurify-shim.ts'),
      },
    ],
  },
  server: {
    port: 1420,
    strictPort: true,
    host: '127.0.0.1',
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: 'esnext',
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes('node_modules/mermaid') ||
            id.includes('node_modules/cytoscape') ||
            id.includes('node_modules/d3') ||
            id.includes('node_modules/dagre') ||
            id.includes('node_modules/cose-bilkent') ||
            id.includes('node_modules/katex')
          ) {
            return 'vendor-mermaid-engine';
          }
        },
      },
    },
  },
  test: {
    exclude: ['e2e/**', 'node_modules/**', 'dist/**', 'src-tauri/**'],
  },
});
