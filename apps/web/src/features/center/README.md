# Centre Pokémon

Onglet du Centre Pokémon : un Pokémon K.O. le reste jusqu'à ses soins ; on le met en soins sur
une place libre (le nombre de places dépend des Centres débloqués), un par un ou d'un coup.

## Fichiers

- `CenterPage.tsx` : places en soins, Pokémon qui attendent.

## Données

`usePokemon` (Pokémon K.O.), `useAssistants`, `usePlayerProgress` (places), `useNow`.

## Actions

- `useHeal` → met en soins ; l'état d'une place se calcule avec `centerState`.
