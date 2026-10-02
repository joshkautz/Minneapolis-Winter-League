import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SeasonFormat, type SeasonDocument } from '@/types'

/**
 * The Game Management card that generates a traditional season and then
 * reports on its automatic playoffs: which of the two a season gets, that
 * nothing is created until the admin has seen every game, and what the
 * playoffs button tells them.
 */

const {
	generateScheduleViaFunction,
	updatePlayoffsViaFunction,
	toastSuccess,
	toastInfo,
	toastError,
	toastWarning,
} = vi.hoisted(() => ({
	generateScheduleViaFunction: vi.fn(),
	updatePlayoffsViaFunction: vi.fn(),
	toastSuccess: vi.fn(),
	toastInfo: vi.fn(),
	toastError: vi.fn(),
	toastWarning: vi.fn(),
}))

vi.mock('@/firebase/collections/functions', () => ({
	generateScheduleViaFunction,
	updatePlayoffsViaFunction,
}))

vi.mock('sonner', () => ({
	toast: {
		success: toastSuccess,
		info: toastInfo,
		error: toastError,
		warning: toastWarning,
	},
}))

import { SeasonScheduleCard } from './season-schedule-card'

const season = (
	overrides: Partial<SeasonDocument> = {}
): SeasonDocument & { id: string } =>
	({
		id: 'season-5',
		name: 'Season 5',
		...overrides,
	}) as SeasonDocument & { id: string }

/** Two nights' worth of a preview, enough to read back. */
const PREVIEW = {
	seasonId: 'season-5',
	regularNights: ['2026-11-07', '2026-11-14'],
	poolNight: '2026-12-12',
	championshipNight: '2026-12-19',
	games: [
		{
			date: '2026-11-08T00:00:00.000Z',
			night: '2026-11-07',
			field: 1,
			type: 'regular',
			homeTeamId: 'a',
			homeName: 'Chao World',
			awayTeamId: 'b',
			awayName: 'Goop',
		},
		{
			date: '2026-11-15T02:15:00.000Z',
			night: '2026-11-14',
			field: 3,
			type: 'regular',
			homeTeamId: 'c',
			homeName: 'Squall',
			awayTeamId: 'd',
			awayName: 'nOPE',
		},
	],
}

beforeEach(() => {
	vi.clearAllMocks()
})

describe('SeasonScheduleCard', () => {
	it('shows nothing for a Swiss season', () => {
		const { container } = render(
			<SeasonScheduleCard
				season={season({ format: SeasonFormat.SWISS })}
				gameCount={0}
			/>
		)
		expect(container).toBeEmptyDOMElement()
	})

	it('shows nothing for a season already scheduled by hand', () => {
		const { container } = render(
			<SeasonScheduleCard season={season()} gameCount={48} />
		)
		expect(container).toBeEmptyDOMElement()
	})

	it('creates nothing until the admin has reviewed every game', async () => {
		generateScheduleViaFunction.mockResolvedValue(PREVIEW)
		render(<SeasonScheduleCard season={season()} gameCount={0} />)

		await userEvent.click(
			screen.getByRole('button', { name: 'Preview schedule' })
		)

		expect(generateScheduleViaFunction).toHaveBeenCalledWith({
			seasonId: 'season-5',
			dryRun: true,
		})
		const dialog = await screen.findByRole('dialog')
		const firstNight = within(dialog).getByRole('region', {
			name: 'Saturday, November 7',
		})
		expect(within(firstNight).getByText('Chao World')).toBeInTheDocument()
		// Minneapolis time, whatever the browser's zone.
		expect(within(firstNight).getByText('6:00 PM')).toBeInTheDocument()
		expect(within(firstNight).queryByText('Squall')).not.toBeInTheDocument()
		expect(
			within(dialog).getByText(/Saturday, December 12/)
		).toBeInTheDocument()

		await userEvent.click(
			within(dialog).getByRole('button', { name: 'Create 2 games' })
		)
		expect(generateScheduleViaFunction).toHaveBeenLastCalledWith({
			seasonId: 'season-5',
		})
		await waitFor(() =>
			expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
		)
		expect(toastSuccess).toHaveBeenCalledWith(
			'Schedule created',
			expect.anything()
		)
	})

	it('says why the schedule cannot be generated', async () => {
		generateScheduleViaFunction.mockRejectedValue(
			Object.assign(new Error('needs 12'), {
				code: 'functions/failed-precondition',
				message: 'A schedule needs 12 registered teams; this season has 11.',
			})
		)
		render(<SeasonScheduleCard season={season()} gameCount={0} />)

		await userEvent.click(
			screen.getByRole('button', { name: 'Preview schedule' })
		)

		await waitFor(() => expect(toastError).toHaveBeenCalled())
		expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
	})

	it('says what the automatic playoffs are waiting for', async () => {
		updatePlayoffsViaFunction.mockResolvedValue({
			seasonId: 'season-5',
			created: 0,
			updated: 0,
			placementsSet: 0,
			conflicts: [],
			kept: [],
			waitingFor: 'every regular-season game to have a score',
		})
		render(
			<SeasonScheduleCard
				season={season({ automaticPlayoffs: true })}
				gameCount={48}
			/>
		)

		await userEvent.click(
			screen.getByRole('button', { name: /Update playoffs now/ })
		)

		await waitFor(() =>
			expect(toastInfo).toHaveBeenCalledWith('Playoffs are up to date', {
				description: 'Waiting for every regular-season game to have a score.',
			})
		)
	})

	it('reports what an update created, any slot a hand-made game holds, and any pairing kept', async () => {
		updatePlayoffsViaFunction.mockResolvedValue({
			seasonId: 'season-5',
			created: 11,
			updated: 0,
			placementsSet: 0,
			conflicts: ['pool-r1-f1'],
			kept: ['pool-r3-f2'],
			waitingFor: 'every pool-night game to have a score',
		})
		render(
			<SeasonScheduleCard
				season={season({ automaticPlayoffs: true })}
				gameCount={48}
			/>
		)

		await userEvent.click(
			screen.getByRole('button', { name: /Update playoffs now/ })
		)

		await waitFor(() =>
			expect(toastSuccess).toHaveBeenCalledWith('Playoffs updated', {
				description: '11 games created, 0 re-paired, 0 placements set.',
			})
		)
		expect(toastWarning).toHaveBeenCalledWith(
			'Some playoff games kept their pairing',
			expect.objectContaining({
				description: expect.stringContaining('pool-r3-f2'),
			})
		)
		expect(toastWarning).toHaveBeenCalledWith(
			'Some playoff games were not created',
			expect.objectContaining({
				description: expect.stringContaining('pool-r1-f1'),
			})
		)
	})
})
