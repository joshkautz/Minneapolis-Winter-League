import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

/**
 * The rollover dropdown: each team the player has captained, named as it was
 * in its latest season, newest first, with this season's teams marked as
 * already rolled over and the newest eligible one preselected.
 */

const { useTeamsContext, useSeasonsContext, getDocs, rolloverTeamViaFunction } =
	vi.hoisted(() => ({
		useTeamsContext: vi.fn(),
		useSeasonsContext: vi.fn(),
		getDocs: vi.fn(),
		rolloverTeamViaFunction: vi.fn(),
	}))

vi.mock('@/providers', () => ({ useTeamsContext, useSeasonsContext }))
vi.mock('firebase/firestore', async (importOriginal) => ({
	...(await importOriginal<typeof import('firebase/firestore')>()),
	getDocs,
}))
vi.mock('@/firebase/collections/functions', () => ({
	rolloverTeamViaFunction,
}))
vi.mock('@/firebase/collections/teams', () => ({
	teamSeasonsQuery: (teamId: string) => ({ teamId }),
	canonicalTeamIdFromTeamSeasonDoc: (doc: { teamId: string }) => doc.teamId,
}))

const { useRolloverTeamForm } = await import('./use-rollover-team-form')
const { logger } = await import('@/shared/utils')
const loggerError = vi.spyOn(logger, 'error').mockImplementation(() => {})

const season = (id: string, name: string, startSeconds: number) => ({
	id,
	data: () => ({ name, dateStart: { seconds: startSeconds } }),
})

const SEASONS = {
	docs: [
		season('fall-2024', 'Fall 2024', 100),
		season('fall-2025', 'Fall 2025', 200),
		season('fall-2026', 'Fall 2026', 300),
	],
}

/** Team-season history per canonical team: [seasonId, name as it was]. */
const HISTORIES: Record<string, [string, string][]> = {
	frostbite: [
		['fall-2024', 'Frostbite'],
		['fall-2025', 'Frostbite Too'],
	],
	yeti: [['fall-2024', 'Yetis']],
	polar: [
		['fall-2025', 'Polar'],
		['fall-2026', 'Polar'],
	],
}

const renderForm = (captainOf: string[], thisSeason: string[] = []) => {
	useTeamsContext.mockReturnValue({
		teamsForWhichAuthenticatedUserIsCaptainQuerySnapshot: {
			docs: captainOf.map((id) => ({ id })),
		},
		currentSeasonTeamsQuerySnapshot: {
			docs: thisSeason.map((teamId) => ({ teamId })),
		},
	})
	useSeasonsContext.mockReturnValue({ seasonsQuerySnapshot: SEASONS })
	const handleResult = vi.fn()
	const rendered = renderHook(() =>
		useRolloverTeamForm({ handleResult, seasonId: 'fall-2026' })
	)
	return { ...rendered, handleResult }
}

beforeEach(() => {
	vi.clearAllMocks()
	getDocs.mockImplementation(async ({ teamId }: { teamId: string }) => ({
		docs: (HISTORIES[teamId] ?? []).map(([seasonId, name]) => ({
			data: () => ({ season: { id: seasonId }, name }),
		})),
	}))
})

describe('useRolloverTeamForm', () => {
	it('lists each captained team under its latest name, newest first', async () => {
		const { result } = renderForm(['yeti', 'frostbite'])
		await waitFor(() => expect(result.current.availableTeams).toHaveLength(2))

		expect(result.current.availableTeams).toEqual([
			{
				canonicalTeamId: 'frostbite',
				displayName: 'Frostbite Too',
				mostRecentSeasonName: 'Fall 2025',
				mostRecentSeasonStartSeconds: 200,
				alreadyRolledOver: false,
			},
			{
				canonicalTeamId: 'yeti',
				displayName: 'Yetis',
				mostRecentSeasonName: 'Fall 2024',
				mostRecentSeasonStartSeconds: 100,
				alreadyRolledOver: false,
			},
		])
	})

	it('marks a team already in this season and preselects the next', async () => {
		const { result } = renderForm(['polar', 'frostbite'], ['polar'])
		await waitFor(() => expect(result.current.availableTeams).toHaveLength(2))

		expect(result.current.availableTeams[0]).toMatchObject({
			canonicalTeamId: 'polar',
			alreadyRolledOver: true,
		})
		await waitFor(() =>
			expect(result.current.form.getValues('selectedTeam')).toBe('frostbite')
		)
	})

	it("keeps the captain's own pick when the list refreshes", async () => {
		const { result, rerender } = renderForm(['frostbite', 'yeti'])
		await waitFor(() =>
			expect(result.current.form.getValues('selectedTeam')).toBe('frostbite')
		)
		act(() => result.current.form.setValue('selectedTeam', 'yeti'))

		// A new snapshot of this season's teams rebuilds the option list.
		useTeamsContext.mockReturnValue({
			...useTeamsContext.mock.results[0].value,
			currentSeasonTeamsQuerySnapshot: { docs: [] },
		})
		rerender()

		expect(result.current.form.getValues('selectedTeam')).toBe('yeti')
	})

	it('leaves out a team whose history fails to load, and logs why', async () => {
		const failure = new Error('permission-denied')
		getDocs.mockImplementationOnce(async () => {
			throw failure
		})
		const { result } = renderForm(['yeti', 'frostbite'])
		await waitFor(() => expect(result.current.availableTeams).toHaveLength(1))

		expect(loggerError).toHaveBeenCalledWith(
			'Failed to load team seasons for rollover candidate',
			failure,
			expect.objectContaining({ canonicalTeamId: 'yeti' })
		)
	})

	it('reports having no captained teams', () => {
		const { result } = renderForm([])
		expect(result.current.hasCaptainTeams).toBe(false)
		expect(result.current.availableTeams).toEqual([])
	})

	it('rolls over the selected team and reports success', async () => {
		rolloverTeamViaFunction.mockResolvedValue({
			teamId: 'frostbite',
			message: 'Frostbite Too is back.',
		})
		const { result, handleResult } = renderForm(['frostbite'])
		await waitFor(() => expect(result.current.availableTeams).toHaveLength(1))

		await act(() => result.current.onSubmit({ selectedTeam: 'frostbite' }))

		expect(rolloverTeamViaFunction).toHaveBeenCalledWith({
			originalTeamId: 'frostbite',
			seasonId: 'fall-2026',
			timezone: expect.any(String),
		})
		expect(handleResult).toHaveBeenCalledWith({
			success: true,
			title: 'Team rolled over successfully',
			description: 'Frostbite Too is back.',
			navigation: true,
		})
	})
})
