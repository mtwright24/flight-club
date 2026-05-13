#!/usr/bin/env bash
# Loud dev start: clears bad Metro cache, removes CI (Cursor sets CI=1 and breaks Expo),
# enables EXPO_DEBUG so the terminal always prints what Expo is doing.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Flight Club — Expo dev client (verbose)"
echo "  CWD: $ROOT"
echo "  Node: $(node -v 2>/dev/null || echo missing)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "==> [1/2] Clearing Metro file-map disk cache (fixes deserialize errors)..."
node scripts/clear-metro-cache.cjs
echo ""

echo "==> [2/2] Starting Metro + Expo (LAN, --clear, EXPO_DEBUG=1)..."
echo "    If this sits silent >60s, your shell may still have CI=1 — run: unset CI"
echo "    Then open the dev build on your phone (not Expo Go)."
echo ""

unset CI
export EXPO_DEBUG=1
exec npx expo start --dev-client --lan --clear "$@"
