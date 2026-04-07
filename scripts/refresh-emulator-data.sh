#!/usr/bin/env bash
#
# refresh-emulator-data.sh
#
# Pulls the latest production data and saves it locally in the native Firebase
# Emulator Suite format at ./.emulator, ready to be loaded with
# `firebase emulators:start --import ./.emulator`.
#
# Pipeline:
#   1. Export production Firestore + Auth + Storage to JSON (Admin SDK).
#   2. Boot the emulators in a one-shot session.
#   3. Load the JSON into the running emulators.
#   4. On graceful shutdown, --export-on-exit writes everything to
#      ./.emulator in the native emulator format.
#
# Requires: gcloud auth application-default login (for production access).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

EMULATOR_DATA_DIR="./.emulator"
EXPORT_JSON_DIR="./scripts/production/data"

echo "==> Step 1/2: Exporting production data to JSON..."
# Clear stale exports so collections removed from production no longer linger.
rm -rf "${EXPORT_JSON_DIR}"
node scripts/production/export-from-production.js

echo ""
echo "==> Step 2/2: Loading data into emulators and snapshotting to ${EMULATOR_DATA_DIR}..."
rm -rf "${EMULATOR_DATA_DIR}"

# `emulators:exec` boots the emulators, runs the import script, then exits
# gracefully — which triggers --export-on-exit to write the native snapshot.
firebase emulators:exec \
  --only auth,firestore,storage \
  --export-on-exit="${EMULATOR_DATA_DIR}" \
  "node scripts/production/import-to-emulator.js"

echo ""
echo "✅ Done. Production data snapshot saved to ${EMULATOR_DATA_DIR}"
echo "   Run \`npm run dev\` to start developing against it."
