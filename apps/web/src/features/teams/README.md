# Équipes enregistrées

Onglet « Équipe Pkmn » : les équipes enregistrées du joueur, reprises d'un clic dans les fenêtres
de départ (un Pokémon n'appartient qu'à une équipe).

## Fichiers

- `TeamsPage.tsx`, `useTeamsPage.ts` : l'onglet.

## Données

`useTeams`, `usePokemon`.

## Actions

- `saveTeam` → `POST /api/teams` ou `PUT /api/teams/:id` ; `deleteTeam`.
