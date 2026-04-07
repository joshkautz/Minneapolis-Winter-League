#!/usr/bin/env node

/**
 * One-time cleanup script — removes karma and lookingForTeam from production.
 *
 * Removes:
 *   - `karma` field from every document in the `teams` collection
 *   - `karma_transactions` subcollection from every team
 *   - `lookingForTeam` field from every PlayerSeason in every player's
 *     `seasons` array
 *
 * Runs in dry-run mode by default. Pass `--commit` to actually write changes.
 *
 * Usage:
 *   node scripts/production/cleanup-karma-and-looking-for-team.js          # dry run
 *   node scripts/production/cleanup-karma-and-looking-for-team.js --commit # apply
 *
 * Prerequisites:
 *   - gcloud auth application-default login
 */

import admin from 'firebase-admin'

const COMMIT = process.argv.includes('--commit')

const app = admin.initializeApp({ projectId: 'minnesota-winter-league' })
const db = app.firestore()
const FieldValue = admin.firestore.FieldValue

const stats = {
	teamsWithKarmaField: 0,
	karmaFieldsRemoved: 0,
	karmaTransactionsDeleted: 0,
	playersWithLookingForTeam: 0,
	playerSeasonsCleaned: 0,
}

async function cleanupTeams() {
	console.log('\n📋 Scanning teams collection...')
	const teamsSnap = await db.collection('teams').get()
	console.log(`   Found ${teamsSnap.size} teams`)

	let batch = db.batch()
	let pending = 0

	for (const teamDoc of teamsSnap.docs) {
		const data = teamDoc.data()
		const hasKarmaField = Object.prototype.hasOwnProperty.call(data, 'karma')

		if (hasKarmaField) {
			stats.teamsWithKarmaField++
			if (COMMIT) {
				batch.update(teamDoc.ref, { karma: FieldValue.delete() })
				pending++
				stats.karmaFieldsRemoved++
				if (pending >= 400) {
					await batch.commit()
					batch = db.batch()
					pending = 0
				}
			} else {
				stats.karmaFieldsRemoved++
			}
		}

		// Delete karma_transactions subcollection
		const txSnap = await teamDoc.ref.collection('karma_transactions').get()
		if (!txSnap.empty) {
			console.log(
				`   ${teamDoc.data().name ?? teamDoc.id}: ${txSnap.size} karma transactions`
			)
			for (const txDoc of txSnap.docs) {
				stats.karmaTransactionsDeleted++
				if (COMMIT) {
					batch.delete(txDoc.ref)
					pending++
					if (pending >= 400) {
						await batch.commit()
						batch = db.batch()
						pending = 0
					}
				}
			}
		}
	}

	if (COMMIT && pending > 0) {
		await batch.commit()
	}
}

async function cleanupPlayers() {
	console.log('\n👥 Scanning players collection...')
	const playersSnap = await db.collection('players').get()
	console.log(`   Found ${playersSnap.size} players`)

	let batch = db.batch()
	let pending = 0

	for (const playerDoc of playersSnap.docs) {
		const data = playerDoc.data()
		const seasons = Array.isArray(data.seasons) ? data.seasons : []

		let touched = false
		const cleanedSeasons = seasons.map((season) => {
			if (
				season &&
				typeof season === 'object' &&
				Object.prototype.hasOwnProperty.call(season, 'lookingForTeam')
			) {
				touched = true
				stats.playerSeasonsCleaned++
				const { lookingForTeam: _drop, ...rest } = season
				return rest
			}
			return season
		})

		if (touched) {
			stats.playersWithLookingForTeam++
			if (COMMIT) {
				batch.update(playerDoc.ref, { seasons: cleanedSeasons })
				pending++
				if (pending >= 400) {
					await batch.commit()
					batch = db.batch()
					pending = 0
				}
			}
		}
	}

	if (COMMIT && pending > 0) {
		await batch.commit()
	}
}

async function main() {
	console.log(
		COMMIT
			? '⚠️  COMMIT MODE — changes will be written to production'
			: 'ℹ️  Dry run — no changes will be written. Pass --commit to apply.'
	)

	await cleanupTeams()
	await cleanupPlayers()

	console.log('\n📊 Summary')
	console.log(`   Teams with karma field:        ${stats.teamsWithKarmaField}`)
	console.log(`   Karma fields removed:          ${stats.karmaFieldsRemoved}`)
	console.log(`   Karma transactions deleted:    ${stats.karmaTransactionsDeleted}`)
	console.log(`   Players with lookingForTeam:   ${stats.playersWithLookingForTeam}`)
	console.log(`   PlayerSeasons cleaned:         ${stats.playerSeasonsCleaned}`)

	if (!COMMIT) {
		console.log('\n💡 Re-run with --commit to apply these changes.')
	} else {
		console.log('\n✅ Cleanup complete.')
	}

	await app.delete()
}

main().catch((err) => {
	console.error('❌ Failed:', err)
	app.delete()
	process.exit(1)
})
