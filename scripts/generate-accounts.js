#!/usr/bin/env node

/**
 * Loads 480 synthetic users into the Firebase Auth emulator.
 *
 * seed.js builds player documents from whatever users already exist in Auth,
 * so this has to run first — seeding an empty Auth emulator produces zero
 * players and the team builder then fails.
 *
 * Users are written straight into the running emulator via the Admin SDK.
 * An earlier version wrote a Firebase auth-export snapshot to disk instead,
 * but it hardcoded an absolute path to a checkout that no longer exists and
 * pointed at .emulator/test/, which nothing ever imported.
 *
 * Usage (emulators must already be running):
 *   node scripts/generate-accounts.js
 */

import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

process.env.FIREBASE_AUTH_EMULATOR_HOST =
	process.env.FIREBASE_AUTH_EMULATOR_HOST ?? 'localhost:9099'

const app = initializeApp({ projectId: 'minnesota-winter-league' })
const auth = getAuth(app)

// Lists of masculine American first and last names
const firstNames = [
	'Aaron',
	'Adam',
	'Adrian',
	'Alan',
	'Albert',
	'Alex',
	'Alexander',
	'Andrew',
	'Anthony',
	'Antonio',
	'Arthur',
	'Austin',
	'Benjamin',
	'Billy',
	'Bobby',
	'Bradley',
	'Brandon',
	'Brian',
	'Bruce',
	'Bryan',
	'Carl',
	'Carlos',
	'Charles',
	'Christian',
	'Christopher',
	'Clarence',
	'Craig',
	'Daniel',
	'David',
	'Dennis',
	'Donald',
	'Douglas',
	'Dylan',
	'Edward',
	'Eric',
	'Eugene',
	'Frank',
	'Gary',
	'George',
	'Gregory',
	'Harold',
	'Harry',
	'Henry',
	'Howard',
	'Jack',
	'Jacob',
	'James',
	'Jason',
	'Jeffrey',
	'Jeremy',
	'Jesse',
	'Jesus',
	'John',
	'Jonathan',
	'Jordan',
	'Jose',
	'Joseph',
	'Joshua',
	'Juan',
	'Justin',
	'Keith',
	'Kenneth',
	'Kevin',
	'Larry',
	'Lawrence',
	'Louis',
	'Mark',
	'Martin',
	'Matthew',
	'Michael',
	'Nathan',
	'Nicholas',
	'Noah',
	'Patrick',
	'Paul',
	'Peter',
	'Philip',
	'Ralph',
	'Raymond',
	'Richard',
	'Robert',
	'Roger',
	'Ronald',
	'Roy',
	'Russell',
	'Ryan',
	'Samuel',
	'Scott',
	'Sean',
	'Stephen',
	'Steven',
	'Terry',
	'Thomas',
	'Timothy',
	'Todd',
	'Victor',
	'Walter',
	'Wayne',
	'William',
	'Willie',
]

const lastNames = [
	'Adams',
	'Allen',
	'Anderson',
	'Baker',
	'Barnes',
	'Bell',
	'Brown',
	'Butler',
	'Campbell',
	'Carter',
	'Clark',
	'Collins',
	'Cook',
	'Cooper',
	'Cox',
	'Davis',
	'Edwards',
	'Evans',
	'Fisher',
	'Foster',
	'Garcia',
	'Gibson',
	'Gonzalez',
	'Gray',
	'Green',
	'Hall',
	'Harris',
	'Henderson',
	'Hill',
	'Howard',
	'Hughes',
	'Jackson',
	'James',
	'Johnson',
	'Jones',
	'Kelly',
	'King',
	'Lee',
	'Lewis',
	'Long',
	'Lopez',
	'Martin',
	'Martinez',
	'Miller',
	'Mitchell',
	'Moore',
	'Morgan',
	'Morris',
	'Murphy',
	'Nelson',
	'Parker',
	'Patterson',
	'Perez',
	'Peterson',
	'Phillips',
	'Powell',
	'Price',
	'Reed',
	'Richardson',
	'Rivera',
	'Roberts',
	'Robinson',
	'Rodriguez',
	'Rogers',
	'Ross',
	'Russell',
	'Sanchez',
	'Scott',
	'Smith',
	'Stewart',
	'Taylor',
	'Thomas',
	'Thompson',
	'Torres',
	'Turner',
	'Walker',
	'Ward',
	'Washington',
	'Watson',
	'White',
	'Williams',
	'Wilson',
	'Wood',
	'Wright',
	'Young',
	'Bennett',
	'Bryant',
	'Coleman',
	'Hayes',
	'Henderson',
]

// Helper function to generate realistic local IDs
function generateLocalId() {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
	let result = ''
	for (let i = 0; i < 28; i++) {
		result += chars.charAt(Math.floor(Math.random() * chars.length))
	}
	return result
}

// Helper function to format name for email
function formatNameForEmail(firstName, lastName) {
	return `${firstName.toLowerCase()}+${lastName.toLowerCase()}`
}

// Generate 480 users
const users = []

for (let i = 0; i < 480; i++) {
	const firstName = firstNames[i % firstNames.length]
	const lastName = lastNames[i % lastNames.length]
	const displayName = `${firstName} ${lastName}`
	const localId = generateLocalId()

	// Alternate between gmail and joshkautz.com (50 each)
	const isGmail = i % 2 === 0
	const emailDomain = isGmail
		? 'nrsimonelli+minneapolis+winter+league+' +
			formatNameForEmail(firstName, lastName) +
			'@gmail.com'
		: 'josh+minneapolis+winter+league+' +
			formatNameForEmail(firstName, lastName) +
			'@joshkautz.com'

	const user = {
		localId: localId,
		createdAt: '0',
		lastLoginAt: '1724803200',
		displayName: displayName,
		validSince: '1756756846',
		email: emailDomain,
		emailVerified: true,
		disabled: false,
	}

	users.push(user)
}

// The Auth emulator caps importUsers() at 1000 records per call; 480 fits in
// one batch, but chunking keeps this correct if the count ever grows.
const IMPORT_BATCH_SIZE = 500

const records = users.map((user) => ({
	uid: user.localId,
	email: user.email,
	displayName: user.displayName,
	emailVerified: user.emailVerified,
	disabled: user.disabled,
}))

let imported = 0
let skipped = 0

for (let i = 0; i < records.length; i += IMPORT_BATCH_SIZE) {
	const batch = records.slice(i, i + IMPORT_BATCH_SIZE)
	const result = await auth.importUsers(batch)
	imported += result.successCount
	skipped += result.failureCount

	// A duplicate uid/email means this script already ran against these
	// emulators. That is benign and re-running stays idempotent, so only
	// surface errors that are something else.
	for (const failure of result.errors) {
		const code = failure.error.code ?? ''
		if (!code.includes('already-exists') && !code.includes('duplicate')) {
			console.error(
				`   Failed to import ${batch[failure.index].email}: ${failure.error.message}`
			)
		}
	}
}

console.log(`Imported ${imported} users into the Auth emulator.`)
if (skipped > 0) {
	console.log(`   Skipped ${skipped} that already existed.`)
}
