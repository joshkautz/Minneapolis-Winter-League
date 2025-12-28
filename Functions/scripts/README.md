# Firestore Scripts

Administrative scripts for managing Firestore data. These scripts use the Firebase Admin SDK and should be run locally.

## Prerequisites

1. **Service Account Key**: Download from Firebase Console → Project Settings → Service Accounts → Generate New Private Key

2. **Set Environment Variable**:

   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccountKey.json"
   ```

3. **For Emulator Testing** (optional):
   ```bash
   export FIRESTORE_EMULATOR_HOST="localhost:8080"
   ```

---

## Running Scripts

Scripts can be run from either the project root or the Functions directory.

**Important**: When passing flags to scripts, use `--` before your flags:

```bash
# From project root
npm run script:backup -- --collections=players

# From Functions directory
npm run script:backup -- --collections=players
```

The `--` tells npm to pass everything after it to the underlying script.

---

## Scripts

### 1. Backup Firestore

Creates a local JSON backup of Firestore collections.

```bash
# Backup all collections
npm run script:backup

# Backup specific collections
npm run script:backup -- --collections=waivers,players

# Backup to specific directory
npm run script:backup -- --output=./my-backups

# Include subcollections (slower but complete)
npm run script:backup -- --include-subcollections
```

**Output Structure:**

```
backups/backup-YYYY-MM-DD-HH-mm-ss/
├── _metadata.json      # Backup info and statistics
├── players.json
├── teams.json
├── waivers.json
└── ...
```

---

### 2. Restore Firestore

Restores Firestore data from a backup.

```bash
# Dry run - preview what would be restored
npm run script:restore -- ./backups/backup-2024-01-15-10-30-00 --dry-run

# Restore all collections
npm run script:restore -- ./backups/backup-2024-01-15-10-30-00

# Restore specific collections only
npm run script:restore -- ./backups/backup-2024-01-15-10-30-00 --collections=waivers,players

# Overwrite existing documents (default is skip)
npm run script:restore -- ./backups/backup-2024-01-15-10-30-00 --overwrite

# Delete all existing documents before restore (DANGEROUS)
npm run script:restore -- ./backups/backup-2024-01-15-10-30-00 --clear-first
```

**Options:**

- `--dry-run` - Preview changes without modifying data
- `--collections=a,b,c` - Restore only specific collections
- `--overwrite` - Overwrite existing documents (default: skip)
- `--clear-first` - Delete all documents before restore (DANGEROUS)

---

### 3. Migrate Waivers

Migrates waiver documents from the legacy flat collection to the new per-user subcollection pattern.

```bash
# Dry run - see what would happen
npm run script:migrate-waivers -- --dry-run

# Run migration
npm run script:migrate-waivers

# Run migration and delete old documents after
npm run script:migrate-waivers -- --delete-old
```

**Migration Path:**

```
OLD: waivers/{waiverId}
     └── player: DocumentReference
     └── season: string
     └── signatureRequestId: string
     └── status: WaiverStatus
     └── createdAt: Timestamp
     └── signedAt?: Timestamp

NEW: dropbox/{uid}/waivers/{waiverId}
     └── seasonId: string
     └── signatureRequestId: string
     └── status: WaiverStatus
     └── createdAt: Timestamp
     └── signedAt?: Timestamp
     └── migratedAt: Timestamp (added by migration)
     └── legacyDocId: string (added by migration)
```

---

### 4. Cleanup Migration Fields

Removes migration metadata fields (`legacyDocId`, `migratedAt`) from waiver documents after migration is complete.

```bash
# Dry run - see what would be cleaned
npm run script:cleanup-migration -- --dry-run

# Run cleanup
npm run script:cleanup-migration
```

---

### 5. Migrate Stripe Data

Migrates Stripe payment data from the Firebase Stripe Extension structure to our custom implementation.

```bash
# Dry run - see what would happen
npm run script:migrate-stripe -- --dry-run

# Run migration
npm run script:migrate-stripe

# Run migration and delete old documents after
npm run script:migrate-stripe -- --delete-old
```

**Migration Path:**

```
OLD: customers/{uid}
     └── checkout_sessions/{sessionId}
     └── payments/{paymentId}
     └── subscriptions/{subscriptionId}

NEW: stripe/{uid}
     └── checkouts/{sessionId}
     └── payments/{paymentId}
```

**Options:**

- `--dry-run` - Preview changes without modifying data
- `--delete-old` - Delete old documents after successful migration

---

### 6. Migrate Storage URLs

Migrates image URLs from GCS public URLs to Firebase Storage URLs for consistency and proper security rule enforcement.

```bash
# Dry run - see what would be updated
npm run script:migrate-storage-urls -- --dry-run

# Run migration
npm run script:migrate-storage-urls
```

**URL Transformation:**

```
OLD: https://storage.googleapis.com/bucket-name/teams/file-id
NEW: https://firebasestorage.googleapis.com/v0/b/bucket-name/o/teams%2Ffile-id?alt=media
```

---

## Recommended Workflow

### Before Any Migration

1. **Create a backup first:**

   ```bash
   npm run script:backup
   ```

2. **Test on emulator:**

   ```bash
   export FIRESTORE_EMULATOR_HOST="localhost:8080"
   npm run script:migrate-waivers -- --dry-run
   ```

3. **Run dry-run on production:**

   ```bash
   unset FIRESTORE_EMULATOR_HOST
   npm run script:migrate-waivers -- --dry-run
   ```

4. **Execute migration:**

   ```bash
   npm run script:migrate-waivers
   ```

5. **Verify, then optionally delete legacy documents:**

   ```bash
   npm run script:migrate-waivers -- --delete-old
   ```

6. **Remove migration metadata fields:**
   ```bash
   npm run script:cleanup-migration -- --dry-run
   npm run script:cleanup-migration
   ```

### If Something Goes Wrong

1. **Restore from backup:**
   ```bash
   npm run script:restore -- ./backups/backup-YYYY-MM-DD --collections=waivers
   ```

---

## Notes

- All scripts support the Firestore emulator for safe testing
- Backups preserve Timestamps, DocumentReferences, and GeoPoints
- Restore operations are idempotent (safe to run multiple times)
- Always use `--dry-run` first to preview changes
