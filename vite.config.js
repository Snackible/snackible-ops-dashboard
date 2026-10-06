import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, forward /api/claude to the deployed Vercel function so the AI panel works locally.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: 'https://snackible-ops-dashboard.vercel.app', changeOrigin: true },
    },
  },
});
