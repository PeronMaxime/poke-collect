#!/usr/bin/env bash
# Sauvegarde de la base de production (voir docs/INSTALLATION-SERVEUR.md et docs/MISE-A-JOUR.md).
#
# Usage : deploy/backup.sh [daily|deploy]
#   daily  (par défaut, lancé chaque nuit par cron) : garde 7 sauvegardes, plus 4 hebdomadaires
#          (celle du dimanche) ;
#   deploy (lancé par deploy.sh avant chaque mise à jour) : garde les 5 dernières.
#
# Fichiers : $BACKUP_DIR (par défaut /var/backups/poke-collect), un dump SQL compressé par
# sauvegarde, en clair pour que restore.sh s'en serve aussitôt (le VPS porte de toute façon la
# base). Copie hors du VPS (une sauvegarde qui n'y reste que sur lui ne protège de rien) : si
# BACKUP_REMOTE est défini dans .env (remote rclone, ex. « backup:poke-collect-backups »), le
# sous-dossier chiffre/ y est recopié. Il contient chaque sauvegarde chiffrée par age pour la clé
# publique BACKUP_AGE_RECIPIENT : la clé privée, seule à pouvoir la lire, n'est jamais sur le VPS
# (coffre de l'exploitant). Sans clé publique, rien n'est envoyé : jamais d'e-mails ni d'empreintes
# de mots de passe en clair chez un hébergeur.
set -euo pipefail

main() {
  cd "$(dirname "$0")/.."
  local kind=${1:-daily}
  local dir=${BACKUP_DIR:-/var/backups/poke-collect}
  local remote recipient
  remote=$(env_value BACKUP_REMOTE)
  recipient=$(env_value BACKUP_AGE_RECIPIENT)

  case "$kind" in
    daily | deploy) ;;
    *)
      echo "Usage : $0 [daily|deploy]" >&2
      exit 1
      ;;
  esac

  mkdir -p "$dir/daily" "$dir/weekly" "$dir/deploy"
  file="$dir/$kind/poke-collect_$(date -u +%Y-%m-%d_%H%M%S).sql.gz"
  # Fichier temporaire supprimé si le dump échoue (jamais de sauvegarde tronquée).
  trap 'rm -f "$file.tmp"' EXIT

  # --clean --if-exists : le fichier remplace entièrement la base à la restauration (restore.sh).
  docker compose -f docker-compose.prod.yml exec -T postgres \
    pg_dump -U poke -d poke_collect --clean --if-exists --no-owner |
    gzip >"$file.tmp"
  mv "$file.tmp" "$file"
  echo "Sauvegarde : $file ($(du -h "$file" | cut -f1))"

  if [ "$kind" = daily ]; then
    if [ "$(date -u +%u)" = 7 ]; then cp "$file" "$dir/weekly/"; fi
    prune "$dir/daily" 7
    prune "$dir/weekly" 4
  else
    prune "$dir/deploy" 5
  fi

  if [ -z "$remote" ]; then
    echo "Attention : BACKUP_REMOTE n'est pas défini, la sauvegarde reste sur le VPS." >&2
  elif [ -z "$recipient" ]; then
    echo "Attention : BACKUP_AGE_RECIPIENT n'est pas défini, rien n'est envoyé hors du VPS"       "(jamais de sauvegarde en clair)." >&2
  else
    encrypt_all "$dir" "$recipient"
    # sync : la copie distante suit exactement chiffre/ (sauvegardes supprimées, anciennes copies
    # en clair d'avant le chiffrement comprises).
    rclone sync "$dir/chiffre" "$remote"
    echo "Copie chiffrée hors du VPS : $remote"
  fi
}

# Valeur de la variable $1 dans .env (vide si absente).
env_value() {
  grep -E "^$1=" .env 2>/dev/null | cut -d= -f2- || true
}

# Tient $1/chiffre/ à l'image des sauvegardes de $1 : chacune chiffrée une fois pour la clé
# publique $2 (fichier .sql.gz.age), celles qui ont disparu de la rotation retirées.
encrypt_all() {
  local dir=$1 recipient=$2 kind file out
  for kind in daily weekly deploy; do
    mkdir -p "$dir/chiffre/$kind"
    for file in "$dir/$kind"/*.sql.gz; do
      [ -e "$file" ] || continue
      out="$dir/chiffre/$kind/$(basename "$file").age"
      [ -e "$out" ] && continue
      rm -f "$out.tmp"
      age --encrypt --recipient "$recipient" --output "$out.tmp" "$file"
      mv "$out.tmp" "$out"
    done
    for out in "$dir/chiffre/$kind"/*.age; do
      [ -e "$out" ] || continue
      [ -e "$dir/$kind/$(basename "$out" .age)" ] || rm -- "$out"
    done
  done
}

# Garde les $2 fichiers les plus récents du dossier $1.
prune() {
  find "$1" -maxdepth 1 -name '*.sql.gz' -printf '%T@ %p\n' | sort -rn | tail -n +$(($2 + 1)) |
    cut -d' ' -f2- | xargs -r rm --
}

main "$@"
