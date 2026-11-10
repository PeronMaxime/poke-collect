# `@poke/shared` : le contrat de l'API

Ce que le serveur et les navigateurs s'échangent, défini une seule fois :

- **les entrées** : des schémas Zod (`startExpeditionInputSchema`, `teamInputSchema`…), que la
  route utilise pour valider et dont le type est déduit (`StartExpeditionInput`) ;
- **les réponses** : des types (`PokemonDto`, `ExpeditionsResponse`…), que la route promet et que
  le jeu attend ;
- **les limites communes** : `MAX_TEAMS`, `TEAM_MAX_SIZE`, `TAG_LABEL_MAX`, `TRANSFER_BATCH_MAX`… ;
- **les codes d'erreur** : `errors.ts`, le catalogue des refus (`PLAYER_ERROR_CODES`, `ErrorCode`).
  Le serveur ne peut lever que ces codes, et le jeu doit un message à chacun.

Un fichier par domaine dans `src/` (`profile.ts`, `pokemon.ts`, `expeditions.ts`, `battles.ts`,
`daycare.ts`, `guilds.ts`, `admin.ts`…), tous réexportés par `src/index.ts` : on importe toujours
depuis `@poke/shared`. `internal.ts` porte ce que plusieurs fichiers partagent sans l'exporter.

## Conventions

- `…InputSchema` et `…Input` : corps d'une requête.
- `…Dto` : un objet tel que l'API le renvoie (dates en texte ISO, jamais de colonne interne comme
  `ownerId`).
- `…Response` : la réponse entière d'une route.
- `…ErrorBody` : détails joints à certains refus (par exemple, quels Pokémon sont occupés).

Changer un type ici fait échouer la vérification de types à la fois dans l'API et dans le jeu :
c'est le but.

## Ce que ce paquet n'a pas le droit de faire

Importer `@poke/db` (les navigateurs l'importent). Les types de résultats viennent de
`@poke/game-core`, ceux du contenu de `@poke/content`.
