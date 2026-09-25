# Authentication

Firebase Auth with email and password. There are no custom claims: who a
user is comes from Auth, and what they may do comes from their player
document.

## Signing up

`features/public/auth/use-signup-form.ts` does three things in order:

1. `createUserWithEmailAndPassword` creates the Auth user.
2. `sendEmailVerification` sends the verification email.
3. `createPlayer` creates `players/{uid}`, and `playerContacts/{uid}` with
   the email, which only the player and admins can read. It checks only that the caller is
   signed in (`validateBasicAuthentication`), because the email cannot be
   verified yet.

Everything else a player does needs a verified email. The shared validator
`validateAuthentication` reads `email_verified` from the ID token, so a user
who has just clicked the link is still refused until their token refreshes.
`AuthContextProvider` polls every ten seconds while the email is unverified
and forces a token refresh the moment it flips, so the app unlocks without a
sign-out.

## Who may do what

Authorization lives in the callables, via `Functions/src/shared/auth.ts`:

| Validator                     | Requires                                        |
| ----------------------------- | ----------------------------------------------- |
| `validateBasicAuthentication` | A signed-in user                                |
| `validateAuthentication`      | A signed-in user with a verified email          |
| `validateAdminUser`           | The above, and `admin: true` on `players/{uid}` |
| `validateNotBanned`           | `banned` is not set on `players/{uid}`          |

`admin` and `banned` are plain fields on the player document, changed only by
`updatePlayerAdmin`. A ban is account-wide rather than per season.

The App hides what a user cannot do — the admin screens, a captain's actions
— but that is presentation. Every callable checks for itself.

## In the App

`providers/auth-context.tsx` holds the Auth user, the player document and the
player's per-season documents for the rest of the app.
`features/public/auth/` has the sign-in, sign-up and password-reset forms,
shown in `AuthModal`, which is a sheet on phones and a dialog elsewhere. The
layout owns whether it is open and hands pages `openAuthModal` through the
router's outlet context. `ProtectedRoute` sends a signed-out visitor from the
player and admin pages back to the home page.

## Deleting an account

A player deletes their own account with `deletePlayer`, which refuses while
they are on a team this season, banned, or the only admin. Deleting the Auth
user from the console fires the `userDeleted` trigger instead. Both run
`services/accountDeletionService`, which removes the player's data but keeps
their waiver signatures, their team contributions and their posts. See the
[Functions reference](../functions/README.md#account-deletion).
