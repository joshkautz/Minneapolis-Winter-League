/**
 * Rehearses the registration race on throwaway emulators: 15 teams of ten,
 * each with its $1,000 committed, and the tenth waiver on all fifteen signed
 * at the same instant. Exactly 12 may register.
 *
 * Everything goes through the real callables over HTTP, as the App would, so
 * the triggers run in the Functions emulator as deployed. Settlement cannot
 * reach Stripe from the emulator, so registered teams' holds stay
 * authorized and the three losing teams stay in place; that is the path the
 * code takes when a release fails. Stripe settlement itself is covered by the
 * fake-Stripe integration tests.
 *
 * Run against empty emulators, never with --import:
 *   npm run build --workspace=Functions
 *   npx firebase emulators:start --only auth,firestore,functions --project minnesota-winter-league
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
 *     node scripts/rehearse-registration-race.js
 *
 * Refuses to run unless the emulator hosts are set.
 */
import { initializeApp } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'

if (
	process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' ||
	process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099'
) {
	throw new Error('Refusing to run: emulator hosts are not set')
}
const PROJECT = 'minnesota-winter-league'
const FN = `http://127.0.0.1:5001/${PROJECT}/us-central1`
initializeApp({ projectId: PROJECT })
const db = getFirestore()
const auth = getAuth()
const DAY = 24 * 60 * 60 * 1000
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const TEAMS = [
	'Alpha',
	'Bravo',
	'Charlie',
	'Delta',
	'Echo',
	'Foxtrot',
	'Golf',
	'Hotel',
	'India',
	'Juliet',
	'Kilo',
	'Lima',
	'Mike',
	'November',
	'Oscar',
]
const FIRST = [
	'Avery',
	'Blake',
	'Casey',
	'Drew',
	'Emery',
	'Finley',
	'Gray',
	'Harper',
	'Indy',
	'Jordan',
]

const idTokenFor = async (uid) => {
	const custom = await auth.createCustomToken(uid)
	const r = await fetch(
		'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake',
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ token: custom, returnSecureToken: true }),
		}
	)
	const body = await r.json()
	if (!body.idToken)
		throw new Error(`sign-in failed for ${uid}: ${JSON.stringify(body)}`)
	return body.idToken
}
const call = async (token, name, data) => {
	const r = await fetch(`${FN}/${name}`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`,
		},
		body: JSON.stringify({ data }),
	})
	const body = await r.json()
	if (body.error)
		throw new Error(`${name}: ${body.error.status} ${body.error.message}`)
	return body.result
}
const inParallel = async (items, limit, fn) => {
	const out = []
	let next = 0
	await Promise.all(
		Array.from({ length: limit }, async () => {
			while (next < items.length) {
				const i = next++
				out[i] = await fn(items[i], i)
			}
		})
	)
	return out
}

const t0 = Date.now()
const stamp = (msg) =>
	console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${msg}`)

// 1. Accounts and player profiles, through createPlayer.
const people = []
for (const [t, team] of TEAMS.entries())
	for (const [p, first] of FIRST.entries()) {
		people.push({
			uid: `r-${t}-${p}`,
			email: `${first.toLowerCase()}.${team.toLowerCase()}@rehearsal.test`,
			first,
			last: team,
			team: t,
			captain: p === 0,
		})
	}
const admin = {
	uid: 'r-admin',
	email: 'admin@rehearsal.test',
	first: 'Ada',
	last: 'Admin',
}
await inParallel([admin, ...people], 10, async (person) => {
	await auth.createUser({
		uid: person.uid,
		email: person.email,
		emailVerified: true,
	})
	person.token = await idTokenFor(person.uid)
	await call(person.token, 'createPlayer', {
		firstname: person.first,
		lastname: person.last,
		email: person.email,
	})
})
await db.doc(`players/${admin.uid}`).update({ admin: true })
stamp(`created ${people.length} players and an admin`)

// 2. The season, through createSeason: team payments, registration open.
const now = Date.now()
const created = await call(admin.token, 'createSeason', {
	name: 'Rehearsal Fall',
	dateStart: new Date(now + 40 * DAY).toISOString(),
	dateEnd: new Date(now + 80 * DAY).toISOString(),
	registrationStart: new Date(now - 60 * 60 * 1000).toISOString(),
	registrationEnd: new Date(now + 20 * DAY).toISOString(),
	teamRegistrationTotalCents: 100_000,
})
const seasonId =
	created.seasonId ?? (await db.collection('seasons').get()).docs[0].id
stamp(`season ${seasonId}`)

// 3. Teams: each captain creates one; an admin adds the other nine.
const teams = await inParallel(TEAMS, 5, async (name, t) => {
	const captain = people.find((p) => p.team === t && p.captain)
	const result = await call(captain.token, 'createTeam', {
		name: `Team ${name}`,
		seasonId,
	})
	return { name, teamId: result.teamId, captain }
})
await inParallel(teams, 5, async (team) => {
	const t = TEAMS.indexOf(team.name)
	const others = people.filter((p) => p.team === t && !p.captain)
	await call(admin.token, 'updateTeamAdmin', {
		teamId: team.teamId,
		seasonId,
		rosterChanges: {
			addPlayers: others.map((p) => ({ playerId: p.uid, captain: false })),
		},
	})
})
stamp('15 teams of 10')

// 4. Each team's $1,000, committed as one authorized hold. Written as the
//    Stripe webhook would; no Stripe is involved.
for (const team of teams) {
	const id = `pi_rehearsal_${team.name.toLowerCase()}`
	await db
		.doc(`teams/${team.teamId}/teamSeasons/${seasonId}/contributions/${id}`)
		.set({
			player: db.doc(`players/${team.captain.uid}`),
			amountCents: 100_000,
			status: 'authorized',
			paymentIntentId: id,
			captureBefore: Timestamp.fromMillis(now + 6 * DAY),
			createdAt: Timestamp.now(),
			updatedAt: Timestamp.now(),
		})
}
stamp('every team committed $1,000')

// 5. Nine waivers per team, through signWaiver.
const waiver = (person) => ({
	versionId: '2026-09-original',
	dateOfBirth: '1992-04-12',
	mailingAddress: '4534 Washburn Ave N, Minneapolis, MN 55412',
	emergencyContacts: [
		{ name: 'Sam Contact', relationship: 'Friend', phone: '612-555-0100' },
	],
	signerName: `${person.first} ${person.last}`,
	agreed: true,
})
const lastSigners = []
await inParallel(teams, 5, async (team, t) => {
	const roster = people.filter((p) => p.team === t)
	lastSigners[t] = roster[roster.length - 1]
	for (const person of roster.slice(0, -1))
		await call(person.token, 'signWaiver', waiver(person))
})
await sleep(8000)
const before =
	(await db.doc(`seasons/${seasonId}`).get()).data().registeredTeamCount ?? 0
stamp(`nine signed on every team; registered so far: ${before}`)

// 6. The race: every team's tenth signature at once.
const raceStart = Date.now()
const raced = await Promise.allSettled(
	lastSigners.map((person) => call(person.token, 'signWaiver', waiver(person)))
)
stamp(
	`15 simultaneous signatures: ${raced.filter((r) => r.status === 'fulfilled').length} accepted in ${Date.now() - raceStart} ms`
)

// 7. Wait for the triggers to settle, then check the invariant.
let last = -1,
	stableSince = Date.now()
while (Date.now() - stableSince < 20000) {
	const count =
		(await db.doc(`seasons/${seasonId}`).get()).data().registeredTeamCount ?? 0
	if (count !== last) {
		last = count
		stableSince = Date.now()
	}
	await sleep(1000)
}
const teamSeasons = await Promise.all(
	teams.map(async (team) => ({
		...team,
		doc: await db.doc(`teams/${team.teamId}/teamSeasons/${seasonId}`).get(),
	}))
)
const registered = teamSeasons.filter(
	(t) => t.doc.exists && t.doc.data().registered
)
const remaining = teamSeasons.filter(
	(t) => t.doc.exists && !t.doc.data().registered
)
const deleted = teamSeasons.filter((t) => !t.doc.exists)
const contributions = await Promise.all(
	teams.map(
		async (team) =>
			(
				await db
					.doc(
						`teams/${team.teamId}/teamSeasons/${seasonId}/contributions/pi_rehearsal_${team.name.toLowerCase()}`
					)
					.get()
			).data()?.status ?? 'gone'
	)
)
stamp('settled')
console.log(
	JSON.stringify(
		{
			registeredTeamCount: last,
			registeredTeams: registered.length,
			unregisteredStillPresent: remaining.map((t) => t.name),
			unregisteredDeleted: deleted.map((t) => t.name),
			contributionStatuses: Object.fromEntries(
				teams.map((t, i) => [t.name, contributions[i]])
			),
			invariantHolds: last === 12 && registered.length === 12,
		},
		null,
		2
	)
)
process.exit(0)
