#!/usr/bin/env node

/**
 * Script to generate 480 test users for Firebase Auth emulator
 */

import { writeFileSync } from 'fs'

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

// Create the accounts object
const accountsData = {
	kind: 'identitytoolkit#DownloadAccountResponse',
	users: users,
}

// Write to file
const outputPath =
	'/Users/josh/Projects/Minneapolis-Winter-League/.emulator/auth_export/accounts.json'
writeFileSync(outputPath, JSON.stringify(accountsData, null, 2))

console.log(`✅ Generated ${users.length} users in accounts.json`)
console.log(`   • 240 users with gmail.com emails`)
console.log(`   • 240 users with joshkautz.com emails`)
console.log(`   • All users have masculine American names`)
console.log(`   • Consistent simple format with timestamps and settings`)
