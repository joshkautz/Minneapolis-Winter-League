# Firebase Functions

The Cloud Functions workspace: every write to Firestore goes through here.

- [`docs/functions/README.md`](../docs/functions/README.md) — what exists:
  callables, triggers, scheduled functions, webhooks, services, configuration.
- [`.claude/rules/functions.md`](../.claude/rules/functions.md) — how to write
  one: validators, error codes, retries, batch limits, the two lockfiles.

Run commands from the repository root (`npm run dev`, `npm test`,
`npm run test:integration`); see the root `CLAUDE.md`.
