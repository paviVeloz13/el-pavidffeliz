import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'renderer-src',
  plugins: [react()],
  base: './',
  build: {
    outDir: '../renderer',
    emptyOutDir: true,
  },
});
