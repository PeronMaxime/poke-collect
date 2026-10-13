# E-mails « Mot de passe oublié ? » : ce qu'il reste à faire

Le code est prêt et déjà en production : l'API envoie le lien de réinitialisation (valable 1 h,
à usage unique) dès que `SMTP_URL` est rempli. Tant qu'il est vide, le lien « Mot de passe
oublié ? » est masqué dans le jeu. Il ne reste que de la configuration sur le serveur.

## 1. Vérifier la boîte OVH

- [ ] Se connecter au webmail OVH avec l'adresse (ex. `contact@dexpedition.fr`) et son mot de
      passe : si ça marche, ce sont les bons identifiants SMTP.
- [ ] Noter l'adresse exacte et le mot de passe de la boîte.

## 2. Préparer la valeur de `SMTP_URL`

Forme attendue :

```
smtps://ADRESSE_ENCODEE:MOT_DE_PASSE_ENCODE@ssl0.ovh.net:465
```

- Dans l'adresse, le `@` devient `%40` : `contact%40dexpedition.fr`.
- Dans le mot de passe, encoder les caractères spéciaux : `@` → `%40`, `:` → `%3A`,
  `/` → `%2F`, `#` → `%23`, `?` → `%3F`, `%` → `%25`, espace → `%20`.

Pour éviter les erreurs, faire l'encodage sur le VPS (remplacer `MOTDEPASSE`, guillemets simples
conservés) :

```bash
python3 -c "import urllib.parse; print(urllib.parse.quote('MOTDEPASSE', safe=''))"
```

## 3. Remplir le `.env` du serveur

```bash
ssh ubuntu@144.217.14.148
cd ~/poke-collect
nano .env
```

Renseigner les deux lignes (déjà présentes, vides) :

```env
SMTP_URL=smtps://contact%40dexpedition.fr:MOT_DE_PASSE_ENCODE@ssl0.ovh.net:465
MAIL_FROM=Dexpedition <contact@dexpedition.fr>
```

⚠️ `MAIL_FROM` doit être **exactement la même adresse** que l'identifiant SMTP, sinon OVH refuse
l'envoi.

Pas de DNS à toucher : OVH gère déjà le SPF du domaine pour ses boîtes.

## 4. Relancer l'API

Un `restart` ne relit pas le `.env` : il faut recréer le conteneur.

```bash
docker compose -f docker-compose.prod.yml up -d api
```

## 5. Tester

- [ ] Sur https://dexpedition.fr, se déconnecter : le lien « Mot de passe oublié ? » doit
      maintenant apparaître.
- [ ] Demander un lien pour son propre compte.
- [ ] Vérifier la réception (et le dossier spam), ouvrir le lien, choisir un nouveau mot de
      passe, se reconnecter.

Si rien n'arrive :

```bash
docker compose -f docker-compose.prod.yml logs api --tail 50
```

| Message dans les journaux                  | Cause probable                                                    |
| ------------------------------------------ | ----------------------------------------------------------------- |
| `Invalid login` / `535` / `authentication` | mot de passe ou adresse mal encodés dans `SMTP_URL`               |
| `Sender address rejected` / `553`          | `MAIL_FROM` différent de l'adresse de la boîte                    |
| `ETIMEDOUT` / `ECONNREFUSED`               | faute dans `ssl0.ovh.net:465`, ou `smtp://` au lieu de `smtps://` |
| aucun message, lien toujours masqué        | API pas recréée (étape 4) ou `SMTP_URL` vide / mal nommé          |

Si l'e-mail arrive en spam : le marquer « non indésirable » ; ça arrive parfois sur les premiers
envois d'un nouveau domaine.

## 6. Côté dépôt (sur `dev`)

- [ ] Commiter les modifications de doc déjà préparées (`INSTALLATION-SERVEUR.md`,
      `MISE-EN-PRODUCTION.md`, `.env.production.example`, et la politique de confidentialité
      dans `LegalPages.tsx` qui nomme désormais OVH comme service d'envoi).
- [ ] Dans `MISE-EN-PRODUCTION.md`, cocher « Remplir `SMTP_URL` et `MAIL_FROM` sur le serveur »
      et la ligne e-mails du « Reste à faire » ; cocher aussi l'adresse `contact@dexpedition.fr`
      si c'est bien la boîte utilisée.
- [ ] Au prochain passage `dev` → `main`, ajouter dans les nouveautés (`ChangelogPage.tsx`) le
      retour de « Mot de passe oublié ? ».
- [ ] Supprimer ce fichier une fois tout terminé.
