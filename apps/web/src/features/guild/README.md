# Guilde

Onglet « Guilde » : sa guilde (membres et rôles, quêtes du jour et de la semaine, coffres,
discussion), ou la recherche et la création d'une guilde ; la fiche d'une autre guilde
(`#guild/<id>`).

## Fichiers

- `GuildPage.tsx` : tout l'onglet.

## Données

`useGuild`, `useGuildProfile`, `fetchGuildMessages` (discussion, rafraîchie tant qu'elle est
affichée).

## Actions

- `createGuild`, `updateGuild`, `joinGuild`, `leaveGuild`, `answerGuildRequest`,
  `cancelGuildRequest`, `kickGuildMember`, `setGuildMemberRole`, `postGuildMessage`,
  `deleteGuildMessage`, `searchGuilds` ; elles passent par `useGuildAction`.
