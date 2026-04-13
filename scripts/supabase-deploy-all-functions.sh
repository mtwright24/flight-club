#!/usr/bin/env bash
# Deploy every Edge Function in supabase/functions/ (except _shared) to the linked project.
set -euo pipefail
cd "$(dirname "$0")/.."
for name in import-schedule-ocr flight-tracker inbound-aircraft airport-board flight-search \
  save-tracked-flight sync-schedule-flight process-expo-push-receipts flight-status grant-entitlement; do
  echo "=== Deploying $name ==="
  npx supabase functions deploy "$name" --yes
done
echo "Done. Dashboard: https://supabase.com/dashboard/project/$(cat supabase/.temp/project-ref 2>/dev/null || echo LINKED_REF)/functions"
