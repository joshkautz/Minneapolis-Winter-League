import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { costBreakdown, LEAGUE_COSTS } from './league-costs'
import { LeagueCostsDialog } from './league-costs-dialog'

/**
 * The public breakdown of the team fee. Whatever the season's costs, the
 * lines must add up to the fee exactly — a breakdown that is a cent off
 * invites the question it exists to answer.
 */

describe('costBreakdown', () => {
	it('splits Season 5’s costs across its twelve teams', () => {
		expect(
			costBreakdown().map(({ name, perTeamCents, seasonCents }) => [
				name,
				perTeamCents,
				seasonCents,
			])
		).toEqual([
			['Facility', 76_002, 912_018],
			['Website', 4_597, 55_160],
			['Insurance', 1_467, 17_600],
			['Equipment', 833, 10_000],
			['League reserve', 17_101, 205_222],
		])
	})

	it('adds up to the fee exactly, per team and for the season', () => {
		const lines = costBreakdown()
		const sum = (pick: (line: (typeof lines)[number]) => number) =>
			lines.reduce((total, line) => total + pick(line), 0)

		expect(sum((line) => line.perTeamCents)).toBe(LEAGUE_COSTS.teamFeeCents)
		expect(sum((line) => line.seasonCents)).toBe(
			LEAGUE_COSTS.teamFeeCents * LEAGUE_COSTS.teams
		)
		expect(sum((line) => line.share)).toBeCloseTo(1)
	})

	it('puts the reserve last, however large', () => {
		const lines = costBreakdown({
			...LEAGUE_COSTS,
			costs: [{ name: 'Facility', description: '', seasonCents: 100_000 }],
		})

		expect(lines.map((line) => line.name)).toEqual([
			'Facility',
			'League reserve',
		])
		expect(lines[1]).toMatchObject({ isReserve: true, perTeamCents: 91_667 })
	})
})

describe('LeagueCostsDialog', () => {
	it('shows only its button until it is opened', () => {
		render(<LeagueCostsDialog />)

		expect(
			screen.getByRole('button', { name: 'Where your team fee goes' })
		).toBeTruthy()
		expect(screen.queryByText('Facility')).toBeNull()
	})

	it('lists every cost with its share, and totals to the fee', async () => {
		render(<LeagueCostsDialog />)
		await userEvent.click(
			screen.getByRole('button', { name: 'Where your team fee goes' })
		)

		const dialog = screen.getByRole('dialog', {
			name: 'Where your team fee goes',
		})
		const facility = within(dialog).getByText('Facility').closest('tr')
		expect(facility).not.toBeNull()
		expect(within(facility as HTMLElement).getByText('$760.02')).toBeTruthy()
		expect(within(facility as HTMLElement).getByText('76%')).toBeTruthy()
		expect(within(dialog).getByText('League reserve')).toBeTruthy()
		expect(within(dialog).getByText('$12,000.00')).toBeTruthy()
	})
})
