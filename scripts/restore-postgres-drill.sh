#!/usr/bin/env bash
# Thin wrapper — prefer scripts/restore-postgres-drill.mjs directly.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec node "$ROOT/scripts/restore-postgres-drill.mjs" "$@"
