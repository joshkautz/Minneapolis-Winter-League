import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Timestamp, type DocumentReference } from 'firebase/firestore'

/**
 * The captain's waiver reminder: it counts this season's unsigned
 * teammates (never the captain), sends through the callable, and once the
 * team has sent a round it says so until a day has passed, rather than
 * offering a click the server would refuse.
 */

const { remindUnsignedTeammatesViaFunction, toastSuccess, toastError } =
	vi.hoisted(() => ({
		remindUnsignedTeammatesViaFunction: vi.fn(),
		toastSuccess: vi.fn(),
		toastError: vi.fn(),
	}))

vi.mock('@/firebase/collections/functions', () => ({
	remindUnsignedTeammatesViaFunction,
}))
vi.mock('sonner', () => ({
	toast: { success: toastSuccess, error: toastError },
}))

const SEASON = 'season-5'
const playerSeason = (playerId: string, seasonId: string, signed: boolean) => ({
	id: seasonId,
	ref: { parent: { parent: { id: playerId } } },
	data: () => ({ signed }),
})
let rosterSeasons: ReturnType<typeof playerSeason>[] = []

vi.mock('react-firebase-hooks/firestore', () => ({
	useCollection: () => [{ docs: rosterSeasons }, false, undefined],
}))
vi.mock('@/firebase/collections/players', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/firebase/collections/players')>()),
	playerSeasonsOnTeamQuery: () => ({}),
}))

const { WaiverReminderButton } = await import('./waiver-reminder-button')

const teamRef = { id: 'team-1' } as DocumentReference

const renderButton = (sentAt: Timestamp | null = null) =>
	render(
		<WaiverReminderButton
			teamRef={teamRef}
			seasonId={SEASON}
			selfId='captain'
			sentAt={sentAt}
		/>
	)

beforeEach(() => {
	vi.clearAllMocks()
	rosterSeasons = [
		playerSeason('captain', SEASON, false),
		playerSeason('signed', SEASON, true),
		playerSeason('unsigned-1', SEASON, false),
		playerSeason('unsigned-2', SEASON, false),
		// The same player's season on this team last year.
		playerSeason('unsigned-1', 'season-4', false),
	]
})

describe('WaiverReminderButton', () => {
	it('counts this season’s unsigned teammates, not the captain', () => {
		renderButton()

		expect(
			screen.getByRole('button', { name: 'Remind 2 unsigned teammates' })
		).toBeEnabled()
	})

	it('shows nothing when everyone else has signed', () => {
		rosterSeasons = [
			playerSeason('captain', SEASON, false),
			playerSeason('signed', SEASON, true),
		]
		const { container } = renderButton()

		expect(container).toBeEmptyDOMElement()
	})

	it('sends the reminder for the team and says how many', async () => {
		remindUnsignedTeammatesViaFunction.mockResolvedValue({
			sent: 2,
			nextReminderAt: new Date().toISOString(),
		})
		renderButton()

		await userEvent.click(
			screen.getByRole('button', { name: 'Remind 2 unsigned teammates' })
		)

		expect(remindUnsignedTeammatesViaFunction).toHaveBeenCalledWith({
			teamId: 'team-1',
		})
		expect(toastSuccess).toHaveBeenCalledWith('Reminder sent', {
			description:
				'2 teammates who haven’t signed the waiver will get an email.',
		})
	})

	it('passes on why the server refused', async () => {
		remindUnsignedTeammatesViaFunction.mockRejectedValue(
			Object.assign(
				new Error('Your teammates were last reminded on Thursday at 7:42 PM.'),
				{ code: 'functions/resource-exhausted' }
			)
		)
		renderButton()

		await userEvent.click(screen.getByRole('button', { name: /Remind 2/ }))

		expect(toastError).toHaveBeenCalledWith('Reminder not sent', {
			description: 'Your teammates were last reminded on Thursday at 7:42 PM.',
		})
	})

	it('waits a day after a send, and says when the next can go', () => {
		renderButton(Timestamp.fromMillis(Date.now() - 60 * 60 * 1000))

		expect(screen.getByRole('button', { name: 'Reminder sent' })).toBeDisabled()
		expect(screen.getByText(/You can send another after/)).toBeInTheDocument()
	})

	it('offers it again once the day is up', () => {
		renderButton(Timestamp.fromMillis(Date.now() - 25 * 60 * 60 * 1000))

		expect(
			screen.getByRole('button', { name: 'Remind 2 unsigned teammates' })
		).toBeEnabled()
	})
})
