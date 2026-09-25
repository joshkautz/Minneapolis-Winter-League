# Firebase

The app runs on one Firebase project, `minnesota-winter-league`: Auth,
Firestore, Cloud Functions (Gen 2, Node 22, `us-central1`), Cloud Storage and
Hosting.

| Document                                                  | Covers                                                        |
| --------------------------------------------------------- | ------------------------------------------------------------- |
| [Firestore Collections](./FIREBASE_COLLECTIONS_README.md) | The data model: every collection, who writes it, who reads it |
| [Firestore Indexes](./FIRESTORE_INDEXES.md)               | The composite indexes, and deploying and pruning them         |
| [Authentication](./AUTHENTICATION_SYSTEM.md)              | Sign-up, email verification, admins and bans                  |

## The security model

`firestore.rules` denies every client write. Clients read; callable Cloud
Functions running with the Admin SDK do all the writing and check
authorization themselves, with the validators in
`Functions/src/shared/auth.ts`. Admin status is the `admin` boolean on the
player document, not an Auth custom claim. See [SECURITY.md](../SECURITY.md).

Most league data is public to read. The exceptions are a player's Stripe
records and Dropbox Sign history (that player only), their email and waiver
signatures (that player and admins), and a team's payments and open checkouts (that
season's roster and admins). `tests/rules/firestore.test.ts` pins each.

Storage holds public images — team logos and badges — written by Functions
and served by public URL; `storage.rules` denies every client write.

## One environment

There is no staging project. `.firebaserc` names `staging` and `development`
aliases, but those projects do not exist, and `App/.env.staging` points at
production. A pull request's Hosting preview therefore serves new front-end
code against production Firestore, Auth and Functions: exercising it writes
real data. Use the emulators for anything that writes. Standing up a real
staging project is on the [Roadmap](../ROADMAP.md).

The emulators themselves run the Functions against the production project
id, and fetch any secret missing from `Functions/.secret.local` from
production Secret Manager — see
[Environment Variables](../setup/ENVIRONMENT_VARIABLES.md#functions-secrets).
