#!/usr/bin/env bash
# Portable Postgres logical backup for Camila production.
#
# Requires: pg_dump on PATH (client tools), network access to the DB.
# On Windows: use scripts/backup-postgres.mjs, Git Bash, or WSL with this script.
#
# [HUMANO] Copy resulting .dump files to an off-server destination on a schedule.

set -euo pipefail

OUT_DIR="${BACKUP_DIR:-./backups/postgres}"
STAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
DATABASE_URL="${DATABASE_URL:-}"

if [[ -z "${DATABASE_URL}" ]]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

mkdir -p "${OUT_DIR}"
OUT_FILE="${OUT_DIR}/camila-${STAMP}.dump"

pg_dump --format=custom --no-owner --no-acl --file="${OUT_FILE}" "${DATABASE_URL}"

echo "Wrote ${OUT_FILE}"
