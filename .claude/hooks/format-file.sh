#!/usr/bin/env bash
#
# PostToolUse hook: format and auto-fix a single file that Claude just wrote.
#
# Reads the hook payload on stdin, pulls out the touched file path, then runs
# Prettier and (for lintable source files) ESLint --fix on it. Keeping this in
# sync with CI matters: both GitHub Actions workflows run `format:check` and
# `lint:check` as hard gates, so a file that skips this step can fail the build
# for nothing but whitespace.
#
# ESLint uses flat config, which is resolved from the nearest config file to the
# *linted file* — but the App and Functions packages each have their own
# eslint.config.js and there is no root config. So ESLint is invoked from inside
# the owning workspace; files outside App/ and Functions/ get Prettier only.
#
# Always exits 0. A formatter failure must never block Claude's edit.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

payload="$(cat)"
file="$(printf '%s' "$payload" | jq -r '.tool_input.file_path // .tool_response.filePath // empty')"

[ -n "$file" ] || exit 0
[ -f "$file" ] || exit 0

# Normalize to an absolute path and refuse anything outside the repository.
file="$(cd "$(dirname "$file")" && pwd)/$(basename "$file")"
case "$file" in
	"$REPO_ROOT"/*) ;;
	*) exit 0 ;;
esac

rel="${file#"$REPO_ROOT"/}"

case "$rel" in
	node_modules/* | */node_modules/* | .emulator/* | */dist/* | dist/*) exit 0 ;;
esac

cd "$REPO_ROOT" || exit 0

# --ignore-unknown makes Prettier skip file types it has no parser for instead
# of erroring, so this is safe to run over every edited file.
npx --no-install prettier --write --ignore-unknown "$file" >/dev/null 2>&1

case "$rel" in
	App/*) workspace="App" ;;
	Functions/*) workspace="Functions" ;;
	*) exit 0 ;;
esac

case "$file" in
	*.ts | *.tsx | *.js | *.jsx) ;;
	*) exit 0 ;;
esac

cd "$REPO_ROOT/$workspace" || exit 0
npx --no-install eslint --fix "$file" >/dev/null 2>&1

exit 0
