# Pension

Onglet « Pension » : chaque pension accueille deux Pokémon, déposés et retirés un par un ; deux
Pokémon compatibles pondent des œufs, et tous gagnent de l'XP pendant leur séjour. Les œufs se
ramassent dans le sac, se couvent dans la couveuse et y éclosent.

## Fichiers

- `DaycarePage.tsx` : l'onglet (pensions, couveuses, œufs du sac) ; `HatchReveal.tsx` :
  révélation des œufs éclos.
- `DepositDialog.tsx` et `deposit/` : choix d'un parent (`useDepositDialog`, filtres de la
  boîte `boxFilters.ts`).

## Données

`useDaycare` (`/api/daycare`), `useAssistants`, `usePokemon`, `useInventory`.

## Actions

- `setDaycareParent` → `PUT /api/daycare/:slot/parents/:side`, `withdrawDaycareParent`
  (`DELETE`, même route) ;
  `collectEggs` → `POST /api/daycare/:slot/collect` ; `incubateEggs`, `hatchEggs`
  (`/api/eggs/…`), `withdrawEgg` ; transfert des éclos au Professeur (`transferPokemon`).
