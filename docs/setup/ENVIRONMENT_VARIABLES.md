# Environment Variables

The App is configured with Vite env files in `App/`; Functions read Firebase
secrets. Both are covered below.

`App/.env.staging` points at production: there is only one Firebase project.
`App/.env.test` holds a fake Firebase config for Vitest, without which
`App/src/firebase/app.ts` throws at import.

## Vite Environment Variable Loading Priority

When Vite loads environment variables, it follows this order (highest priority first):

### 1. **Command Line Variables** (Highest Priority)

```bash
VITE_USE_EMULATORS=true npm run dev
# This overrides any .env file values
```

### 2. **Mode-Specific Local Files** (.env.[mode].local)

```
.env.development.local    # For development mode (NEVER commit)
.env.production.local     # For production mode (NEVER commit)
.env.staging.local        # For staging mode (NEVER commit)
```

### 3. **Local Override File** (.env.local)

```
.env.local               # Always loaded, overrides mode files (NEVER commit)
```

### 4. **Mode-Specific Files** (.env.[mode])

```
.env.development         # Loaded when --mode development
.env.production          # Loaded when --mode production
.env.staging             # Loaded when --mode staging
```

### 5. **Base Environment File** (.env) (Lowest Priority)

```
.env                     # Default values for all modes
```

## Current Environment Variables

### Firebase Configuration

```bash
VITE_FIREBASE_API_KEY           # Firebase API key
VITE_FIREBASE_AUTH_DOMAIN       # Firebase Auth domain
VITE_FIREBASE_PROJECT_ID        # Firebase project ID
VITE_FIREBASE_STORAGE_BUCKET    # Firebase Storage bucket
VITE_FIREBASE_MESSAGING_SENDER_ID # Firebase messaging sender ID
VITE_FIREBASE_APP_ID            # Firebase app ID
```

### Application Configuration

```bash
VITE_USE_EMULATORS              # Enable Firebase emulators (true/false)
VITE_LOG_LEVEL                  # Logging level (debug/info/warn/error)
```

## Logging Configuration

The `VITE_LOG_LEVEL` variable controls the minimum log level displayed:

- **Development**: `VITE_LOG_LEVEL=debug` (shows all logs)
- **Staging**: `VITE_LOG_LEVEL=warn` (shows warnings and errors)
- **Production**: `VITE_LOG_LEVEL=error` (shows errors only)

### Log Level Hierarchy

```
debug (0) -> info (1) -> warn (2) -> error (3)
```

If an invalid log level is set, the application defaults to `error` level.

## Package.json Script Modes

```json
{
	"scripts": {
		"dev": "vite --mode development", // Loads .env.development
		"build": "tsc && vite build", // Loads .env.production (default)
		"build:staging": "vite build --mode staging", // Loads .env.staging
		"dev:emulators": "VITE_USE_EMULATORS=true vite --mode development"
	}
}
```

## Variable Access Rules

### ✅ Available in Client Code

```typescript
// Only VITE_ prefixed variables are available in browser
import.meta.env.VITE_FIREBASE_API_KEY // ✅ Available
import.meta.env.VITE_USE_EMULATORS // ✅ Available
import.meta.env.VITE_LOG_LEVEL // ✅ Available
import.meta.env.MODE // ✅ Available (built-in)
import.meta.env.DEV // ✅ Available (built-in)
```

### ❌ NOT Available in Client Code

```typescript
// Server-only variables (no VITE_ prefix)
import.meta.env.DATABASE_PASSWORD // ❌ Undefined
import.meta.env.SECRET_KEY // ❌ Undefined
process.env.NODE_ENV // ❌ Undefined (use import.meta.env.MODE)
```

## Security Rules

### Safe to Commit

- `.env`
- `.env.development`
- `.env.production`
- `.env.staging`

### NEVER Commit (add to .gitignore)

- `.env.local`
- `.env.*.local`
- Any file with secrets or personal overrides

## Built-in Variables

Vite automatically provides these:

```typescript
import.meta.env.MODE // "development", "production", "staging", etc.
import.meta.env.DEV // true in development mode
import.meta.env.PROD // true in production mode
import.meta.env.SSR // true if server-side rendering
```

## Functions secrets

Functions read two secrets, declared per function in its `secrets` option:

```bash
STRIPE_SECRET_KEY       # a restricted key; see .claude/rules/functions.md
STRIPE_WEBHOOK_SECRET   # the webhook endpoint's signing secret
```

In production they are Firebase secrets, set with
`firebase functions:secrets:set <NAME>`. Under the emulator they come from
`Functions/.secret.local`, which is gitignored; a secret missing from it is
fetched from production Secret Manager with your own credentials, so the
emulator refuses a live Stripe key (`sk_live_`, `rk_live_`) and uses a
placeholder instead. Put a test-mode key there to exercise payments locally.
