# Environment Variables Order of Operations

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

## Example Loading Sequence

When you run `npm run dev` (mode = "development"):

```
1. Load .env (base values)
2. Load .env.local (personal overrides)
3. Load .env.development (development-specific)
4. Load .env.development.local (personal dev overrides)
5. Apply command-line variables (final overrides)
```

## Package.json Script Modes

```json
{
  "scripts": {
    "dev": "vite --mode development",           // Loads .env.development
    "build": "tsc && vite build",               // Loads .env.production (default)
    "build:staging": "vite build --mode staging", // Loads .env.staging
    "dev:emulators": "VITE_USE_EMULATORS=true vite --mode development"
  }
}
```

## Variable Access Rules

### ✅ Available in Client Code
```typescript
// Only VITE_ prefixed variables are available in browser
import.meta.env.VITE_FIREBASE_API_KEY        // ✅ Available
import.meta.env.VITE_USE_EMULATORS           // ✅ Available
import.meta.env.MODE                         // ✅ Available (built-in)
import.meta.env.DEV                          // ✅ Available (built-in)
```

### ❌ NOT Available in Client Code
```typescript
// Server-only variables (no VITE_ prefix)
import.meta.env.DATABASE_PASSWORD            // ❌ Undefined
import.meta.env.SECRET_KEY                   // ❌ Undefined
process.env.NODE_ENV                         // ❌ Undefined (use import.meta.env.MODE)
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
import.meta.env.MODE          // "development", "production", etc.
import.meta.env.DEV           // true in development mode
import.meta.env.PROD          // true in production mode
import.meta.env.SSR           // true if server-side rendering
```
