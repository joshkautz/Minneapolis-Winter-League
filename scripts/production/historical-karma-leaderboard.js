#!/usr/bin/env node

/**
 * Generates a one-time historical leaderboard of teams ranked by karma.
 *
 * Reads the live `teams` collection from production, sorts by `karma` desc,
 * and writes the result to scripts/production/data/historical-karma.json
 * (and a human-readable text version next to it).
 *
 * Usage:
 *   node scripts/production/historical-karma-leaderboard.js
 *
 * Prerequisites:
 *   - gcloud auth application-default login
 */

import admin from 'firebase-admin'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = admin.initializeApp({ projectId: 'minnesota-winter-league' })
const db = app.firestore()

async function main() {
	console.log('📊 Building historical karma leaderboard from production...')

	// Resolve season name once per season ref so we can show season context.
	const seasonNameCache = new Map()
	async function getSeasonName(seasonRef) {
		if (!seasonRef) return 'Unknown Season'
		if (seasonNameCache.has(seasonRef.id)) {
			return seasonNameCache.get(seasonRef.id)
		}
		const seasonDoc = await seasonRef.get()
		const name = seasonDoc.exists
			? (seasonDoc.data().name ?? seasonRef.id)
			: seasonRef.id
		seasonNameCache.set(seasonRef.id, name)
		return name
	}

	const teamsSnapshot = await db.collection('teams').get()
	console.log(`   Found ${teamsSnapshot.size} teams`)

	const rows = []
	for (const teamDoc of teamsSnapshot.docs) {
		const data = teamDoc.data()
		const karma = typeof data.karma === 'number' ? data.karma : 0
		rows.push({
			teamId: teamDoc.id,
			name: data.name ?? '(unnamed)',
			karma,
			seasonId: data.season?.id ?? null,
			seasonName: await getSeasonName(data.season),
		})
	}

	rows.sort((a, b) => b.karma - a.karma || a.name.localeCompare(b.name))

	const outDir = path.join(__dirname, 'data')
	if (!fs.existsSync(outDir)) {
		fs.mkdirSync(outDir, { recursive: true })
	}

	const jsonPath = path.join(outDir, 'historical-karma.json')
	fs.writeFileSync(
		jsonPath,
		JSON.stringify(
			{
				generatedAt: new Date().toISOString(),
				totalTeams: rows.length,
				teams: rows,
			},
			null,
			2
		)
	)

	const txtPath = path.join(outDir, 'historical-karma.txt')
	const lines = []
	lines.push('Minneapolis Winter League — Historical Karma Leaderboard')
	lines.push(`Generated: ${new Date().toISOString()}`)
	lines.push('')
	lines.push('Rank  Karma  Team                                  Season')
	lines.push('----  -----  ------------------------------------  ------------------------')
	rows.forEach((row, i) => {
		const rank = String(i + 1).padStart(4, ' ')
		const karma = String(row.karma).padStart(5, ' ')
		const name = row.name.padEnd(36, ' ').slice(0, 36)
		lines.push(`${rank}  ${karma}  ${name}  ${row.seasonName}`)
	})
	fs.writeFileSync(txtPath, lines.join('\n') + '\n')

	console.log(`\n✅ Wrote ${jsonPath}`)
	console.log(`✅ Wrote ${txtPath}`)
	console.log('\nTop 20:')
	console.log(lines.slice(3, 25).join('\n'))

	await app.delete()
}

main().catch((err) => {
	console.error('❌ Failed:', err)
	app.delete()
	process.exit(1)
})
