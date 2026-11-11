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
  build: {
    rolldownOptions: {
      output: {
        // Deux fichiers à part, dont le nom (tiré du contenu) ne change que si eux-mêmes changent :
        // le navigateur les garde d'une mise en ligne à l'autre, au lieu de tout retélécharger.
        codeSplitting: {
          groups: [
            // Données PokéAPI (espèces, formes, talents…) : régénérées rarement.
            { name: 'data', test: /packages[\\/]data[\\/]/, priority: 20 },
            // Bibliothèques (React, TanStack Query, Motion, Zod, Better Auth).
            { name: 'vendor', test: /node_modules/, priority: 10 },
          ],
        },
      },
    },
  },
  server: {
    // Même origine que l'API en dev : les cookies de session fonctionnent sans configuration CORS.
    proxy: { '/api': 'http://127.0.0.1:3000' },
  },
}));
