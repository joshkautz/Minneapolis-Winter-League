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

// firebase-admin 14 removed the legacy default-export namespace and the
// app.<service>() accessors, so the modular entry points are the only
// supported form.
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

// Initialize production Firebase app
const app = initializeApp({
	projectId: 'minnesota-winter-league',
})

const db = getFirestore(app)

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

/**
 * Everyone with a player-season in the season, with the email from their
 * private contact document (emails are not on the public player documents).
 */
async function getSeasonParticipantEmails(seasonId) {
	const playerSeasons = await db
		.collectionGroup('playerSeasons')
		.where('season', '==', db.collection('seasons').doc(seasonId))
		.get()
	if (playerSeasons.empty) return []

	const playerIds = playerSeasons.docs.map((doc) => doc.ref.parent.parent.id)
	const [players, contacts] = await Promise.all([
		db.getAll(...playerIds.map((id) => db.collection('players').doc(id))),
		db.getAll(
			...playerIds.map((id) => db.collection('playerContacts').doc(id))
		),
	])

	return playerSeasons.docs.map((doc, index) => {
		const season = doc.data()
		const player = players[index].data() ?? {}
		return {
			email: contacts[index].data()?.email ?? '',
			firstname: player.firstname ?? '',
			lastname: player.lastname ?? '',
			paid: season.paid === true,
			signed: season.signed === true,
			hasTeam: Boolean(season.team),
		}
	})
}

async function main() {
	console.log('Fetching current season...\n')

	const currentSeason = await getCurrentSeason()
	console.log(`Current season: ${currentSeason.name} (ID: ${currentSeason.id})`)
	console.log(
		`Start date: ${currentSeason.dateStart?.toDate?.()?.toLocaleDateString() || 'N/A'}`
	)
	console.log('')

	console.log('Fetching participant emails...\n')

	const allParticipants = await getSeasonParticipantEmails(currentSeason.id)

	// Active means on a team and signed, and under per-player pricing also
	// paid. Under team payments the money is the team's, so a player's own
	// `paid` flag is never set.
	const teamPricing =
		typeof currentSeason.teamRegistrationTotalCents === 'number'
	const activeParticipants = allParticipants.filter(
		(p) => p.hasTeam && p.signed && (teamPricing || p.paid)
	)
	const rule = teamPricing ? 'signed, on a team' : 'paid, signed, on a team'

	console.log(
		`Found ${activeParticipants.length} active participants (${rule}) out of ${allParticipants.length} total for ${currentSeason.name}:\n`
	)

	// Sort by last name, first name
	activeParticipants.sort((a, b) => {
		const lastNameCompare = (a.lastname || '').localeCompare(b.lastname || '')
		if (lastNameCompare !== 0) return lastNameCompare
		return (a.firstname || '').localeCompare(b.firstname || '')
	})

	// Print as a table
	console.log(
		'Name                          | Email                                    | Paid | Signed | Team'
	)
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
