# Glossaire : les mots du jeu et leur nom dans le code

Le jeu parle français, le code anglais. Ce tableau fait le lien : pour chaque notion, ce qu'elle
veut dire, puis où la chercher. Les chemins partent de `packages/` ou de `apps/`.

## Le joueur et ses Pokémon

| En jeu                      | Ce que c'est                                                                                           | Dans le code                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Dresseur                    | Le profil de jeu d'un compte (nom, argent, région de départ)                                           | table `player_profiles`, `PlayerProfileDto`                                     |
| Profil secondaire (bêta)    | Seconde partie rattachée au même compte, sans autre inscription. À retirer après la bêta               | `api/src/beta-profiles.ts`, cookie `dex_profile`                                |
| Starter                     | Premier Pokémon, choisi parmi ceux de la région de départ                                              | `POST /api/starter`, `region.starterSpeciesIds`                                 |
| PE (puissance d'expédition) | Somme des statistiques réelles d'un Pokémon ; la PE d'une équipe ouvre les zones et pèse en combat     | `expeditionPower`, `pokemonPower` (`game-core/pokemon.ts`)                      |
| IV, nature, talent          | Comme dans les jeux d'origine. Un IV « parfait » vaut 31                                               | `PokemonInstance` ; talents : `game-core/abilities.ts`                          |
| Bonheur                     | Monte avec les victoires, baisse avec les défaites ; condition de certaines évolutions                 | `happiness`                                                                     |
| Chromatique (shiny)         | Variante rare. Chances multipliées par la chaîne de zone, le Charme Chroma, les bonus du joueur        | `game-core/shiny.ts`, `ShinyFactors`                                            |
| Forme                       | Variante d'une espèce (régionale, Méga, Gigamax, apparence) : ses types, statistiques et sprites       | `formId`, `data/generated/forms.json`, `game-core/forms.ts`                     |
| Occupé                      | Un Pokémon en expédition, en combat, en pension, en donjon ou assistant ne peut rien faire d'autre     | `PokemonActivity`, `pokemonActivities`, `assertAvailable` (`api/game/store.ts`) |
| K.O. / en soins             | Mis K.O. en combat, il le reste jusqu'à son dépôt au Centre Pokémon, puis il est soigné un temps donné | colonnes `knocked_out`, `heal_until` ; `game-core/center.ts`                    |
| Étiquette (tag)             | Marque de couleur posée par le joueur pour trier son PC                                                | table `pokemon_tags`, `routes/tags.ts`                                          |
| Favori / verrouillé         | Pokémon protégé du transfert                                                                           | `pokemon.locked`                                                                |
| Équipe enregistrée          | Équipe nommée, réutilisable au départ d'une activité ; un Pokémon n'appartient qu'à une équipe         | table `pokemon_teams`, `routes/teams.ts`                                        |
| Pokémon favori (avatar)     | Pokémon affiché comme avatar du dresseur (fiche, classement, guilde)                                   | `displayedFavorite`, `api/game/favorite.ts`                                     |
| Vitrine                     | Jusqu'à 6 Pokémon mis en avant sur la fiche Dresseur                                                   | `featuredPokemon`                                                               |
| Transfert                   | Échanger des Pokémon contre des Bonbons de leur lignée                                                 | `transferCandies`, `POST /api/pokemon/transfer`                                 |
| Bonbons, lignée             | Monnaie d'XP propre à une chaîne d'évolution ; un Super Bonbon donne un niveau entier                  | `lineageId`, `candiesForLevel`, `applyCandies` (`game-core/breeding.ts`)        |
| Transfert automatique       | Règles qui transfèrent d'office certaines captures au retour d'expédition                              | `game-core/auto-transfer.ts`                                                    |

## Expéditions

| En jeu                | Ce que c'est                                                                                                | Dans le code                                                              |
| --------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Expédition            | Une équipe part dans une zone ; rencontres, captures et butin se calculent au retour                        | `game-core/expedition.ts`, `api/game/expeditions.ts`, table `expeditions` |
| Durée libre           | Le joueur arrête quand il veut ; l'intervalle entre deux rencontres s'allonge d'heure en heure              | `expeditionPlan`, `expeditionPace`, `intervalGrowthMinutes`               |
| Zone                  | Lieu d'expédition : rencontres pondérées, butin, PE minimale, types exigés, condition de déblocage          | `Zone` (`content/schemas/`)                                               |
| Affinité              | Un Pokémon dont le type est super efficace contre le type le plus présent de la zone aide à capturer        | `zoneAffinityTypes`, `countAffinity`                                      |
| Plan de Balls         | Quelle Ball lancer selon la rencontre : nouveau, chromatique, déjà capturé, nombre d'IV parfaits            | `BallPlan`, `ballCategory`, `planThrows`                                  |
| Balls au fil de l'eau | Les Balls quittent le sac à mesure des lancers, pas au départ : c'est le rattrapage qui les retire          | `settleExpeditionBalls`, `throws`                                         |
| Pitié                 | Chaque capture ratée d'une espèce augmente son poids de rencontre, jusqu'à un plafond                       | `pityMultiplier`, `balance.pity`                                          |
| Chaîne (chromatique)  | Relancer de suite dans la même zone allonge la chaîne : plus de chromatiques, puis des IV parfaits garantis | `shinyChains`, `chainMultiplier`, `chainPerfectIvs`                       |
| Météo                 | Tirée chaque heure pleine de façon déterministe ; modifie talents et dégâts                                 | `game-core/weather.ts`, `zone.weatherChangeChance`                        |
| Rencontre spéciale    | Forme rare qui n'apparaît que si un Pokémon précis est dans l'équipe                                        | `zone.specialEncounters`, `specialEncountersFor`                          |
| Fuyard                | Légendaire qui change de zone chaque heure après sa quête ; croisé sans être capturé, il fuit ailleurs      | `game-core/roaming.ts`, `QuestPokemon.roaming`, `expeditions.roamers`     |
| Butin                 | Objets tirés d'une table de butin à intervalles réguliers                                                   | `LootTable`, `rollLoot`                                                   |
| Complétion            | Récompense pour avoir capturé tout ce qu'une zone ou une région propose (version chromatique à part)        | `game-core/completion.ts`, `balance.expeditionCompletions`                |

## Combats

| En jeu               | Ce que c'est                                                                                            | Dans le code                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Combat en temps réel | Moteur commun à tous les combats : une simulation rejouable à partir de la graine et des ordres donnés  | `simulateDungeon`, `DungeonSetup`, `DungeonCommand` (`dungeon/`) |
| Combat de dresseur   | Contre l'équipe d'un dresseur ; argent, XP, badge à la première victoire d'un Champion                  | `game-core/battle.ts`, `api/game/battles.ts`, table `battles`    |
| Palier               | Dresseurs répétables placés avant chaque Champion et le Conseil 4, à battre dans l'ordre                | pas de champ dédié : une chaîne de conditions `trainerDefeated`  |
| Dresseur de quête    | Dresseur visible seulement à l'étape de sa quête, battu une seule fois                                  | `trainer.questId`, `isTrainerRevealed`                           |
| Donjon               | Combat contre une suite d'adversaires puis un boss ; récompense les Méga-Gemmes                         | `game-core/dungeon/`, `api/game/dungeons.ts`                     |
| Méga-Évolution       | Au PC, avec une gemme : le Pokémon prend sa forme Méga (une seule Méga par équipe)                      | `game-core/mega.ts`, `megaStone`                                 |
| Combat légendaire    | Lancé depuis une quête ; vaincu, le légendaire peut être capturé avec une Ball, sinon retenté plus tard | `game-core/legendary.ts`, `api/game/legendary.ts`                |
| Commande             | Ordre du joueur pendant un combat : relais ou objet de soin, horodaté                                   | `DungeonCommand`, `healCommand`                                  |

## Bâtiments

| En jeu           | Ce que c'est                                                                                      | Dans le code                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Pension          | Deux Pokémon compatibles y pondent des œufs et gagnent de l'XP ; dépôt et retrait un par un       | `game-core/breeding.ts`, `api/game/daycare.ts`                       |
| Couveuse         | Places où les œufs éclosent ; les œufs en trop attendent dans le sac                              | `EggDto`, `BagEggDto`, `resolveEgg`                                  |
| Méthode Masuda   | Parents de régions d'origine différentes : plus de chances de chromatique                         | `originRegion`, `eggShinyProbability`                                |
| Musée            | Restaure un fossile en Pokémon après un délai                                                     | `game-core/museum.ts`, table `fossil_revivals`                       |
| Centre Pokémon   | Soigne les Pokémon K.O. ; nombre de places limité                                                 | `game-core/center.ts`, `api/game/center.ts`                          |
| Ferme à baies    | Parcelles où planter des baies ; champs de 9 parcelles, parcelles achetables en boutique          | `game-core/farm.ts`, `api/game/farm.ts`                              |
| Assistant, poste | Pokémon affecté à un bâtiment : son talent y agit, pour ce bâtiment seulement                     | `ASSISTANT_POSTS`, `ASSISTANT_POST_PLACES`, `api/game/assistants.ts` |
| Place fermée     | Place de bâtiment perdue (réglage changé) : ce qui s'y trouvait est rendu au joueur au rattrapage | `api/game/closed-places.ts`                                          |
| Widget           | Bâtiment affiché dans la colonne de droite du jeu ; rangement propre à chaque navigateur          | `web/src/lib/widgets.ts`, `BuildingsColumn`                          |

## Progression

| En jeu                 | Ce que c'est                                                                                        | Dans le code                                             |
| ---------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Condition de déblocage | Règle réutilisée partout : % du Pokédex, badges, dresseur battu, quête, espèces capturées, `allOf`… | `unlockConditionSchema`, `game-core/progress.ts`         |
| Avancement du joueur   | Ce que les conditions regardent : Pokédex, dresseurs battus, œufs éclos, quêtes                     | `PlayerProgress`, `playerProgress` (`api/game/store.ts`) |
| Région débloquée       | Une région s'ouvre selon sa condition ; un accès acquis est gardé même si la condition durcit       | `isRegionUnlocked`, table `opened_regions`               |
| Onglet verrouillé      | Onglet du jeu caché (« ??? ») tant que sa condition n'est pas remplie                               | `balance.tabUnlocks`, `isTabUnlocked`                    |
| Bâtiment à débloquer   | Emplacements d'expédition, pensions, couveuses, places… gagnés par paliers                          | `balance.facilityUnlocks`, `game-core/facilities.ts`     |
| Collection             | Ensemble de formes à capturer dans une région, avec récompense                                      | `game-core/progression.ts`, `collections`                |
| Bonus permanent        | Multiplicateurs acquis (capture, XP, argent, chromatique) par les récompenses réclamées             | `PlayerBonuses`, `playerBonuses`, `ClaimedRewards`       |
| Quête                  | Suite d'étapes (conditions ou actions comptées) ; récompense, parfois un légendaire à affronter     | `game-core/quest.ts`, `api/game/quests.ts`               |
| Badge                  | Gagné à la première victoire sur un Champion ; compté par région                                    | `badgeCount`, `content/badge-sprites.ts`                 |
| Guilde                 | Groupe de joueurs : quêtes du jour et de la semaine, coffres Bronze, Argent, Or, messages           | `game-core/guilds.ts`, `api/game/guilds.ts`              |
| Classement             | Par espèces capturées, argent, badges, chromatiques ; et par guilde                                 | `api/game/leaderboard.ts`                                |

## Contenu et technique

| Terme                      | Ce que c'est                                                                        | Dans le code                                                |
| -------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Contenu                    | Tout ce qui se règle dans l'admin, par opposition au code                           | `GameContent` (`content/schemas/`)                          |
| Équilibrage                | Les réglages globaux du contenu (taux, durées, plafonds)                            | `content.balance`, `BalanceSettings`                        |
| Version, brouillon, publié | Le contenu est versionné : un brouillon se prépare, puis se publie d'un coup        | `db/content-repo.ts`, table `content_versions`              |
| Instantané                 | Copie du contenu publié dans Git, point de départ d'une base neuve                  | `content/game-content.json`, `api/src/content-snapshot.ts`  |
| Contenu de test (seed)     | Contenu écrit en TypeScript pour les tests ; **pas** la source de vérité            | `content/src/seed/`                                         |
| Contenu jouable            | Le contenu publié sans ce qui est désactivé (`enabled: false`)                      | `playableContent`, `ContentCache.get()`                     |
| Contexte de jeu            | Le contenu indexé, passé à toutes les règles                                        | `GameContext`, `createGameContext` (`game-core/context.ts`) |
| Graine (seed)              | Nombre tiré au lancement d'une activité, dont tout le hasard découle                | `createRng`, `newSeed`                                      |
| Rattrapage                 | Mise à jour de l'état d'un joueur pour le temps écoulé, faite à sa requête suivante | `PlayerSettler` (`api/game/settle.ts`)                      |
| DTO                        | Forme d'une donnée telle que l'API la renvoie                                       | types `…Dto` et `…Response` de `shared`                     |
| Erreur de jeu              | Refus d'une action, avec un code stable que le jeu traduit                          | `GameError`, `GAME_ERRORS`                                  |
