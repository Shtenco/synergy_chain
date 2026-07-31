#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-SINERGYCHAIN_GROWTH_OS_V7}"
mkdir -p "$ROOT"
tar -xzf source/SINERGYCHAIN_GROWTH_OS_V7_SOURCE.tar.gz -C "$ROOT"
printf 'Source extracted to %s\n' "$ROOT"
printf 'Next: cd %s && npm run check && npm start\n' "$ROOT"
