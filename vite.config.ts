import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    sourcemap: 'hidden',
  },
  server: {
    fs: {
      // The dev server hands out any file under the project root. Keep the SQLite database
      // (which sits in data/ by default) out of reach, on top of Vite's default deny list.
      deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '*.{db,db-journal,db-wal,db-shm,sqlite,sqlite3}'],
    },
    // HMR is disabled in AI Studio via DISABLE_HMR env var.
    // Do not modify—file watching is disabled to prevent flickering during agent edits.
    hmr: process.env.DISABLE_HMR !== 'true',
    // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
    watch: process.env.DISABLE_HMR === 'true' ? null : {},
  },
});
