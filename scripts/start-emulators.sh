#!/usr/bin/env bash
#
# start-emulators.sh
#
# Boots the Firebase Emulator Suite, importing the local snapshot at
# ./.emulator when one exists.
#
# `firebase emulators:start --import <dir>` is a hard error when <dir> has no
# firebase-export-metadata.json, and .emulator is gitignored (it can hold a
# clone of production). A fresh clone therefore has no snapshot, so importing
# unconditionally means `npm run dev` fails on a new machine. This wrapper
# imports when there is something to import and starts clean otherwise, always
# exporting on exit so the next run picks up where this one left off.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

EMULATOR_DATA_DIR="./.emulator"

if [ -f "${EMULATOR_DATA_DIR}/firebase-export-metadata.json" ]; then
	echo "==> Importing emulator snapshot from ${EMULATOR_DATA_DIR}"
	exec firebase emulators:start \
		--import "${EMULATOR_DATA_DIR}" \
		--export-on-exit "${EMULATOR_DATA_DIR}"
fi

echo "==> No emulator snapshot at ${EMULATOR_DATA_DIR}; starting with empty data."
echo "    Populate it from another terminal with:  npm run seed"
echo "    (or clone production data with:          npm run data:refresh)"
exec firebase emulators:start --export-on-exit "${EMULATOR_DATA_DIR}"
