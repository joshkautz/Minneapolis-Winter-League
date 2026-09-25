import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

/**
 * Which teams Team Management offers to delete, and for which season.
 *
 * It offered Delete Team on registered teams, which every server path
 * refuses, and on any season it listed, while deleteUnregisteredTeam always
 * deleted the current season's entry — so Delete pressed on a past season
 * removed the team from this one. Its roster column read "roster".
 */

const { deleteUnregisteredTeamViaFunction, toastSuccess } = vi.hoisted(() => ({
	deleteUnregisteredTeamViaFunction: vi.fn(),
	toastSuccess: vi.fn(),
}))

vi.mock('@/firebase/collections/functions', () => ({
	deleteUnregisteredTeamViaFunction,
}))

vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: vi.fn() } }))

vi.mock('react-firebase-hooks/auth', () => ({
	useAuthState: () => [{ uid: 'admin-1' }, false, undefined],
}))

const ROSTER_SIZE = 3

vi.mock('react-firebase-hooks/firestore', () => ({
	useDocument: () => [{ data: () => ({ admin: true }) }, false, undefined],
	useCollection: (
		ref: { kind?: string; seasonId?: string; path?: string } | null
	) => {
		if (!ref) return [undefined, false, undefined]
		if (ref.path?.endsWith('/roster')) {
			return [{ size: ROSTER_SIZE }, false, undefined]
		}
		return [teamsSnapshotFor(ref.seasonId ?? ''), false, undefined]
	},
}))

vi.mock('@/firebase/collections/teams', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/firebase/collections/teams')>()),
	teamsInSeasonQuery: (seasonRef: { id: string }) => ({
		kind: 'teams',
		seasonId: seasonRef.id,
	}),
	teamRosterSubcollection: (teamId: string, seasonId: string) => ({
		path: `teams/${teamId}/teamSeasons/${seasonId}/roster`,
	}),
}))

const CURRENT = 'season-now'
const PAST = 'season-past'

const season = (id: string, name: string) => ({
	id,
	ref: { id },
	data: () => ({ name, dateStart: { toMillis: () => 0 } }),
})
const seasons = [season(CURRENT, '2026 Fall'), season(PAST, '2025 Fall')]

vi.mock('@/providers', () => ({
	useSeasonsContext: () => ({
		seasonsQuerySnapshot: { docs: seasons },
		seasonsQuerySnapshotError: undefined,
		currentSeasonQueryDocumentSnapshot: seasons[0],
	}),
}))

// The other dialogs have suites of their own.
vi.mock('./components/team-badges-dialog', () => ({
	TeamBadgesDialog: () => null,
}))
vi.mock('./components/team-edit-dialog', () => ({ TeamEditDialog: () => null }))
vi.mock('./components/merge-teams-dialog', () => ({
	MergeTeamsDialog: () => null,
}))
vi.mock('./components/team-payments-dialog', () => ({
	TeamPaymentsDialog: () => null,
}))

const teamSeasonDoc = (teamId: string, name: string, registered: boolean) => ({
	id: 'ignored',
	ref: { parent: { parent: { id: teamId } } },
	data: () => ({ name, registered }),
})

function teamsSnapshotFor(seasonId: string) {
	return {
		docs: [
			teamSeasonDoc(`registered-${seasonId}`, `Registered ${seasonId}`, true),
			teamSeasonDoc(`open-${seasonId}`, `Open ${seasonId}`, false),
		],
	}
}

const { TeamManagement } = await import('./team-management')

beforeAll(() => {
	// Radix Select calls these, and jsdom has none of them.
	Element.prototype.hasPointerCapture = () => false
	Element.prototype.releasePointerCapture = () => {}
	Element.prototype.scrollIntoView = () => {}
})

beforeEach(() => {
	vi.clearAllMocks()
	deleteUnregisteredTeamViaFunction.mockResolvedValue({
		success: true,
		message: 'Successfully deleted unregistered team',
		teamId: `open-${CURRENT}`,
		teamName: `Open ${CURRENT}`,
		playersRemoved: ROSTER_SIZE,
	})
})

const renderPage = () =>
	render(
		<MemoryRouter>
			<TeamManagement />
		</MemoryRouter>
	)

const rowFor = (teamName: string): HTMLElement => {
	const row = screen.getByRole('link', { name: teamName }).closest('tr')
	if (!row) throw new Error(`No table row for ${teamName}`)
	return row
}

describe('TeamManagement', () => {
	it('offers Delete only on unregistered teams', () => {
		renderPage()

		expect(
			within(rowFor(`Registered ${CURRENT}`)).queryByRole('button', {
				name: /Delete Team/,
			})
		).not.toBeInTheDocument()
		expect(
			within(rowFor(`Open ${CURRENT}`)).getByRole('button', {
				name: /Delete Team/,
			})
		).toBeInTheDocument()
	})

	it('shows each roster’s size', () => {
		renderPage()

		expect(within(rowFor(`Open ${CURRENT}`)).getByText('3')).toBeInTheDocument()
	})

	it('deletes from the season being viewed, and says how many players go', async () => {
		const user = userEvent.setup()
		renderPage()

		await user.click(
			within(rowFor(`Open ${CURRENT}`)).getByRole('button', {
				name: /Delete Team/,
			})
		)
		const dialog = screen.getByRole('alertdialog')
		expect(dialog).toHaveTextContent('remove 3 players from its roster')
		await user.click(
			within(dialog).getByRole('button', { name: /Delete Team/ })
		)

		await waitFor(() =>
			expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
		)
		expect(deleteUnregisteredTeamViaFunction).toHaveBeenCalledWith({
			teamId: `open-${CURRENT}`,
			seasonId: CURRENT,
		})
		expect(toastSuccess).toHaveBeenCalled()
	})

	it('offers no Delete while a past season is selected', async () => {
		const user = userEvent.setup()
		renderPage()

		// Opened from the keyboard: Radix opens on pointer events jsdom lacks.
		screen.getByRole('combobox').focus()
		await user.keyboard('{Enter}')
		await user.click(await screen.findByRole('option', { name: '2025 Fall' }))

		expect(
			await screen.findByRole('link', { name: `Open ${PAST}` })
		).toBeInTheDocument()
		expect(
			screen.queryByRole('button', { name: /Delete Team/ })
		).not.toBeInTheDocument()
	})
})
