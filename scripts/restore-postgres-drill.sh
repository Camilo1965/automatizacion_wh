#!/usr/bin/env bash
# Restore drill: loads a custom-format pg_dump into a scratch database name.
# Does not replace the live production database unless you point DATABASE_URL there on purpose.
#
# Usage:
#   DUMP=./backups/postgres/camila-20260101T120000Z.dump \
#   DATABASE_URL=postgresql://user:pass@127.0.0.1:5432/postgres \
#   DRILL_DB=camila_restore_drill \
#   ./scripts/restore-postgres-drill.sh
#
# On Windows: scripts/restore-postgres-drill.mjs or Git Bash / WSL.

set -euo pipefail

DUMP="${DUMP:-}"
DATABASE_URL="${DATABASE_URL:-}"
DRILL_DB="${DRILL_DB:-camila_restore_drill_$(date -u +%Y%m%d)}"

if [[ -z "${DUMP}" || ! -f "${DUMP}" ]]; then
  echo "DUMP must point to an existing custom-format dump file" >&2
  exit 1
fi

if [[ -z "${DATABASE_URL}" ]]; then
  echo "DATABASE_URL is required (admin connection, e.g. postgres maintenance DB)" >&2
  exit 1
fi

BASE_URL="${DATABASE_URL%%\?*}"
ADMIN_URL="${BASE_URL%/*}/postgres"

echo "Creating scratch database ${DRILL_DB} (if not exists)..."
psql "${ADMIN_URL}" -v ON_ERROR_STOP=1 -c "SELECT 1 FROM pg_database WHERE datname = '${DRILL_DB}'" | grep -q 1 \
  || psql "${ADMIN_URL}" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"${DRILL_DB}\""

TARGET_URL="${BASE_URL}/${DRILL_DB}"
echo "Restoring into ${DRILL_DB}..."
pg_restore --clean --if-exists --no-owner --no-acl --dbname="${TARGET_URL}" "${DUMP}"

echo "Drill complete. Verify, then drop: psql \"${ADMIN_URL}\" -c \"DROP DATABASE \\\"${DRILL_DB}\\\";\""
