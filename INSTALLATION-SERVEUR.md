# Installer Poké Collect sur le VPS : le guide pas à pas

Ce guide installe le jeu sur un VPS neuf (OVH VPS-1, Ubuntu 26.04, centre de Beauharnois). Il
se suit **une seule fois**. Pour les mises à jour ensuite, voir [MISE-A-JOUR.md](MISE-A-JOUR.md).

Compte environ une heure. Les commandes sont à taper **sur le serveur** (après `ssh`), sauf
mention « sur ton PC ».

---

## 0. Avant de commencer

- Le **nom de domaine** est acheté (dans ce guide : `mondomaine.fr`, à remplacer partout).
- Une **clé SSH** existe sur ton PC. Sinon, dans PowerShell (sur ton PC) :

  ```powershell
  ssh-keygen -t ed25519
  ```

  Appuie sur Entrée aux questions. La clé publique est dans `C:\Users\<toi>\.ssh\id_ed25519.pub`.

- Le **VPS est commandé** : Ubuntu 26.04 (sinon 24.04), centre de **Beauharnois (BHS)**, et la
  clé publique ci-dessus ajoutée pendant la commande. OVH envoie l'**adresse IP** par e-mail.

---

## 1. DNS : faire pointer le domaine vers le VPS

Dans la zone DNS du domaine (espace client OVH → Noms de domaine → Zone DNS), ajoute :

| Type | Sous-domaine | Cible                    |
| ---- | ------------ | ------------------------ |
| A    | _(vide)_     | IP du VPS                |
| A    | `admin`      | IP du VPS                |
| AAAA | _(vide)_     | IPv6 du VPS (si fournie) |
| AAAA | `admin`      | IPv6 du VPS (si fournie) |

Supprime les anciens enregistrements A/AAAA du domaine nu s'il y en a (page de parking).
La propagation prend de quelques minutes à quelques heures. Vérifier (sur ton PC) :

```powershell
nslookup mondomaine.fr
nslookup admin.mondomaine.fr
```

Les deux doivent répondre l'IP du VPS **avant l'étape 7** (les certificats HTTPS en dépendent).

---

## 2. Première connexion et mises à jour

Sur ton PC :

```powershell
ssh ubuntu@IP_DU_VPS
```

Puis, sur le serveur :

```bash
sudo apt update && sudo apt full-upgrade -y
sudo reboot
```

Reconnecte-toi après une minute. L'utilisateur `ubuntu` n'est pas root (il utilise `sudo`) :
c'est lui qui fera tourner le jeu.

---

## 3. Sécuriser le serveur

**Connexion SSH par clé uniquement**, sans root :

```bash
sudo tee /etc/ssh/sshd_config.d/99-durcissement.conf >/dev/null <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
EOF
sudo systemctl restart ssh
```

⚠️ Garde cette session ouverte et vérifie dans **un autre terminal** que `ssh ubuntu@IP_DU_VPS`
fonctionne encore avant de fermer quoi que ce soit.

**Pare-feu** (SSH, HTTP, HTTPS) :

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
sudo ufw enable
```

Note : Docker contourne `ufw` pour les ports qu'il publie. Ce n'est pas un problème ici : seuls
80 et 443 sont publiés (Caddy), Postgres et l'API restent internes à Docker.

**Mises à jour de sécurité automatiques** :

```bash
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades   # répondre « Oui »
```

Facultatif : redémarrage automatique la nuit quand une mise à jour le demande (le jeu redémarre
tout seul, les conteneurs ont `restart: unless-stopped`) :

```bash
echo 'Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:30";' | sudo tee /etc/apt/apt.conf.d/52reboot
```

---

## 4. Installer Docker

Dépôt officiel de Docker (il gère Ubuntu 26.04) :

```bash
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker ubuntu
```

Déconnecte-toi (`exit`) puis reconnecte-toi, et vérifie :

```bash
docker run --rm hello-world
```

---

## 5. Récupérer le jeu

```bash
git clone https://github.com/PeronMaxime/poke-collect.git ~/poke-collect
cd ~/poke-collect
```

⚠️ Le dépôt est **public** : ne jamais y commiter le fichier `.env` (il est ignoré par Git).

---

## 6. Configurer : le fichier `.env`

```bash
cp .env.production.example .env
chmod 600 .env
nano .env
```

À remplir (le modèle explique chaque ligne) :

| Variable                                 | Valeur                                                  |
| ---------------------------------------- | ------------------------------------------------------- |
| `SITE_DOMAIN`                            | `mondomaine.fr`                                         |
| `ADMIN_DOMAIN`                           | `admin.mondomaine.fr`                                   |
| `ACME_EMAIL`                             | ton adresse (prévenue en cas de souci de certificat)    |
| `POSTGRES_PASSWORD`                      | résultat de `openssl rand -hex 32`                      |
| `BETTER_AUTH_SECRET`                     | un **autre** résultat de `openssl rand -hex 32`         |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | voir ci-dessous                                         |
| `VAPID_SUBJECT`                          | `mailto:` + ton adresse                                 |
| `SMTP_URL` / `MAIL_FROM`                 | quand le service d'e-mails est prêt (vide en attendant) |

Clés VAPID des notifications (pas besoin d'installer Node sur le serveur) :

```bash
docker run --rm node:24-slim npx -y web-push generate-vapid-keys
```

Dans `nano` : Ctrl+O puis Entrée pour enregistrer, Ctrl+X pour quitter.

⚠️ Ne change plus `POSTGRES_PASSWORD` après le premier démarrage : la base est créée avec.
Garde une copie de `.env` dans ton gestionnaire de mots de passe.

---

## 7. Premier démarrage

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

La première construction prend quelques minutes. Ensuite :

```bash
docker compose -f docker-compose.prod.yml ps        # les 3 services « Up », api « healthy »
docker compose -f docker-compose.prod.yml logs api  # « Contenu importé depuis … game-content.json »
docker compose -f docker-compose.prod.yml logs caddy | grep -i certificate   # certificats obtenus
```

Au premier démarrage, l'API crée les tables et importe le contenu de
`content/game-content.json` (Kanto, Johto…).

**Illustrations des Pokémon** (≈ 40 Mo, une seule fois ; quelques minutes) :

```bash
docker compose -f docker-compose.prod.yml run --rm api pnpm -w sprites:download
```

Ouvre `https://mondomaine.fr` : le jeu s'affiche, avec le cadenas HTTPS.

---

## 8. Ton compte administrateur

1. Crée ton compte **dans le jeu** (`https://mondomaine.fr`).
2. Sur le serveur :

   ```bash
   docker compose -f docker-compose.prod.yml exec api pnpm admin:promote ton@adresse.fr
   ```

3. Connecte-toi sur `https://admin.mondomaine.fr`.

---

## 9. Sauvegardes

**Dossier local** :

```bash
sudo mkdir -p /var/backups/poke-collect
sudo chown ubuntu: /var/backups/poke-collect
```

**Copie hors du VPS** (indispensable : un VPS perdu emporte ses sauvegardes) avec `rclone`, vers
OVH Object Storage, Backblaze B2 ou tout stockage compatible S3 :

```bash
sudo apt install -y rclone
rclone config          # « n » (nouveau remote), nom : backup, puis suivre les questions du fournisseur
rclone mkdir backup:poke-collect-backups
```

Puis dans `.env` : `BACKUP_REMOTE=backup:poke-collect-backups`.

**Premier essai** :

```bash
deploy/backup.sh daily
rclone ls backup:poke-collect-backups
```

**Chaque nuit** à 3 h 30 (heure UTC du serveur) : `crontab -e`, puis ajoute la ligne :

```
30 3 * * * /home/ubuntu/poke-collect/deploy/backup.sh daily >> /home/ubuntu/backup.log 2>&1
```

**Tester une restauration, sans toucher à la vraie base** (à faire au moins une fois) :

```bash
F=$(ls -t /var/backups/poke-collect/daily/*.sql.gz | head -1)
C="docker compose -f docker-compose.prod.yml exec -T postgres"
$C createdb -U poke essai_restauration
gunzip -c "$F" | $C psql -U poke -d essai_restauration -q
$C psql -U poke -d essai_restauration -c 'select count(*) as joueurs from player_profiles'
$C dropdb -U poke essai_restauration
```

Le nombre de joueurs affiché doit correspondre à la réalité.

---

## 10. Déploiement automatique (GitHub Actions)

But : chaque push sur `main` dont la CI passe est mis en ligne tout seul. La clé utilisée ne peut
**rien faire d'autre** que lancer `deploy/deploy.sh`.

**Sur le serveur**, une clé dédiée :

```bash
ssh-keygen -t ed25519 -f ~/github-deploy -N "" -C github-deploy
echo "restrict,command=\"/home/ubuntu/poke-collect/deploy/deploy.sh\" $(cat ~/github-deploy.pub)" >> ~/.ssh/authorized_keys
cat ~/github-deploy     # clé PRIVÉE : à copier dans GitHub (ci-dessous)
```

**Sur GitHub** : dépôt → Settings → Secrets and variables → Actions.

| Onglet    | Nom                  | Valeur                                                              |
| --------- | -------------------- | ------------------------------------------------------------------- |
| Secrets   | `DEPLOY_SSH_KEY`     | la clé privée affichée (de `-----BEGIN` à `-----END …-----` inclus) |
| Secrets   | `DEPLOY_HOST`        | IP du VPS                                                           |
| Secrets   | `DEPLOY_USER`        | `ubuntu`                                                            |
| Secrets   | `DEPLOY_KNOWN_HOSTS` | résultat de `ssh-keyscan -t ed25519 IP_DU_VPS` (sur ton PC)         |
| Variables | `DEPLOY_ENABLED`     | `true`                                                              |

Puis, **sur le serveur**, supprime la clé privée (elle n'est plus utile qu'à GitHub) :

```bash
rm ~/github-deploy ~/github-deploy.pub
```

Essai : GitHub → Actions → Déploiement → **Run workflow**. Le journal doit finir par
« Production à jour ».

---

## 11. Supervision

Sur [UptimeRobot](https://uptimerobot.com) (gratuit) : nouveau moniteur **Keyword**, adresse
`https://mondomaine.fr/api/health`, mot-clé `"ok":true`, intervalle 5 minutes, alerte par e-mail.
Tu es prévenu si le jeu ou la base tombe.

---

## C'est en ligne 🎉

- Coche la phase 3 dans [MISE-EN-PRODUCTION.md](MISE-EN-PRODUCTION.md).
- Pour toutes les mises à jour suivantes : [MISE-A-JOUR.md](MISE-A-JOUR.md).
