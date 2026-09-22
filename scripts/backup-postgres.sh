#!/usr/bin/env bash
# Thin wrapper — prefer scripts/backup-postgres.mjs directly.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec node "$ROOT/scripts/backup-postgres.mjs" "$@"
