#!/usr/bin/env bash
#
# seed-emulator.sh
#
# Populates the emulators with synthetic data, in the order the seeders
# require: Auth users first, then Firestore documents built from them.
#
# Run with no emulators running (the default) and it boots a throwaway set via
# `emulators:exec`, seeds them, and writes the result to ./.emulator so the
# next `npm run dev` imports it. Run with --attach against emulators that are
# already up (the usual dev-loop case) and it seeds those in place.
#
# Needs no Firebase credentials and no production access — everything is
# generated locally. Use `npm run data:refresh` instead when you specifically
# need a clone of production.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

EMULATOR_DATA_DIR="./.emulator"

# seed.js accepts --setup-only, --week N and --season NAME; forward them.
ATTACH=false
SEED_ARGS=()
for arg in "$@"; do
	if [ "$arg" = "--attach" ]; then
		ATTACH=true
	else
		SEED_ARGS+=("$arg")
	fi
done

run_seeders() {
	node scripts/generate-accounts.js
	node scripts/seed.js "$@"
}

if [ "$ATTACH" = true ]; then
	echo "==> Seeding the emulators already running on this machine..."
	run_seeders ${SEED_ARGS+"${SEED_ARGS[@]}"}
	echo ""
	echo "Done. The data is live; it is written to ${EMULATOR_DATA_DIR} when those emulators exit."
	exit 0
fi

echo "==> Booting throwaway emulators and seeding them..."
export SEED_ARGS_JOINED="${SEED_ARGS[*]-}"
firebase emulators:exec \
	--only auth,firestore,storage \
	--export-on-exit "${EMULATOR_DATA_DIR}" \
	'node scripts/generate-accounts.js && node scripts/seed.js $SEED_ARGS_JOINED'

echo ""
echo "Done. Snapshot written to ${EMULATOR_DATA_DIR} — run \`npm run dev\` to develop against it."
