/** Identifiant de la version construite (voir vite.config.ts), « dev » en développement. */
declare const __BUILD_ID__: string;

interface ImportMetaEnv {
  /** URL du panneau d'administration (lien affiché aux admins). */
  readonly VITE_ADMIN_URL?: string;
}
