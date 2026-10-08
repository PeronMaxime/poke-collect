#!/usr/bin/env bash
# Sauvegarde de la base de production (voir INSTALLATION-SERVEUR.md et MISE-A-JOUR.md).
#
# Usage : deploy/backup.sh [daily|deploy]
#   daily  (par défaut, lancé chaque nuit par cron) : garde 7 sauvegardes, plus 4 hebdomadaires
#          (celle du dimanche) ;
#   deploy (lancé par deploy.sh avant chaque mise à jour) : garde les 5 dernières.
#
# Fichiers : $BACKUP_DIR (par défaut /var/backups/poke-collect), un dump SQL compressé par
# sauvegarde. Si BACKUP_REMOTE est défini dans .env (remote rclone, ex. « ovh:poke-backups »),
# le dossier y est recopié : une sauvegarde qui ne reste que sur le VPS ne protège de rien.
set -euo pipefail

main() {
  cd "$(dirname "$0")/.."
  local kind=${1:-daily}
  local dir=${BACKUP_DIR:-/var/backups/poke-collect}
  local remote
  remote=$(grep -E '^BACKUP_REMOTE=' .env 2>/dev/null | cut -d= -f2- || true)

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

  if [ -n "$remote" ]; then
    rclone sync "$dir" "$remote"
    echo "Copie hors du VPS : $remote"
  else
    echo "Attention : BACKUP_REMOTE n'est pas défini, la sauvegarde reste sur le VPS." >&2
  fi
}

# Garde les $2 fichiers les plus récents du dossier $1.
prune() {
  find "$1" -maxdepth 1 -name '*.sql.gz' -printf '%T@ %p\n' | sort -rn | tail -n +$(($2 + 1)) |
    cut -d' ' -f2- | xargs -r rm --
}

main "$@"
