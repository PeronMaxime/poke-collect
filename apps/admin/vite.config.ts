import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Écrans du jeu réutilisés tels quels (simulateur d'expédition).
  resolve: { alias: { '@web': fileURLToPath(new URL('../web/src', import.meta.url)) } },
  server: {
    // Même origine que l'API en dev : les cookies de session fonctionnent sans configuration CORS.
    // Regex : `/api` seul ou `/api/...`, pas la page `/api-health` de l'admin (un préfixe simple la capterait).
    proxy: { '^/api(/|$)': 'http://127.0.0.1:3000' },
  },
});
