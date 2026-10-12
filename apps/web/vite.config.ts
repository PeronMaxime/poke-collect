import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Identifiant de la version construite : inscrit dans le code (`__BUILD_ID__`) et publié dans
 * `/version.json`. Le jeu compare les deux pour proposer de recharger après une mise en ligne.
 */
const BUILD_ID = new Date().toISOString();

function versionFile(): Plugin {
  return {
    name: 'dexpedition-version',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ buildId: BUILD_ID }),
      });
    },
  };
}

export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss(), versionFile()],
  // En développement, pas de version : le serveur Vite recharge déjà les modules.
  define: { __BUILD_ID__: JSON.stringify(command === 'build' ? BUILD_ID : 'dev') },
  server: {
    // Même origine que l'API en dev : les cookies de session fonctionnent sans configuration CORS.
    proxy: { '/api': 'http://127.0.0.1:3000' },
  },
}));
