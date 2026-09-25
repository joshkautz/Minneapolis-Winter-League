---
paths:
  - firestore.rules
  - firestore.indexes.json
  - storage.rules
description: Firestore security rules and index conventions
---

# Firestore rules and indexes

## The posture

Reads are public for league data; **every write is denied**. Writes happen only
through Cloud Functions, which use the Admin SDK and bypass rules entirely.

A new collection therefore needs a rule block only to grant reads:

```
match /thing/{thingId} {
  allow read: if true;
  allow create: if false; // Use createThing callable
  allow update: if false; // Use updateThing callable
  allow delete: if false; // Use deleteThing callable
}
```

Keep the trailing comment naming the callable that owns the write. Name the
function as it is actually exported from `Functions/src/index.ts`.

Per-user private data (`stripe/{uid}`, `dropbox/{uid}`) is gated on
`request.auth.uid == uid` for reads and denied for writes.

`playerContacts/{uid}` holds the player's email, readable by that player and
admins. It is separate because `players/{uid}` is public: never add an email,
or any other contact detail, to the player document.

`players/{uid}/waiverSignatures` holds a date of birth, an address and
emergency contacts, so although the player document above it is public, this
subcollection is readable only by that player and admins. Never add a
collection-group rule for it, and never copy those fields onto a public
document.

A team-season's `contributions` and `checkouts` are readable only by that
season's roster and admins, and deliberately have no collection-group rule, so
no one can list every team's money at once.

`system/maintenance`, the migration kill-switch, is readable by admins and
writable by no client. Setting it stops every trigger; the migration script
flips it with the Admin SDK.

The catch-all `match /{document=**} { allow read, write: if false; }` at the
bottom must stay last.

## Collection groups

A `collectionGroup()` query needs its own recursive block even when the direct
subcollection path is already allowed:

```
match /{path=**}/playerSeasons/{seasonId} {
  allow read: if true;
  allow write: if false;
}
```

Forgetting this is the usual cause of a permission-denied on a query that looks
like it should work.

## Indexes

Composite indexes live in `firestore.indexes.json`. The emulator does not
enforce them, so a query can pass locally and fail in production. When adding a
query with more than one `where`, or a `where` plus an `orderBy` on a different
field, add the index in the same change. `docs/firebase/FIRESTORE_INDEXES.md`
has the details.

## Testing a rules change

Rules are not hot-reloaded — restart the emulators after editing them.

There **is** an automated suite at `tests/rules/firestore.test.ts`, run with
`npm run test:rules` (it boots the Firestore emulator itself) and in CI. Add a
case there for every rules change: a new public collection gets a read test
and a write-denied test; a new collection-group match gets a query test. The
suite is mutation-tested — opening a write in `firestore.rules` makes it fail.
