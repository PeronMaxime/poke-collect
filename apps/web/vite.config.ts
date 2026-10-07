import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Même origine que l'API en dev : les cookies de session fonctionnent sans configuration CORS.
    proxy: { '/api': 'http://127.0.0.1:3000' },
  },
});
