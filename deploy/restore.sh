#!/usr/bin/env bash
# Restaure la base de production depuis une sauvegarde de backup.sh (voir MISE-A-JOUR.md).
# Tout ce qui a été joué ou modifié depuis cette sauvegarde est PERDU.
#
# Usage : deploy/restore.sh <fichier.sql.gz>
set -euo pipefail

main() {
  cd "$(dirname "$0")/.."
  local file=${1:-}
  if [ -z "$file" ] || [ ! -f "$file" ]; then
    echo "Usage : $0 <fichier.sql.gz>   (sauvegardes : /var/backups/poke-collect)" >&2
    exit 1
  fi
  local compose="docker compose -f docker-compose.prod.yml"

  echo "La base va être remplacée par : $file"
  echo "Tout ce qui s'est passé depuis cette sauvegarde sera perdu."
  read -r -p "Tape RESTAURER pour confirmer : " answer
  [ "$answer" = RESTAURER ] || {
    echo "Annulé."
    exit 1
  }

  echo "Sauvegarde de l'état actuel, au cas où…"
  deploy/backup.sh deploy

  echo "Arrêt de l'API (plus personne n'écrit dans la base)…"
  $compose stop api
  gunzip -c "$file" | $compose exec -T postgres psql -U poke -d poke_collect -q -v ON_ERROR_STOP=1
  echo "Redémarrage de l'API…"
  $compose start api
  echo "Base restaurée depuis $file."
}

main "$@"
