import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { doc, Timestamp, type DocumentReference } from 'firebase/firestore'
import { firestore } from '@/firebase/app'

/**
 * Offer Management showed "Unknown Team" for every offer: it read `name`
 * off the team document, which has none since names moved onto each
 * season's team-season. The type allowed it (TeamDocument extends
 * DocumentData), so only a test can hold the fix.
 */

const ref = (path: string) => doc(firestore, path) as DocumentReference

/** What each document holds, by path; the team document has no name. */
const DOCUMENTS: Record<string, Record<string, unknown>> = {
	'players/player-1': { firstname: 'Alex', lastname: 'Chen' },
	'playerContacts/player-1': { email: 'alex@example.com' },
	'players/captain-1': { firstname: 'Sam', lastname: 'Rivera' },
	'teams/team-1': { createdBy: null },
	'teams/team-1/teamSeasons/season-5': { name: 'Frost Giants' },
	'seasons/season-5': { name: 'Season 5', dateStart: Timestamp.now() },
}

vi.mock('firebase/firestore', async (importOriginal) => ({
	...(await importOriginal<typeof import('firebase/firestore')>()),
	getDoc: async (target: DocumentReference) => ({
		id: target.id,
		exists: () => target.path in DOCUMENTS,
		data: () => DOCUMENTS[target.path],
	}),
}))

/**
 * One snapshot for every render, as the real hook gives: a new object each
 * time makes the page start resolving again and never finish.
 */
let snapshot: unknown
const offersSnapshot = () =>
	(snapshot ??= {
		docs: [
			{
				id: 'offer-1',
				data: () => ({
					type: 'invitation',
					status: 'pending',
					player: ref('players/player-1'),
					team: ref('teams/team-1'),
					season: ref('seasons/season-5'),
					createdBy: ref('players/captain-1'),
					createdAt: Timestamp.now(),
				}),
			},
		],
	})

vi.mock('react-firebase-hooks/firestore', () => ({
	useCollection: () => [offersSnapshot(), false, undefined],
}))

vi.mock('@/providers', () => ({
	useSeasonsContext: () => ({
		seasonsQuerySnapshot: { docs: [] },
		seasonsQuerySnapshotLoading: false,
		seasonsQuerySnapshotError: undefined,
		currentSeasonQueryDocumentSnapshot: undefined,
	}),
}))

const { OfferManagement } = await import('./offer-management')

describe('OfferManagement', () => {
	it('names each offer’s team as it was called that season', async () => {
		render(
			<MemoryRouter>
				<OfferManagement />
			</MemoryRouter>
		)

		expect(await screen.findByText('Frost Giants')).toBeTruthy()
		expect(screen.queryByText('Unknown Team')).toBeNull()
	})
})
