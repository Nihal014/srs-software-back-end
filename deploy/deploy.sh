#!/usr/bin/env bash
# Run on the server, from the backend folder:  ./deploy/deploy.sh
# Backs up the database first, then pulls, builds, migrates and reloads the API.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> backup before deploy"
bash deploy/backup.sh pre-deploy

echo "==> pull"
git pull --ff-only

echo "==> install + build"
npm ci
npm run build

echo "==> migrate"
npm run migrate

echo "==> reload"
pm2 startOrReload deploy/ecosystem.config.cjs --update-env
pm2 save
echo "done"
