# Poké Collect — Plan de développement

> Jeu web idle de collection Pokémon : expéditions, combats de dresseurs, élevage, shinies et quêtes légendaires.
> Données issues de [PokéAPI](https://pokeapi.co). Sauvegarde dans le cloud.

---

## 1. Vision du jeu

**Objectif du joueur** : compléter le Pokédex (normal, puis shiny), en construisant une équipe de plus en plus forte grâce à l'élevage pour accéder à des expéditions plus difficiles.

**Rythme visé** : des sessions courtes (2 à 10 min) plusieurs fois par jour, plus des sessions plus longues pour gérer l'élevage et l'optimisation.

**Principe fondateur : le jeu est 100 % configurable via un panneau d'administration.** Le code fournit les *mécaniques* (expéditions, combats de dresseurs, capture, élevage, évolutions, quêtes, progression). Tout le *contenu* et tous les *réglages* (zones, dresseurs, tables de rencontre et de butin, objets, articles de la boutique, quêtes, paliers, taux, durées…) se créent et se modifient dans le panneau d'admin, sans toucher au code. Le contenu créé pendant le développement ne sert qu'à tester : le contenu définitif se crée ensuite dans l'admin. Voir la section 5.

### Boucle principale

```
 Expéditions (idle) ──► Rencontres + ressources (Baies, Pierres, Bonbons, Œufs)
 Combats de dresseurs ──► Argent + objets (ou Pokémon K.O. temporairement)
                                   │
                    Argent ──► Boutique ──► Balls, objets d'élevage, d'évolution…
        ▲                          │
        │                          ▼
 Équipe plus forte  ◄──  Pension / Élevage (IV, natures, talents)
        ▲                          │
        │                          ▼
 Expéditions et dresseurs  ◄──  Évolutions
 plus durs
                                   │
                                   ▼
                      Pokédex ──► paliers de récompenses ──► régions / quêtes légendaires
```

---

## 2. Systèmes de jeu

### 2.1 Pokémon (instance)

Chaque Pokémon possédé est une instance unique avec :

| Attribut | Source / règle |
|---|---|
| Espèce, types, stats de base | PokéAPI `pokemon` / `pokemon-species` |
| Niveau / XP | Courbe selon `growth_rate` de l'espèce |
| IV (6 stats, de 0 à 31) | Aléatoires à la capture, hérités à l'élevage |
| Nature | PokéAPI `nature` (+10 % / −10 % sur une stat) |
| Talent | PokéAPI `ability` (talent caché plus rare) |
| Shiny | Booléen, taux de base très faible |
| Origine | capture / éclosion / quête (traçabilité, anti-triche) |

**Puissance d'expédition (PE)** : un score dérivé des stats réelles (base × IV × nature × niveau). C'est la valeur principale pour remplir les conditions des expéditions et pour résoudre les combats de dresseurs.

**Disponibilité** : un Pokémon est *disponible*, *occupé* (en expédition, en combat ou en pension) ou *K.O.* (après une défaite en combat, jusqu'à une date donnée). Seuls les Pokémon disponibles peuvent être envoyés en expédition, en combat ou en pension.

### 2.2 Expéditions (cœur idle)

- **Zones** : groupées par **région/génération**, puis par **habitat** (`pokemon-habitat` : forêt, grotte, mer, montagne, prairie, ville, terrain accidenté, bord de mer, rare).
  - L'habitat n'existe dans PokéAPI que jusqu'à la Gen III. Pour les Gen IV et suivantes, prévoir un mapping maison (types + couleur + forme), éditable dans le panneau d'admin.
- **Composition** : de 1 à 6 Pokémon par expédition, en nombre limité d'emplacements (que l'on débloque en progressant).
- **Conditions** : PE minimale, et éventuellement des types requis (exemple : « 2 Pokémon Eau » pour une zone sous-marine).
- **Bonus** : affinité de type avec la zone, synergie d'équipe, objets tenus.
- **Durées** : 15 min, 1 h, 4 h, 8 h. Plus c'est long, plus le butin est intéressant, avec des rendements décroissants pour ne pas pénaliser les joueurs qui reviennent souvent.
- **Résultats** : rencontres (espèces de la zone pondérées par `capture_rate`), objets, XP, œufs trouvés (rares).
- **Capture** : automatique selon une probabilité inspirée de la formule officielle (`capture_rate` × qualité de la Ball × bonus). Les échecs comptent pour le **système de pitié**.

### 2.3 Combats de dresseurs

Même principe que les expéditions (envoyer, attendre, récupérer), mais avec un enjeu : on peut perdre.

- **Dresseurs** : créés dans l'admin, rattachés à une région (et éventuellement à une zone ou à une ville). Chaque dresseur a un nom, une classe (Gamin, Montagnard, Champion d'arène…), un sprite, une équipe (espèces + niveaux, éventuellement IV/natures fixés) dont on déduit sa **PE**, une durée de combat, des récompenses et une condition de déblocage.
- **Composition** : de 1 à 6 Pokémon par combat, sur des **emplacements de combat** dédiés (séparés de ceux des expéditions, débloqués avec la progression). Un Pokémon en combat est occupé : il ne peut pas partir en expédition ni aller en pension en même temps.
- **Conditions** (optionnelles) : nombre de Pokémon imposé, niveau maximum, types interdits ou imposés, PE minimale pour pouvoir lancer le combat.
- **Durée** : fixée par dresseur (exemple : 10 min pour un Gamin, 1 h pour un Champion d'arène), avec une valeur par défaut dans l'Équilibrage.
- **Résolution** : au moment de la réclamation, le serveur calcule une **probabilité de victoire** à partir du rapport entre la PE de l'équipe du joueur et celle du dresseur, corrigée par l'**avantage de types** (table des types PokéAPI `type.damage_relations`), puis tire le résultat avec le seed. La courbe (forme, pente, plancher et plafond de probabilité) est paramétrable. Le joueur voit une **estimation des chances** avant de lancer le combat.
- **Victoire** :
  - de l'**argent** (Poké Dollars), montant défini par dresseur ;
  - des **objets** via une table de butin (probabilités, donc « potentiellement ») ;
  - de l'**XP** et du **bonheur** pour les Pokémon engagés (paramétrable, éventuellement nul).
- **Défaite** : aucune récompense (ou une fraction d'XP, paramétrable), et **tous les Pokémon engagés sont K.O.** : inutilisables (expéditions, combats, pension) pendant une durée paramétrable (globale, surchargeable par dresseur). Le statut est calculé paresseusement à partir d'une date `ko_until`, sans tâche planifiée.
  - Plus tard, en option : objets de soin (Potion, Rappel) ou Centre Pokémon payant pour réduire ou annuler le temps de K.O.
- **Rejouabilité** : chaque dresseur est soit **unique** (une seule victoire possible, exemple : Champions d'arène, qui donnent un badge), soit **répétable** avec un temps de recharge après une victoire. Les deux sont paramétrables par dresseur.
- **Progression** : les badges et les victoires contre certains dresseurs peuvent servir de conditions (déblocage de zones, de régions, d'étapes de quête), via les briques de conditions génériques.

### 2.4 Pension et élevage

- Deux parents compatibles (même `egg_group`, ou Métamorph `ditto`) produisent un œuf de l'espèce de base de la mère (`evolution_chain`).
- **Temps d'éclosion** basé sur `hatch_counter` (exemple : `hatch_counter × 2 min`, à équilibrer).
- **Héritage** (inspiré des vrais jeux) :
  - 3 IV hérités des parents par défaut, 5 avec un **Nœud Destin** (`destiny-knot`).
  - La nature est héritée avec une **Pierre Stase** (`everstone`).
  - Le talent caché peut être transmis selon une probabilité.
- **Exclus** : le groupe d'œufs `no-eggs` (légendaires, mythiques, bébés). PokéAPI les identifie directement.
- Nombre de pensions limité, extensible avec la progression.

### 2.5 Évolutions

- On utilise `evolution_chain` et `evolution_details` de PokéAPI (niveau, objet, bonheur, heure, échange, etc.).
- Les conditions sont adaptées au contexte idle :
  - **Niveau** : direct.
  - **Pierre / objet** : objet obtenu en expédition.
  - **Échange** : remplacé par un objet « Câble Link » farmable.
  - **Bonheur** : jauge qui monte avec les expéditions réussies.
  - **Heure du jour** : basée sur l'heure locale du joueur, ou sur un cycle jour/nuit du jeu.
  - Les cas exotiques (Pichu, Larméléon, etc.) se traitent au cas par cas via des surcharges éditables dans le panneau d'admin.

### 2.6 Shinies

- Taux de base : 1/4096 sur chaque rencontre et chaque éclosion.
- Multiplicateurs :
  - **Charme Chroma** : se débloque quand le Pokédex national est complet (normal).
  - **Chaîne de zone** : relancer la même expédition plusieurs fois de suite augmente le taux, avec un plafond.
  - **Élevage** : bonus si les parents ont des « origines » différentes (équivalent de la méthode Masuda, par exemple des régions de capture différentes).
- **Pokédex Shiny** séparé, avec ses propres récompenses cosmétiques.
- Sprites shiny disponibles dans `PokeAPI/sprites`.

### 2.7 Légendaires et mythiques

- **Impossibles à obtenir en expédition classique** et impossibles à élever.
- **Chaînes de quêtes** par légendaire ou par trio. Exemples :
  - *Artikodis* : capturer 20 Pokémon Glace, puis réussir l'expédition « Îles Écume » avec 3 Pokémon Glace de PE ≥ X.
  - *Mewtwo* : compléter 100 % du Pokédex de Kanto, puis l'expédition « Grotte Azurée ».
- Un légendaire obtenu a des IV aléatoires (avec au moins 3 IV parfaits, comme dans les jeux récents).
- **Objets endgame pour le perfectionner** (ils existent dans PokéAPI) :
  - `bottle-cap` (Capsule d'Argent) : met un IV à 31.
  - `gold-bottle-cap` (Capsule d'Or) : met les 6 IV à 31.
  - Aromates (`*-mint`) : changent la nature effective.
  - `ability-capsule` / `ability-patch` : changent le talent ou débloquent le talent caché.
- Ces objets sont aussi utilisables sur n'importe quel Pokémon, mais ils sont très rares (expéditions de haut niveau, quêtes, récompenses de Pokédex).

### 2.8 Progression et rétention

- **Régions** : Kanto au départ. X % du Pokédex régional débloque la région suivante.
- **Paliers du Pokédex** (10 / 25 / 50 / 75 / 100 %) : emplacements d'expédition, de combat, de pension, Balls, zones, dresseurs.
- **Collections thématiques** : « Starters de Kanto », « Les 18 types », « Toutes les évolutions d'Évoli », etc. Elles donnent des bonus permanents.
- **Doublons** : transfert contre des Bonbons de lignée, ou utilisation comme parents d'élevage.
- **Gains hors ligne** : une expédition ou un combat terminé attend simplement d'être récupéré, sans perte.

### 2.9 Boutique

La boutique donne un usage aux Poké Dollars gagnés en combat : on y achète des objets du catalogue (Balls, Baies, objets d'élevage, pierres d'évolution, objets endgame…).

- **Articles** : chaque article de la boutique pointe vers un objet du catalogue, avec un **prix** en Poké Dollars, une **quantité par lot** (exemple : 10 Poké Balls pour 2 000 ₽) et une **catégorie** (onglet : Balls, Soins, Élevage, Évolution, Rare…). Un même objet peut apparaître dans plusieurs articles (exemple : à l'unité et en lot moins cher).
- **Apparition sous conditions** : un article peut avoir une **condition d'apparition**, construite avec les mêmes briques génériques que le reste du jeu (badge obtenu, victoire contre un dresseur, X % du Pokédex d'une région, région débloquée, palier du Pokédex atteint, quête terminée, nombre de Pokémon possédés…). Exemples :
  - Super Ball après le badge Roche, Hyper Ball après le badge Cascade ;
  - Nœud Destin quand le joueur a fait éclore 10 œufs ;
  - Pierres d'évolution quand 25 % du Pokédex de Kanto est complété.
- **Visibilité avant déblocage** (paramétrable par article) : **caché** (l'article n'apparaît qu'une fois la condition remplie) ou **verrouillé** (visible, grisé, avec la condition affichée, pour donner un objectif au joueur).
- **Badge « Nouveau ! »** : quand un article devient disponible, le joueur est notifié (pastille sur le menu Boutique, mise en avant de l'article jusqu'à sa première consultation). Le déblocage est évalué paresseusement à l'ouverture de la boutique, sans tâche planifiée.
- **Limites d'achat** (optionnelles, par article) : stock total par joueur (exemple : une seule Capsule d'Or achetable), ou stock renouvelé par période (par jour, par semaine) calculé à partir des dates d'achat.
- **Disponibilité dans le temps** (optionnelle) : date de début et de fin, pour des articles temporaires (préparation des événements).
- **Achat côté serveur** : `POST /shop/purchase` (article, nombre de lots). Dans une seule transaction, le serveur vérifie la condition d'apparition, la limite d'achat et le solde, débite les Poké Dollars et crédite l'inventaire. Le prix vient toujours du contenu publié, jamais du client.

---

## 3. Stack technique proposée

### Option A (recommandée) : monorepo TypeScript full-stack

| Couche | Choix | Pourquoi |
|---|---|---|
| Monorepo | **pnpm workspaces** (+ Turborepo en option) | Types et logique de jeu partagés entre le front et le back |
| Frontend | **React + Vite + TypeScript** | Écosystème riche, rapide en dev |
| UI | **Tailwind CSS** + shadcn/ui | Itération rapide, rendu propre |
| État client | **TanStack Query** (données serveur) + **Zustand** (état UI) | Cache et synchronisation automatiques avec l'API |
| Animations | **Framer Motion** | Ouverture du butin, éclosions, apparition des shinies : le « juice » |
| Backend | **Node.js + Fastify** (ou **Hono**) | Léger, performant, typé |
| Validation | **Zod** (schémas partagés) | Mêmes schémas des deux côtés |
| ORM | **Drizzle ORM** | SQL explicite, migrations, très bon typage |
| Base de données | **PostgreSQL** | Relationnel adapté (inventaire, instances, quêtes), JSONB si besoin |
| Auth | **Better Auth** (email + OAuth Google/Discord) | Open source, auto-hébergé, s'intègre à Drizzle |
| Tests | **Vitest** (logique de jeu) + **Playwright** (e2e) | La logique de jeu pure se teste très bien |
| Hébergement | Front : **Vercel / Cloudflare Pages**. API : **Railway / Fly.io / Render**. DB : **Neon / Supabase Postgres** | Offres gratuites suffisantes pour démarrer |

### Option B : Supabase « tout-en-un »

- Postgres + Auth + Storage + Edge Functions, avec React en front.
- **+** Beaucoup moins de backend à écrire, auth incluse.
- **−** La logique de jeu côté serveur (anti-triche) part dans des Edge Functions (Deno) ou des fonctions SQL : moins agréable à tester et à faire évoluer, et plus de dépendance au fournisseur.

### Option C : Next.js full-stack

- Front + API routes / Server Actions dans un seul projet.
- **+** Un seul déploiement.
- **−** Moins adapté à une API de jeu pure, et la logique serveur se mélange avec le rendu.

**Recommandation : option A.** Le jeu repose sur beaucoup de logique métier (RNG, élevage, expéditions) qu'il faut exécuter **côté serveur** et tester finement. Un package `game-core` partagé en TypeScript pur est l'idéal pour ça.

---

## 4. Architecture

### 4.1 Structure du monorepo

```
poke-collect/
├── apps/
│   ├── web/              # React + Vite (jeu)
│   ├── admin/            # React + Vite (panneau d'administration)
│   └── api/              # Fastify (routes du jeu + routes /admin protégées)
├── packages/
│   ├── game-core/        # Logique pure : formules, RNG seedé, élevage, expéditions (aucune I/O)
│   ├── data/             # Données statiques générées depuis PokéAPI (JSON) + types
│   ├── content/          # Schémas Zod du contenu configurable (zones, objets, quêtes, réglages…) + contenu de test (seed)
│   ├── db/               # Schéma Drizzle + migrations
│   └── shared/           # Schémas Zod, types d'API
└── scripts/
    └── import-pokeapi/   # Script de build qui aspire PokéAPI → packages/data
```

### 4.2 Données PokéAPI : import statique, pas d'appel en direct

- Un **script d'import** (exécuté une fois, puis à chaque mise à jour) récupère espèces, Pokémon, chaînes d'évolution, groupes d'œufs, natures, objets, habitats et noms FR.
  - L'endpoint **GraphQL** de PokéAPI (beta) permet de tout récupérer en quelques requêtes.
  - Respecter la fair use policy : cache local, pas de requêtes massives répétées.
- Sortie : des **JSON compacts versionnés** dans `packages/data`, utilisés par le front (affichage) et par le back (règles).
- **Sprites** : à partir du dépôt GitHub `PokeAPI/sprites` (normaux, shiny, artworks officiels), servis depuis un CDN (Cloudflare R2, ou le CDN du front).
- Les données PokéAPI sont une **base de référence en lecture seule**. Tout le contenu de gameplay (zones, mapping habitat Gen IV+, quêtes, tables de butin, réglages d'équilibrage, surcharges d'espèces) vit **en base de données** et s'édite dans le panneau d'admin (voir section 5). Le contenu de test créé pendant le développement est un simple *seed* (`packages/content/seed/`), importé en base au premier lancement.

### 4.3 Serveur autoritaire (anti-triche)

- **Le client ne calcule jamais un résultat qui compte.** Il affiche, le serveur décide.
- Expédition :
  1. `POST /expeditions` : le serveur vérifie l'équipe et enregistre `started_at`, `ends_at` et un `seed`.
  2. `POST /expeditions/:id/claim` : si `now >= ends_at`, le serveur calcule le résultat de façon **déterministe** (seed + `game-core`), puis l'applique en base dans une transaction.
- Combat de dresseur : exactement le même schéma (`POST /battles`, puis `POST /battles/:id/claim`). En cas de défaite, la transaction pose `ko_until` sur les Pokémon engagés.
- Même principe pour les éclosions (`hatch_at`) et l'élevage.
- **Évaluation paresseuse** : pas de cron ni de worker au début. Tout se calcule au moment de la réclamation à partir des timestamps, ce qui simplifie énormément l'infrastructure.
- Plus tard, en option : un job planifié pour les notifications push (« ton expédition est finie »).

### 4.4 Modèle de données (première ébauche)

```
users                 id, email, created_at, ...
player_profile        user_id, trainer_name, region_unlocked, currency, settings

pokemon               id, owner_id, species_id, form_id, level, xp,
                      iv_hp, iv_atk, iv_def, iv_spa, iv_spd, iv_spe,
                      nature, nature_override, ability_id, is_shiny, gender,
                      happiness, origin (capture|egg|quest), origin_region,
                      caught_at, locked (favori), ko_until

eggs                  id, owner_id, species_id, parent_a_id, parent_b_id,
                      hatch_at, seed, hatched

daycare_slots         id, owner_id, slot_index, parent_a_id, parent_b_id, started_at

expeditions           id, owner_id, zone_id, slot_index, team (pokemon ids),
                      started_at, ends_at, seed, claimed_at, result (JSONB)

trainer_battles       id, owner_id, trainer_id, slot_index, team (pokemon ids),
                      started_at, ends_at, seed, claimed_at,
                      outcome (win|loss), result (JSONB)

trainer_progress      owner_id, trainer_id, wins, losses, last_win_at

inventory             owner_id, item_id, quantity

pokedex               owner_id, species_id, seen, caught, caught_shiny, first_caught_at

quest_progress        owner_id, quest_id, step, progress (JSONB), completed_at

pity_counters         owner_id, species_id, misses

shop_purchases        id, owner_id, shop_entry_id, lots, total_price,
                      content_version_id, purchased_at
                      (sert aux limites d'achat et à l'historique)

shop_seen             owner_id, shop_entry_id, unlocked_at, seen_at
                      (badge « Nouveau ! » : article débloqué mais pas encore vu)
```

Ajouts liés au panneau d'administration (voir section 5) :

```
users.role            player | admin

content_versions      id, status (draft|published|archived), label, created_by,
                      created_at, published_at

regions, zones, trainers, items, loot_tables, shop_categories,
shop_entries, quests, quest_steps,
dex_milestones, collections, species_overrides, evolution_overrides,
balance_settings      chaque entité est rattachée à une content_version
                      (colonnes typées + JSONB validé par Zod pour les parties flexibles)

admin_audit_log       id, admin_id, action, entity, entity_id, before, after, at
```

Les expéditions, combats, œufs et quêtes en cours enregistrent la `content_version` active à leur démarrage. Ainsi, une modification du contenu ne casse pas une action déjà lancée.

### 4.5 RNG

- Un PRNG seedé (par exemple `mulberry32` ou `xoshiro128**`) dans `game-core`.
- Le seed est généré côté serveur (`crypto.randomInt`) au début de l'action. Le résultat est donc reproductible et vérifiable, ce qui facilite le debug et les tests.

---

## 5. Panneau d'administration

### 5.1 Principe : les mécaniques dans le code, le contenu dans l'admin

- **Aucune valeur de contenu ni d'équilibrage n'est codée en dur.** `game-core` reçoit le contenu et les réglages en paramètre (un objet de configuration chargé depuis la base). Il ne les connaît pas à l'avance.
- Le code définit des **briques génériques** : types de conditions (« posséder N Pokémon de type X », « PE d'équipe ≥ Y », « compléter X % du Pokédex de la région Z »…), types d'effets d'objets (« met un IV à 31 », « change la nature », « déclenche l'évolution »…) et types de récompenses. L'admin **compose** ces briques en leur donnant des paramètres.
- Ajouter un *nouveau type* de condition, d'effet ou de mécanique demande du code. Tout le reste (créer une zone, une quête, un objet, changer un taux) se fait dans l'admin.
- Le contenu que je crée pendant le développement sert à tester les mécaniques. Il reste entièrement modifiable ou supprimable depuis l'admin.

### 5.2 Ce qui est paramétrable (organisation du menu)

| Section | Contenu éditable |
|---|---|
| **Tableau de bord** | Vue d'ensemble : version de contenu publiée, brouillon en cours, alertes de cohérence (zone sans rencontre, quête avec une étape orpheline, article de boutique vers un objet désactivé…) |
| **Équilibrage** | Tous les réglages globaux, groupés par thème : expéditions (emplacements, durées, nombre de rencontres, rendements décroissants), combats (emplacements, durée par défaut, courbe de probabilité de victoire, poids de l'avantage de types, durée de K.O., XP et bonheur gagnés ou perdus), capture (multiplicateurs des Balls, bonus), pitié, shiny (taux de base, Charme Chroma, chaînes, bonus Masuda), élevage (IV hérités, chance de talent caché, formule d'éclosion), XP et bonheur, pensions |
| **Régions** | Ordre, nom, image, espèces incluses, condition de déblocage |
| **Espèces** | Base PokéAPI en lecture seule + surcharges : activer/désactiver, nom FR, habitat (Gen IV+), rareté, élevable ou non, sprites |
| **Évolutions** | Surcharge des conditions PokéAPI (objet qui remplace l'échange, seuil de bonheur, cas exotiques) |
| **Zones d'expédition** | Nom, description, illustration, région, habitat, conditions d'accès (PE min, types requis), durées disponibles, table de rencontres (espèce, poids, niveaux), table de butin, types en affinité, condition de déblocage |
| **Dresseurs** | Nom, classe, sprite, région / zone, équipe (espèces, niveaux, IV/natures optionnels) avec sa PE calculée, durée du combat, conditions d'équipe, argent gagné, table de butin, badge, unique ou répétable (temps de recharge), durée de K.O. surchargée, condition de déblocage |
| **Objets** | Catalogue (objets PokéAPI + objets maison) : nom, icône, description, rareté, catégorie, effet(s) |
| **Tables de butin** | Tables réutilisables (objet, quantité min/max, probabilité), partagées entre zones, dresseurs, quêtes et paliers |
| **Boutique** | Catégories (nom, icône, ordre). Articles : objet vendu, prix, quantité par lot, catégorie, ordre d'affichage, condition d'apparition, visibilité avant déblocage (caché / verrouillé), limite d'achat (totale ou par jour / semaine), dates de disponibilité, activé / désactivé. Aperçu de la boutique telle qu'un joueur la voit selon sa progression (badges, % de Pokédex) |
| **Quêtes** | Chaînes de quêtes, étapes ordonnées, conditions de chaque étape, récompenses (dont les légendaires, avec leurs règles d'IV garantis) |
| **Progression** | Paliers du Pokédex (seuil, récompenses), collections thématiques (liste d'espèces, bonus permanent) |
| **Événements** *(plus tard)* | Périodes, zones temporaires, multiplicateurs (shiny, butin) |
| **Joueurs** | Consultation d'un profil, outils de support (donner un objet, débloquer une quête), tous tracés dans le journal |
| **Versions et journal** | Historique des publications, comparaison, retour arrière, journal des modifications |

### 5.3 Ergonomie : clair et ordonné

- **Navigation latérale** dans l'ordre ci-dessus. Chaque section affiche une liste filtrable et triable, puis une fiche d'édition par élément.
- **Formulaires guidés, jamais de JSON brut à taper** : sélecteurs avec recherche et aperçu (sprite de l'espèce, icône de l'objet, type), champs numériques bornés, unités affichées (min, %, 1/X).
- **Validation en direct** avec les mêmes schémas Zod que le serveur, et des messages d'erreur explicites.
- **Éditeur visuel de conditions et de récompenses** : on choisit un type de condition dans une liste, puis on remplit ses paramètres.
- **Aperçus et simulateurs** : probabilités réelles d'une table de rencontres (en %), simulation de N expéditions dans une zone, probabilité de victoire contre un dresseur selon la PE de l'équipe (courbe affichée), temps d'éclosion calculé, aperçu de la carte telle que le joueur la verra.
- **Intégrité des références** : impossible de supprimer un objet ou une zone utilisé ailleurs sans voir la liste de ses usages. Possibilité de dupliquer un élément pour aller plus vite.
- **Brouillon et publication** : les modifications se font dans un brouillon, qu'on peut tester, puis on les publie en une fois. Chaque publication crée une version, avec retour arrière possible.
- **Import / export JSON** de tout ou partie du contenu (sauvegarde, transfert entre les environnements de dev et de prod).

### 5.4 Technique

- Application `apps/admin` séparée (même stack que le front). Les routes API `/admin/*` sont réservées au rôle `admin`, vérifié **côté serveur**.
- Le serveur garde le contenu publié en cache mémoire et l'invalide à chaque publication.
- Chaque modification est tracée dans `admin_audit_log` (qui, quoi, avant / après).

---

## 6. Roadmap

### Phase 0 : Fondations (≈ 1 à 2 semaines)
- [x] Initialiser le monorepo (pnpm, TS, ESLint, Prettier, Vitest)
- [x] Script d'import PokéAPI → JSON (Gen I d'abord), avec noms FR et sprites
- [x] Schéma DB initial + migrations, Postgres local (Docker)
- [x] Auth (inscription, connexion, session) + création du profil dresseur
- [x] Rôle admin + squelette de `apps/admin` (navigation, authentification, journal)
- [x] Modèle de contenu versionné (brouillon / publié) + chargement du contenu par `game-core`
- [x] CI : lint + tests

### Phase 1 : MVP jouable (Kanto, expéditions)
- [x] Choix d'un starter
- [x] `game-core` : PE, tables de rencontre, formule de capture, pitié
- [x] Expéditions : 3 à 4 zones de Kanto, durées, réclamation des résultats
- [x] Liste des Pokémon (PC), fiche détaillée (stats, IV, nature)
- [x] Pokédex (vus / capturés)
- [x] Inventaire basique (Balls, Baies)
- [x] UI d'ouverture de butin animée
- [x] Admin : Équilibrage, Régions, Espèces, Zones, Objets, Tables de butin (+ simulateur de zone)
- [x] Contenu de test (seed) : Kanto, 3 à 4 zones, objets de base
- **But** : la boucle « envoyer, attendre, ouvrir, capturer » est déjà satisfaisante seule.

### Phase 2 : Élevage
- [x] Pension : compatibilité par groupe d'œufs, héritage des IV et de la nature
- [x] Œufs + éclosion temporisée
- [x] Objets d'élevage (Nœud Destin, Pierre Stase)
- [x] Transfert des doublons contre des Bonbons
- [x] Admin : réglages d'élevage, effets des objets d'élevage

### Phase 3 : Combats de dresseurs
- [x] Disponibilité des Pokémon (occupé / K.O.) gérée de façon commune aux expéditions, combats et pensions
- [x] `game-core` : PE d'un dresseur, avantage de types, probabilité de victoire, résolution seedée
- [x] Combats : lancement, réclamation, récompenses (argent, butin, XP, bonheur), K.O. en cas de défaite
- [x] Monnaie (Poké Dollars) affichée et créditée sur le profil
- [x] Dresseurs uniques / répétables (temps de recharge), badges
- [x] UI : liste des dresseurs, estimation des chances, écran de résultat animé, minuteur de K.O. sur les Pokémon
- [x] Admin : Dresseurs, réglages de combat (+ simulateur de probabilité de victoire)
- [x] Contenu de test (seed) : quelques dresseurs de Kanto et 1 à 2 Champions d'arène
- **But** : un deuxième usage de l'équipe, avec un risque qui donne du poids au choix des Pokémon.

### Phase 4 : Boutique
- [x] `game-core` : évaluation des conditions d'apparition, des limites d'achat (totales et par période) et du prix d'un achat
- [x] Achat côté serveur (`POST /shop/purchase`) : vérification, débit des Poké Dollars, crédit de l'inventaire, historique
- [x] UI : boutique par onglets, articles verrouillés avec leur condition, sélection du nombre de lots, solde affiché, animation d'achat
- [x] Badge « Nouveau ! » quand un article se débloque
- [x] Admin : Boutique (catégories, articles, conditions, limites, dates) + aperçu selon la progression d'un joueur
- [x] Contenu de test (seed) : Poké Balls dès le départ, Super / Hyper Balls débloquées par les badges, quelques objets d'élevage
- **But** : les Poké Dollars ont un usage, et la boutique devient une source de progression qui récompense les badges et le Pokédex.

### Phase 5 : Évolutions et progression
- [x] Évolutions (niveau, pierres, bonheur, objets de remplacement)
- [x] Paliers du Pokédex + collections thématiques
- [x] Déblocage des emplacements (expéditions, combats, pensions)
- [x] Admin : Évolutions (surcharges), Progression (paliers, collections)

### Phase 6 : Shinies
- [ ] Taux shiny + sprites + animation dédiée
- [ ] Chaînes de zone, Charme Chroma, bonus d'élevage
- [ ] Pokédex shiny
- [ ] Admin : réglages shiny

### Phase 7 : Légendaires et endgame
- [ ] Système de quêtes générique (étapes + conditions déclaratives en config)
- [ ] Quêtes des légendaires de Kanto (oiseaux, Mewtwo, Mew)
- [ ] Objets endgame : Capsules d'Argent / d'Or, Aromates, Capsule Talent
- [ ] Expéditions et dresseurs de haut niveau (Conseil 4, Maître)
- [ ] Admin : éditeur de quêtes (étapes, conditions, récompenses)

### Phase 8 : Expansion
- [ ] Régions suivantes (Johto, Hoenn, ...), mapping habitat Gen IV+
- [ ] Formes alternatives / régionales (`varieties`)
- [ ] Notifications (Web Push), mode PWA installable
- [ ] Équilibrage avec la télémétrie (temps de complétion, goulets)

### Plus tard / à étudier
- Social : profils publics, classements Pokédex, échanges entre joueurs (attention à l'économie et à la triche)
- Événements temporaires (zones spéciales, taux shiny boostés), configurables dans l'admin
- Objets de soin / Centre Pokémon pour réduire le temps de K.O.
- Combats contre les équipes d'autres joueurs (asynchrone)

---

## 7. Équilibrage : premiers chiffres à tester

| Paramètre | Valeur de départ |
|---|---|
| Emplacements d'expédition au début | 2 (max 6) |
| Durées d'expédition | 15 min / 1 h / 4 h / 8 h |
| Rencontres par expédition | ~ durée en heures × 3 (min 1) |
| Taux shiny de base | 1/4096 |
| Temps d'éclosion | `hatch_counter` × 2 min (Magicarpe ≈ 10 min, Draco ≈ 80 min) |
| Pitié | +5 % de poids de rencontre par échec, plafond ×3 |
| Pensions au début | 1 (max 4) |
| Emplacements de combat au début | 1 (max 3) |
| Durée d'un combat | 10 min (dresseur classique) à 1 h (Champion d'arène) |
| Probabilité de victoire | 50 % à PE égale, ~90 % à PE ×1,5, ~10 % à PE ×0,67 (sigmoïde sur le rapport des PE), bornée entre 5 % et 95 % |
| Avantage de types | ±10 % sur la PE effective, selon l'efficacité moyenne de l'équipe |
| Durée de K.O. après une défaite | 1 h |
| Temps de recharge d'un dresseur répétable | 4 h |
| Prix en boutique | Poké Ball 200 ₽, Super Ball 600 ₽, Hyper Ball 1 200 ₽, pierre d'évolution 3 000 ₽, Nœud Destin / Pierre Stase 10 000 ₽ |
| Gains d'un combat | ~ 300 ₽ (Gamin) à ~ 3 000 ₽ (Champion d'arène), pour qu'un lot de Balls coûte quelques combats |

Ce sont les valeurs par défaut du contenu de test. Elles sont toutes modifiables dans la section **Équilibrage** du panneau d'admin.

---

## 8. Risques et points d'attention

- **Propriété intellectuelle** : Pokémon appartient à Nintendo / Game Freak / The Pokémon Company. Un projet de fan **non commercial** est toléré de fait, mais peut être retiré. Pas de monétisation, et un disclaimer clair.
- **Données incomplètes dans PokéAPI** : habitat absent après la Gen III, et certaines méthodes d'évolution sont spécifiques aux jeux. Prévoir des surcharges dans le panneau d'admin.
- **Équilibrage idle** : le risque principal est que le jeu soit trop lent (abandon) ou trop rapide (plus rien à faire). D'où la télémétrie dès la phase 1.
- **Triche** : couverte par le serveur autoritaire et les seeds côté serveur.
- **Contenu incohérent** : un contenu entièrement éditable peut casser le jeu (zone vide, quête impossible). D'où la validation stricte, les alertes de cohérence, le brouillon avant publication et le retour arrière.
- **Volume** : plus de 1000 espèces et une grande quantité de sprites. Prévoir le lazy-loading et un CDN.

---

## 9. Questions ouvertes

1. Nom définitif du jeu ?
2. Style visuel : sprites pixel (Gen V animés) ou artworks officiels ?
3. Les expéditions comportent-elles un peu d'interaction active (événements à choix pendant l'expédition), ou sont-elles 100 % idle ?
4. Monnaie du jeu : une seule (Poké Dollars) ou plusieurs (Bonbons par lignée, jetons de quête) ? Les Poké Dollars ont maintenant un usage avec la boutique (section 2.9). Faut-il d'autres dépenses (Centre Pokémon, frais de pension…) ou une revente des objets à la boutique ?
5. Échanges entre joueurs : dès le départ, plus tard, ou jamais ?
6. Panneau d'admin : un seul administrateur, ou plusieurs avec des droits différents (éditeur, relecteur) ?
7. Faut-il pouvoir envoyer ses propres images (zones, objets maison) depuis l'admin ? Cela implique un stockage de fichiers (par exemple Cloudflare R2).
