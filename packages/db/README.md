# `@poke/db` : la base de données

Schéma Drizzle, migrations SQL, lecture et écriture du contenu versionné, journal d'admin.

Voir [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md), et « Changer le schéma de la base »
dans [docs/RECETTES.md](../../docs/RECETTES.md).

## Les fichiers

| Fichier                 | Rôle                                                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/client.ts`         | `createDb` : Postgres si `databaseUrl` est donné, sinon PGlite ; délais maximaux                                                                                   |
| `src/schema/auth.ts`    | Comptes et sessions (tables de Better Auth, plus le rôle)                                                                                                          |
| `src/schema/content.ts` | Le contenu versionné : `content_versions` et une table par entité                                                                                                  |
| `src/schema/game.ts`    | L'état des joueurs, réexporté depuis un fichier par domaine : `players`, `pokemon`, `buildings`, `expeditions`, `combats`, `shop`, `progression`, `push`, `guilds` |
| `src/schema/admin.ts`   | Journal des actions d'administration                                                                                                                               |
| `src/content-repo.ts`   | Charger une version, créer un brouillon, enregistrer une entité, publier                                                                                           |
| `src/audit.ts`          | `logAdminAction`                                                                                                                                                   |
| `src/migrate.ts`        | `pnpm db:migrate` (l'API applique aussi les migrations à son démarrage)                                                                                            |
| `drizzle/`              | Les migrations, numérotées, et leur journal (`meta/`)                                                                                                              |

## Le contenu versionné

- `content_versions` : une ligne par version, d'état `draft`, `published` ou `archived`. Une
  seule publiée, au plus un brouillon.
- Chaque table de contenu porte `content_version_id`. Créer un brouillon copie toutes les tables
  de `versionedContentTables` : **une nouvelle table de contenu doit y être ajoutée**.
- `loadContent(db, versionId)` relit tout et le valide avec les schémas de `@poke/content`.
- `publishDraft` exige un contenu sans erreur de cohérence, publie le brouillon et archive
  l'ancienne version.

## Les migrations

- Écrites par `pnpm db:generate` à partir du schéma ; les migrations de données se créent avec
  `drizzle-kit generate --custom`.
- **Jamais modifiées une fois appliquées en production.** Une erreur se corrige par une
  migration suivante.
- Certaines modifient le **contenu** en base (ajout d'une région, d'un réglage). Elles sont
  ciblées, pour ne pas écraser les réglages faits dans l'admin.
- Dossier exclu d'ESLint et de Prettier.

## PGlite

Sans `DATABASE_URL`, la base est un dossier (`.data/pglite`) ouvert par **un seul processus**.
Ne jamais lancer `pnpm db:migrate`, `drizzle-kit studio` ou un script pendant que `pnpm dev`
tourne. `createDb({ pgliteDataDir: 'memory://' })` donne une base éphémère, celle des tests.
