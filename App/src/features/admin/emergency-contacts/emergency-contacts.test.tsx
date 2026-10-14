import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

/**
 * The game-day page: each registered team's players with their emergency
 * contacts, a number that can be tapped to call, and a plain statement of
 * whoever has none — so nobody discovers it at the field. Changing season
 * must never leave the previous season's teams on screen.
 */

const { getEmergencyContactsViaFunction } = vi.hoisted(() => ({
	getEmergencyContactsViaFunction: vi.fn(),
}))

vi.mock('@/firebase/collections/functions', () => ({
	getEmergencyContactsViaFunction,
}))

const CURRENT = 'season-5'
const PAST = 'season-4'

const season = (id: string, name: string) => ({
	id,
	ref: { id },
	data: () => ({ name, dateStart: { toMillis: () => 0 } }),
})
const seasons = [season(CURRENT, 'Season 5'), season(PAST, 'Season 4')]

vi.mock('@/providers', () => ({
	useSeasonsContext: () => ({
		seasonsQuerySnapshot: { docs: seasons },
		seasonsQuerySnapshotError: undefined,
		currentSeasonQueryDocumentSnapshot: seasons[0],
	}),
}))

const { EmergencyContacts } = await import('./emergency-contacts')

const SEASON_5 = {
	seasonName: 'Season 5',
	teams: [
		{
			teamId: 'team-a',
			teamName: 'Frost Giants',
			players: [
				{
					playerId: 'p1',
					name: 'Cam Zed',
					captain: true,
					status: 'contacts',
					contacts: [
						{
							name: 'Alex Zed',
							relationship: 'Partner',
							phone: '(612) 555-0100',
						},
					],
				},
				{
					playerId: 'p2',
					name: 'Pat Paper',
					captain: false,
					status: 'recorded',
					contacts: [],
				},
				{
					playerId: 'p3',
					name: 'Una Unsigned',
					captain: false,
					status: 'unsigned',
					contacts: [],
				},
			],
		},
	],
}

beforeAll(() => {
	// Radix Select calls these, and jsdom has none of them.
	Element.prototype.hasPointerCapture = () => false
	Element.prototype.releasePointerCapture = () => {}
	Element.prototype.scrollIntoView = () => {}
})

beforeEach(() => {
	vi.clearAllMocks()
})

const renderPage = () =>
	render(
		<MemoryRouter>
			<EmergencyContacts />
		</MemoryRouter>
	)

const rowFor = (name: string): HTMLElement => {
	const row = screen.getByText(name).closest('tr')
	if (!row) throw new Error(`No table row for ${name}`)
	return row
}

describe('EmergencyContacts', () => {
	it('lists each team’s players with contacts to call', async () => {
		getEmergencyContactsViaFunction.mockResolvedValue(SEASON_5)
		renderPage()

		expect(await screen.findByText('Frost Giants')).toBeInTheDocument()
		expect(getEmergencyContactsViaFunction).toHaveBeenCalledWith({
			seasonId: CURRENT,
		})
		expect(
			screen.getByText('3 players, 2 without emergency contacts')
		).toBeInTheDocument()
		const captain = rowFor('Cam Zed')
		expect(within(captain).getByText('Captain')).toBeInTheDocument()
		expect(
			within(captain).getByRole('link', { name: '(612) 555-0100' })
		).toHaveAttribute('href', 'tel:6125550100')
	})

	it('says plainly who has no contacts, and why', async () => {
		getEmergencyContactsViaFunction.mockResolvedValue(SEASON_5)
		renderPage()

		await screen.findByText('Frost Giants')
		expect(
			within(rowFor('Pat Paper')).getByText(/an admin marked this waiver/)
		).toBeInTheDocument()
		expect(
			within(rowFor('Una Unsigned')).getByText(/no waiver signed this season/)
		).toBeInTheDocument()
	})

	it('loads the season chosen, never showing the last one’s teams', async () => {
		let answerPast: (value: unknown) => void = () => {}
		getEmergencyContactsViaFunction.mockImplementation(
			({ seasonId }: { seasonId: string }) =>
				seasonId === CURRENT
					? Promise.resolve(SEASON_5)
					: new Promise((resolve) => {
							answerPast = resolve
						})
		)
		const user = userEvent.setup()
		renderPage()
		await screen.findByText('Frost Giants')

		screen.getByRole('combobox').focus()
		await user.keyboard('{Enter}')
		await user.click(await screen.findByRole('option', { name: 'Season 4' }))

		expect(getEmergencyContactsViaFunction).toHaveBeenLastCalledWith({
			seasonId: PAST,
		})
		expect(screen.queryByText('Frost Giants')).not.toBeInTheDocument()

		answerPast({ seasonName: 'Season 4', teams: [] })
		expect(
			await screen.findByText('No team is registered for Season 4 yet.')
		).toBeInTheDocument()
	})

	it('shows why the contacts could not be loaded', async () => {
		getEmergencyContactsViaFunction.mockRejectedValue(
			Object.assign(new Error('That season does not exist.'), {
				code: 'functions/not-found',
			})
		)
		renderPage()

		expect(
			await screen.findByText('That season does not exist.')
		).toBeInTheDocument()
		expect(screen.getByRole('button', { name: /Print/ })).toBeDisabled()
	})
})
