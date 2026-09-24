import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * Admin Team Management's edit dialog. It sent `{ teamDocId }` long after
 * `updateTeamAdmin` began requiring `teamId` and `seasonId`, so renaming a
 * team, adding or removing a player and changing a captain all failed with
 * "Team ID and season ID are required". It also counted a player as captain
 * if they had captained the team in any season. These pin both.
 */

const { updateTeamAdminViaFunction, getDocs } = vi.hoisted(() => ({
	updateTeamAdminViaFunction: vi.fn(async () => ({ success: true })),
	getDocs: vi.fn(),
}))

vi.mock('@/firebase/collections/functions', () => ({
	updateTeamAdminViaFunction,
}))

vi.mock('firebase/firestore', async (importOriginal) => ({
	...(await importOriginal<typeof import('firebase/firestore')>()),
	getDocs,
}))

const playerRef = (id: string) => ({ id })
const rosterSnapshot = {
	docs: [
		{ id: 'pat', data: () => ({ player: playerRef('pat') }) },
		{ id: 'sam', data: () => ({ player: playerRef('sam') }) },
	],
}
const playersSnapshot = {
	docs: [
		{ id: 'pat', data: () => ({ firstname: 'Pat', lastname: 'Lee' }) },
		{ id: 'sam', data: () => ({ firstname: 'Sam', lastname: 'Doe' }) },
	],
}

vi.mock('react-firebase-hooks/firestore', () => ({
	useDocument: () => [{ data: () => ({ name: 'Old Name' }) }, false, undefined],
	useCollection: (ref: { path?: string } | null) => [
		ref?.path?.endsWith('/roster') ? rosterSnapshot : playersSnapshot,
		false,
		undefined,
	],
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

/** A captain player-season: its id is the season, its parent the player. */
const captainSeason = (playerId: string, seasonId: string) => ({
	id: seasonId,
	ref: { parent: { parent: { id: playerId } } },
})

const { TeamEditDialog } = await import('./team-edit-dialog')

const renderDialog = () =>
	render(
		<TeamEditDialog
			open
			onOpenChange={vi.fn()}
			teamDocId='team-1'
			teamName='Old Name'
			seasonId='season-now'
		/>
	)

describe('TeamEditDialog', () => {
	beforeEach(() => {
		updateTeamAdminViaFunction.mockClear()
		// Pat captains now; Sam captained an earlier season only.
		getDocs.mockResolvedValue({
			docs: [
				captainSeason('pat', 'season-now'),
				captainSeason('sam', 'season-old'),
			],
		})
	})

	it('renames the team for its season', async () => {
		renderDialog()

		const name = screen.getByLabelText('Team Name')
		await userEvent.clear(name)
		await userEvent.type(name, 'New Name')
		await userEvent.click(screen.getByRole('button', { name: 'Save' }))

		await waitFor(() =>
			expect(updateTeamAdminViaFunction).toHaveBeenCalledWith({
				teamId: 'team-1',
				seasonId: 'season-now',
				name: 'New Name',
			})
		)
	})

	it('counts only this season’s captains', async () => {
		renderDialog()

		expect(
			await screen.findByRole('button', {
				name: 'Remove captain status from Pat Lee',
			})
		).toBeInTheDocument()
		expect(
			screen.getByRole('button', { name: 'Promote to captain: Sam Doe' })
		).toBeInTheDocument()
	})

	it('changes a captain for its season', async () => {
		renderDialog()

		await userEvent.click(
			await screen.findByRole('button', { name: 'Promote to captain: Sam Doe' })
		)

		await waitFor(() =>
			expect(updateTeamAdminViaFunction).toHaveBeenCalledWith({
				teamId: 'team-1',
				seasonId: 'season-now',
				rosterChanges: {
					updateCaptainStatus: [{ playerId: 'sam', captain: true }],
				},
			})
		)
	})

	it('removes a player for its season', async () => {
		renderDialog()

		await userEvent.click(
			await screen.findByRole('button', { name: 'Remove Sam Doe from team' })
		)
		await userEvent.click(
			await screen.findByRole('button', { name: /Remove$/ })
		)

		await waitFor(() =>
			expect(updateTeamAdminViaFunction).toHaveBeenCalledWith({
				teamId: 'team-1',
				seasonId: 'season-now',
				rosterChanges: { removePlayers: ['sam'] },
			})
		)
	})
})
