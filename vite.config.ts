import { defineConfig } from 'vitest/config';

export default defineConfig({
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: '127.0.0.1'
  },
  envPrefix: ['VITE_', 'TAURI_'],
  test: {
    exclude: ['e2e/**', 'node_modules/**', 'dist/**', 'src-tauri/**']
  }
});
