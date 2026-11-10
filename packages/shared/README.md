# `@poke/shared` : le contrat de l'API

Ce que le serveur et les navigateurs s'échangent, défini une seule fois :

- **les entrées** : des schémas Zod (`startExpeditionInputSchema`, `teamInputSchema`…), que la
  route utilise pour valider et dont le type est déduit (`StartExpeditionInput`) ;
- **les réponses** : des types (`PokemonDto`, `ExpeditionsResponse`…), que la route promet et que
  le jeu attend ;
- **les limites communes** : `MAX_TEAMS`, `TEAM_MAX_SIZE`, `TAG_LABEL_MAX`, `TRANSFER_BATCH_MAX`…

Tout est dans `src/index.ts`, rangé par domaine (profil, Pokémon, expéditions, combats, pension,
guildes, admin…).

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
