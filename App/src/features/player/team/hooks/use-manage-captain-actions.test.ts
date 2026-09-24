import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

/**
 * `deleteTeam` began requiring a season id when teams moved to per-season
 * documents. The captain's Delete team kept sending only the team id, and
 * failed every time with "Team ID and season ID are required" — nothing
 * type-checks what the App sends against what the callable reads. This pins
 * the payload.
 */

const { deleteTeamViaFunction, updateTeamRosterViaFunction } = vi.hoisted(
	() => ({
		deleteTeamViaFunction: vi.fn(async () => ({ success: true })),
		updateTeamRosterViaFunction: vi.fn(async () => ({ success: true })),
	})
)

vi.mock('@/firebase/collections/functions', () => ({
	deleteTeamViaFunction,
	updateTeamRosterViaFunction,
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

// A team-season subdoc: keyed by season id, its parent is the team.
const teamSeasonDoc = {
	id: 'season-fall',
	ref: { parent: { parent: { id: 'team-surly' } } },
}

vi.mock('@/providers', () => ({
	useTeamsContext: () => ({
		currentSeasonTeamsQuerySnapshot: { docs: [teamSeasonDoc] },
	}),
	useSeasonsContext: () => ({
		currentSeasonQueryDocumentSnapshot: { id: 'season-fall' },
	}),
}))

vi.mock('@/shared/hooks/use-user-status', () => ({
	useUserStatus: () => ({
		userSnapshot: { id: 'captain-1' },
		currentSeasonData: { team: { id: 'team-surly' } },
	}),
}))

const { useManageCaptainActions } = await import('./use-manage-captain-actions')

describe('useManageCaptainActions', () => {
	beforeEach(() => {
		deleteTeamViaFunction.mockClear()
	})

	it('deletes the team from the current season, by canonical team id', async () => {
		const { result } = renderHook(() => useManageCaptainActions())

		await act(() => result.current.deleteTeamOnClickHandler())

		expect(deleteTeamViaFunction).toHaveBeenCalledTimes(1)
		expect(deleteTeamViaFunction).toHaveBeenCalledWith(
			expect.objectContaining({
				teamId: 'team-surly',
				seasonId: 'season-fall',
			})
		)
	})
})
