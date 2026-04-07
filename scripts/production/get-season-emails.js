#!/usr/bin/env node

/**
 * Script to get all participant email addresses for the current season
 *
 * Usage:
 *   node scripts/production/get-season-emails.js
 *
 * Prerequisites:
 *   - Must be authenticated with Google Cloud (gcloud auth application-default login)
 *   - OR have GOOGLE_APPLICATION_CREDENTIALS set to a service account key
 */

import admin from 'firebase-admin'

// Initialize production Firebase app
const app = admin.initializeApp({
	projectId: 'minnesota-winter-league',
})

const db = app.firestore()

async function getCurrentSeason() {
	const seasonsSnapshot = await db
		.collection('seasons')
		.orderBy('dateStart', 'desc')
		.limit(1)
		.get()

	if (seasonsSnapshot.empty) {
		throw new Error('No seasons found')
	}

	const seasonDoc = seasonsSnapshot.docs[0]
	return {
		id: seasonDoc.id,
		...seasonDoc.data(),
	}
}

async function getSeasonParticipantEmails(seasonId) {
	const playersSnapshot = await db.collection('players').get()

	const participants = []

	for (const playerDoc of playersSnapshot.docs) {
		const playerData = playerDoc.data()

		// Find this player's participation in the season
		const seasonParticipation = playerData.seasons?.find(
			(ps) => ps.season?.id === seasonId || ps.season?.path?.includes(seasonId)
		)

		if (seasonParticipation) {
			participants.push({
				email: playerData.email,
				firstname: playerData.firstname,
				lastname: playerData.lastname,
				paid: seasonParticipation.paid,
				signed: seasonParticipation.signed,
				hasTeam: !!seasonParticipation.team,
			})
		}
	}

	return participants
}

async function main() {
	console.log('Fetching current season...\n')

	const currentSeason = await getCurrentSeason()
	console.log(`Current season: ${currentSeason.name} (ID: ${currentSeason.id})`)
	console.log(`Start date: ${currentSeason.dateStart?.toDate?.()?.toLocaleDateString() || 'N/A'}`)
	console.log('')

	console.log('Fetching participant emails...\n')

	const allParticipants = await getSeasonParticipantEmails(currentSeason.id)

	// Filter for only active participants (paid, signed, and on a team)
	const activeParticipants = allParticipants.filter(
		(p) => p.paid && p.signed && p.hasTeam
	)

	console.log(`Found ${activeParticipants.length} active participants (paid, signed, on team) out of ${allParticipants.length} total for ${currentSeason.name}:\n`)

	// Sort by last name, first name
	activeParticipants.sort((a, b) => {
		const lastNameCompare = (a.lastname || '').localeCompare(b.lastname || '')
		if (lastNameCompare !== 0) return lastNameCompare
		return (a.firstname || '').localeCompare(b.firstname || '')
	})

	// Print as a table
	console.log('Name                          | Email                                    | Paid | Signed | Team')
	console.log('-'.repeat(100))

	for (const p of activeParticipants) {
		const name = `${p.firstname || ''} ${p.lastname || ''}`.padEnd(29)
		const email = (p.email || '').padEnd(40)
		const paid = p.paid ? 'Yes' : 'No '
		const signed = p.signed ? 'Yes' : 'No '
		const team = p.hasTeam ? 'Yes' : 'No'
		console.log(`${name} | ${email} | ${paid}  | ${signed}    | ${team}`)
	}

	console.log('')
	console.log('--- EMAIL LIST (copy-paste ready) ---')
	console.log('')

	// Output just emails, comma-separated for easy copy-paste
	const emails = activeParticipants.map((p) => p.email).filter(Boolean)
	console.log(emails.join(', '))

	console.log('')
	console.log(`Total: ${emails.length} email addresses`)
}

// Handle cleanup
process.on('SIGINT', () => {
	app.delete()
	process.exit(0)
})

main()
	.then(() => {
		app.delete()
		process.exit(0)
	})
	.catch((error) => {
		console.error('Error:', error.message)
		app.delete()
		process.exit(1)
	})
