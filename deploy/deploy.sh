#!/usr/bin/env bash
# Met la production à jour (voir MISE-A-JOUR.md) : récupère le code sur GitHub, sauvegarde la
# base, reconstruit les images, redémarre, puis vérifie que l'API répond.
#
# Usage : deploy/deploy.sh [version]
#   sans argument : la dernière version de main sur GitHub ;
#   version       : un commit précis (ex. pour revenir en arrière : deploy/deploy.sh 1f52fc6).
#
# Appelé aussi par le déploiement automatique (GitHub Actions) via une clé SSH limitée à ce
# script : la version arrive alors dans SSH_ORIGINAL_COMMAND et doit être un commit complet.
set -euo pipefail

# Tout est dans des fonctions : bash les lit en entier avant de commencer, donc la mise à jour
# de ce fichier par `git reset` en cours de route ne perturbe pas l'exécution.
main() {
  cd "$(dirname "$0")/.."
  local compose="docker compose -f docker-compose.prod.yml"
  local ref=${1:-origin/main}
  if [ -n "${SSH_ORIGINAL_COMMAND:-}" ]; then
    ref=$SSH_ORIGINAL_COMMAND
    [[ $ref =~ ^[0-9a-f]{40}$ ]] || {
      echo "Version refusée : $ref" >&2
      exit 1
    }
  fi

  git fetch --quiet origin
  local before after
  before=$(git rev-parse --short HEAD)
  after=$(git rev-parse --short "$ref^{commit}")
  echo "Mise à jour : $before → $after"

  echo "1/4 Sauvegarde de la base…"
  deploy/backup.sh deploy

  echo "2/4 Code…"
  git reset --quiet --hard "$after"

  echo "3/4 Construction des images…"
  $compose build --pull

  echo "4/4 Redémarrage (migrations appliquées au démarrage de l'API)…"
  $compose up -d --remove-orphans
  wait_healthy "$compose"

  echo "$(date -u '+%Y-%m-%d %H:%M:%S') $before → $after" >>deploy/.history
  docker image prune -f >/dev/null
  echo "Production à jour : $after. Historique : deploy/.history"
}

# Attend que l'API réponde à /api/health (vérification de docker-compose.prod.yml).
wait_healthy() {
  local id status
  id=$($1 ps -q api)
  for _ in $(seq 1 40); do
    status=$(docker inspect -f '{{.State.Health.Status}}' "$id")
    if [ "$status" = healthy ]; then
      echo "API en bonne santé."
      return 0
    fi
    sleep 3
  done
  echo "L'API ne répond pas après 2 minutes. Dernières lignes du journal :" >&2
  $1 logs --tail 50 api >&2
  echo "Pour revenir en arrière : deploy/deploy.sh <ancienne version> (voir deploy/.history)." >&2
  exit 1
}

main "$@"
