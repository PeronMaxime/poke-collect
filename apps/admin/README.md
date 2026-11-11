# `@poke/admin` : le panneau d'administration

Même pile que le jeu (React, Vite, Tailwind, TanStack Query), avec React Router. Sert à régler le
**contenu** du jeu et à suivre les joueurs. Réservé au rôle admin, vérifié par le serveur à
chaque requête (`pnpm admin:promote <email>` pour le donner).

Vue d'ensemble : [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md), sections 4 et 9.

## Organisation

```
src/
  main.tsx            Entrée
  routes.tsx          Table des pages (toutes derrière `AdminGate` puis `Layout`)
  sections.ts         Le menu : chemin, libellé, description de chaque page
  lib/
    api.ts            Appel de l'API
    content.ts        Version de travail, enregistrement d'une entité, publication
  components/
    AdminGate.tsx     Connexion et contrôle d'accès (affichage seulement)
    EntityPage.tsx    Modèle d'une page d'entités : liste, fiche, enregistrement ; chargement
    SettingsPage.tsx  Modèle d'une page de réglages de l'équilibrage : en-tête, Annuler, Enregistrer
    forms/            Champs, sélecteurs (espèce, objet, zone…), éditeurs de récompense et de condition
  pages/
    DashboardPage     Versions du contenu, brouillon, publication, alertes de cohérence, import/export
    content/          Une page par entité : équilibrage, régions, espèces, zones, dresseurs, quêtes…
    PlayersPage, TelemetryPage, ApiHealthPage, AuditLogPage
    ExpeditionSimulatorPage, PowerCalculatorPage   Outils d'équilibrage
test/                 Tests de pages (jsdom contre la vraie API en mémoire, compte admin)
```

## Comment une modification arrive aux joueurs

1. Tout se modifie dans un **brouillon**, copie de la version publiée (créé depuis le tableau de
   bord). Les pages lisent et écrivent la « version de travail » (`lib/content.ts`).
2. Chaque enregistrement est validé par le serveur avec les schémas de `@poke/content` et inscrit
   au journal d'admin.
3. Le tableau de bord liste les erreurs et alertes de cohérence du brouillon. **Publier** exige
   qu'il n'y ait aucune erreur, remplace d'un coup le contenu vu par les joueurs et archive
   l'ancienne version.

Les activités déjà lancées se terminent avec le contenu de leur départ.

## Deux modèles de page de contenu

- **Une entité à la fois** (régions, objets, zones, dresseurs, donjons, quêtes, boutique…) :
  `EntityPage` reçoit où lire la liste, la clé, le schéma et la fiche (`renderForm`) ; recherche,
  sélection, validation, alertes, Créer / Enregistrer / Dupliquer / Supprimer sont communs. Une
  fiche longue se découpe en sections qui reçoivent les mêmes props (`EntityFormProps`).
- **Des réglages enregistrés en un bloc** dans l'équilibrage (équilibrage, menu, Sac, bâtiments,
  complétions d'expédition) : la page se monte dans `WithWorkingVersion` avec
  `key={w.version.id}`, tient son brouillon dans un hook (état, `dirty`, validité,
  `useSaveBalance`, gestes `cancel` et `submit`) et s'affiche dans `SettingsPage`.

## Écrans du jeu réutilisés

Le simulateur d'expédition affiche de vrais écrans du jeu par l'alias `@web`
(`apps/web/src`), déclaré dans `vite.config.ts`, `vitest.config.ts` et `tsconfig.json`.

## Tests

```sh
pnpm --filter @poke/admin test
```

`test/pages.test.tsx` affiche chaque page de `sections.ts` pour un administrateur.
