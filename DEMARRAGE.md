# Lancer Poké Collect en local : le guide pas à pas

Ce guide explique comment démarrer le projet sur ton ordinateur, ce que fait chaque morceau, et
quoi faire quand quelque chose ne marche pas.

---

## 1. Les morceaux du projet

Quand tu lances le projet, **trois programmes** tournent en même temps, plus une base de données :

| Morceau       | Adresse                | À quoi ça sert                                                                                                                    |
| ------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **API**       | http://localhost:3000  | Le « cerveau » : comptes, règles du jeu, sauvegarde. Le jeu et l'admin lui posent toutes leurs questions.                         |
| **Jeu**       | http://localhost:5173  | Le site que voient les joueurs.                                                                                                   |
| **Admin**     | http://localhost:5174  | Le panneau d'administration (zones, objets, équilibrage…).                                                                        |
| **Base (DB)** | dossier `.data/pglite` | Toutes les données (comptes, Pokémon, contenu). C'est **PGlite** : un vrai Postgres qui tourne _dans_ l'API, sans rien installer. |

Le jeu et l'admin ne parlent **jamais** directement à la base : ils passent toujours par l'API.
Donc **si l'API ne tourne pas, rien ne marche**. C'est le message « Impossible de joindre le
serveur. L'API est-elle lancée ? ».

> Pas besoin de Docker : la base PGlite est créée et mise à jour automatiquement par l'API au
> démarrage.

---

## 2. Première installation (une seule fois)

Prérequis : **Node.js 22 ou plus** et **pnpm 10**. Pour vérifier qu'ils sont installés :

```sh
node -v     # doit afficher v22… ou plus
pnpm -v     # doit afficher 10…
```

Si `pnpm` n'existe pas : `npm i -g pnpm`.

Puis, dans le dossier du projet :

```sh
pnpm install
```

Cette commande télécharge toutes les bibliothèques du projet dans `node_modules`. À relancer
seulement si quelqu'un a ajouté une dépendance (par exemple après une phase du plan).

**Le fichier `.env` (optionnel en local).** Il contient les réglages (port, secret de connexion…).
Sans lui, des valeurs par défaut pour le développement sont utilisées. Pour le créer :

```sh
cp .env.example .env
```

---

## 3. Lancer le projet (à chaque fois)

Une seule commande, dans **un seul** terminal :

```sh
pnpm dev
```

Elle démarre l'API, le jeu et l'admin ensemble. Attends quelques secondes : quand tu vois passer
`Server listening at http://127.0.0.1:3000` et les deux adresses `localhost:5173` et
`localhost:5174`, tout est prêt.

- Le jeu : http://localhost:5173
- L'admin : http://localhost:5174

**Ce qui se passe au démarrage de l'API :**

1. Elle ouvre la base dans `.data/pglite` (et la crée si elle n'existe pas).
2. Elle applique les **migrations** : les mises à jour de la structure de la base (nouvelles
   tables, nouvelles colonnes). Rien à faire de ton côté.
3. Si la base est toute neuve, elle importe le **contenu de test** (Kanto, 4 zones, objets de
   base) et le publie.

Le mode `dev` recharge tout seul quand tu modifies le code : pas besoin de relancer.

### Arrêter proprement

Dans le terminal où tourne `pnpm dev` : **Ctrl + C**.

⚠️ Ne ferme pas juste la fenêtre et ne relance pas `pnpm dev` dans un deuxième terminal : tu
aurais deux copies du projet qui se battent pour la base et les ports (voir la section 6).

---

## 4. Premiers pas après le lancement

### Créer ton compte joueur

1. Va sur http://localhost:5173 et clique sur « Inscription ».
2. Choisis ton nom de dresseur, puis ton starter.

### Devenir administrateur

Le rôle admin ne se donne pas depuis le site : c'est volontaire, pour la sécurité.

1. Crée d'abord ton compte depuis le jeu (étape ci-dessus).
2. **Arrête `pnpm dev` (Ctrl + C)** : PGlite n'accepte qu'un seul programme à la fois sur la base.
3. Lance :
   ```sh
   pnpm admin:promote ton@email.fr
   ```
4. Relance `pnpm dev`, puis connecte-toi sur http://localhost:5174 avec le même compte.

(Pour retirer le rôle : `pnpm admin:promote ton@email.fr --revoke`.)

### Modifier le contenu du jeu (admin)

Le contenu fonctionne comme un document avec brouillon :

1. **Tableau de bord → Créer un brouillon.** Les joueurs ne voient rien tant que ce n'est pas publié.
2. Modifie ce que tu veux (Zones, Objets, Équilibrage…).
3. **Tableau de bord → Publier.** La publication est refusée s'il reste des erreurs de cohérence
   (elles sont listées sur le tableau de bord).

Le bouton **« Charger le contenu de test »** remet le contenu de départ dans un nouveau brouillon.
Il est utile si ta base date d'avant la phase 1 (aucune zone, aucun starter).

---

## 5. Commandes utiles

| Commande                       | Ce qu'elle fait                                                     |
| ------------------------------ | ------------------------------------------------------------------- |
| `pnpm dev`                     | Lance l'API, le jeu et l'admin                                      |
| `pnpm test`                    | Lance tous les tests automatiques (n'utilise pas ta vraie base)     |
| `pnpm admin:promote <email>`   | Donne le rôle admin (arrêter `pnpm dev` avant)                      |
| `pnpm db:migrate`              | Applique les migrations à la main (l'API le fait déjà au démarrage) |
| `pnpm lint` / `pnpm typecheck` | Vérifie la qualité du code                                          |

---

## 6. Problèmes fréquents

### « Impossible de joindre le serveur. L'API est-elle lancée ? »

L'API ne tourne pas, ou elle a planté au démarrage.

1. Regarde le terminal de `pnpm dev` : une erreur en rouge venant de `apps/api` explique pourquoi.
2. Vérifie que tu n'as pas **deux** `pnpm dev` ouverts (voir ci-dessous).
3. Arrête tout (Ctrl + C) et relance `pnpm dev`.

### Le jeu s'ouvre sur 5175 ou 5176 au lieu de 5173 / 5174

Un ancien `pnpm dev` tourne encore et occupe les ports. Ferme-le. Si tu ne retrouves pas sa
fenêtre, ferme tous les processus Node dans PowerShell :

```powershell
Get-Process node | Stop-Process
```

(Attention : cette commande ferme _tous_ les programmes Node de l'ordinateur.) Relance ensuite
`pnpm dev`.

### « PGlite failed to initialize properly »

La base est déjà ouverte par un autre programme (un deuxième `pnpm dev`, ou `admin:promote`
lancé pendant que `pnpm dev` tourne), ou un fichier est bloqué.

1. Arrête tout (voir ci-dessus) et réessaie.
2. Si ça persiste, le coupable est souvent **OneDrive** : le projet est dans un dossier
   synchronisé, et OneDrive peut verrouiller les fichiers de la base pendant qu'il les envoie.
   Solution durable : mettre la base hors de OneDrive en ajoutant dans `.env` :
   ```
   PGLITE_DATA_DIR=C:/poke-collect-data/pglite
   ```
   (La nouvelle base sera vide : il faudra recréer ton compte. Tu peux aussi y copier le
   dossier `.data/pglite` actuel pour garder tes données.)

### Repartir d'une base toute neuve

Arrête `pnpm dev`, supprime (ou renomme) le dossier `.data/pglite`, puis relance `pnpm dev`. Tu
perds les comptes et les Pokémon, mais le contenu de test est réimporté automatiquement.

### Utiliser un « vrai » Postgres (optionnel, avec Docker)

```sh
docker compose up -d
```

Puis, dans `.env` : `DATABASE_URL=postgres://poke:poke@localhost:5432/poke_collect`. Dans ce
cas, PGlite n'est plus utilisé, et plusieurs programmes peuvent se connecter à la base en même
temps (y compris `admin:promote` pendant que `pnpm dev` tourne).
