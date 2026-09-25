import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Timestamp } from 'firebase/firestore'

/**
 * What a player sees when their team pays collectively: how much is
 * committed, what they may put in, and what the hold on their card means.
 * The server decides everything that matters; this pins that the page
 * explains it honestly and never offers what the server would refuse.
 */

const { startTeamContribution, toastError } = vi.hoisted(() => ({
	startTeamContribution: vi.fn(),
	toastError: vi.fn(),
}))

vi.mock('@/firebase', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/firebase')>()),
	startTeamContribution,
}))

vi.mock('sonner', () => ({
	toast: { success: vi.fn(), error: toastError, info: vi.fn() },
}))

const SEASON = 'season-1'
const TEAM = 'team-1'
const TOTAL = 100_000
const DAY_MS = 24 * 60 * 60 * 1000

type Contribution = { amountCents: number; status: string; payer?: string }

/** The roster: contributors `payer-0`, `payer-1`… are all on it. */
const ROSTER_SIZE = 11

let season: Record<string, unknown>
let teamSeason: Record<string, unknown>
let contributions: Contribution[]
let signedCount: number
let userStatus: { isAdmin: boolean; isBanned: boolean }

vi.mock('@/providers', () => ({
	useSeasonsContext: () => ({
		currentSeasonQueryDocumentSnapshot: { id: SEASON, data: () => season },
	}),
	useTeamsContext: () => ({
		currentSeasonTeamsQuerySnapshot: {
			docs: [
				{ ref: { parent: { parent: { id: TEAM } } }, data: () => teamSeason },
			],
		},
	}),
}))

vi.mock('@/shared/hooks/use-user-status', () => ({
	useUserStatus: () => ({
		currentSeasonData: { team: { id: TEAM } },
		...userStatus,
	}),
}))

vi.mock('@/firebase/collections/teams', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/firebase/collections/teams')>()),
	teamContributionsQuery: () => ({ kind: 'contributions' }),
}))

vi.mock('@/firebase/collections/players', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/firebase/collections/players')>()),
	playerSeasonsOnTeamQuery: () => ({ kind: 'playerSeasons' }),
}))

vi.mock('react-firebase-hooks/firestore', () => ({
	useCollection: (query: { kind?: string } | undefined) => {
		if (query?.kind === 'contributions') {
			return [
				{
					docs: contributions.map((contribution, index) => ({
						id: `pi_${index}`,
						data: () => ({
							player: { id: contribution.payer ?? `payer-${index}` },
							createdAt: Timestamp.now(),
							paymentIntentId: `pi_${index}`,
							amountCents: contribution.amountCents,
							status: contribution.status,
						}),
					})),
				},
				false,
				undefined,
			]
		}
		if (query?.kind === 'playerSeasons') {
			return [
				{
					docs: Array.from({ length: ROSTER_SIZE }, (_, index) => ({
						// A player-season's id is its season; its parent is the player.
						id: SEASON,
						ref: { parent: { parent: { id: `payer-${index}` } } },
						data: () => ({ signed: index < signedCount }),
					})),
				},
				false,
				undefined,
			]
		}
		return [undefined, false, undefined]
	},
	useDocument: () => [
		{ data: () => ({ firstname: 'Pat', lastname: 'Lee' }) },
		false,
		undefined,
	],
}))

const { TeamPaymentCard } = await import('./team-payment-card')

const openSeason = (overrides: Record<string, unknown> = {}) => ({
	name: '2026 Fall',
	teamRegistrationTotalCents: TOTAL,
	registrationStart: Timestamp.fromMillis(Date.now() - DAY_MS),
	registrationEnd: Timestamp.fromMillis(Date.now() + 30 * DAY_MS),
	registeredTeamCount: 0,
	...overrides,
})

const beforeOpening = () =>
	openSeason({
		registrationStart: Timestamp.fromMillis(Date.now() + 7 * DAY_MS),
	})

const contributeButton = () =>
	screen.getByRole('button', { name: /Contribute|Opening Stripe/ })
const amountInput = () => screen.getByLabelText('Amount (dollars)')

beforeEach(() => {
	vi.clearAllMocks()
	season = openSeason()
	teamSeason = { name: 'Frostbite', registered: false }
	contributions = []
	signedCount = 0
	userStatus = { isAdmin: false, isBanned: false }
	startTeamContribution.mockResolvedValue(null)
})

describe('TeamPaymentCard', () => {
	describe('what the team has committed', () => {
		it('counts holds and captures, and not money given back', () => {
			contributions = [
				{ amountCents: 40_000, status: 'authorized' },
				{ amountCents: 20_000, status: 'captured' },
				{ amountCents: 30_000, status: 'canceled' },
				{ amountCents: 10_000, status: 'refunded' },
			]
			render(<TeamPaymentCard />)

			expect(screen.getByText('$600 of $1,000')).toBeInTheDocument()
			// Offered the rest first, and never more than is owed.
			expect(
				screen.getByRole('button', { name: 'All $400' })
			).toBeInTheDocument()
		})

		it('does not count a teammate who has left', () => {
			// Their hold is being released, as on the server.
			contributions = [
				{ amountCents: 60_000, status: 'authorized', payer: 'departed' },
				{ amountCents: 30_000, status: 'authorized' },
			]
			render(<TeamPaymentCard />)

			expect(screen.getByText('$300 of $1,000')).toBeInTheDocument()
			expect(
				screen.getByRole('button', { name: 'All $700' })
			).toBeInTheDocument()
		})

		it('counts all of a registered team’s money, since that is final', () => {
			teamSeason = { name: 'Frostbite', registered: true }
			contributions = [
				{ amountCents: 40_000, status: 'captured', payer: 'departed' },
				{ amountCents: 60_000, status: 'captured' },
			]
			render(<TeamPaymentCard />)

			expect(screen.getByText('$1,000 of $1,000')).toBeInTheDocument()
		})

		it('shows how many players have signed', () => {
			signedCount = 7
			render(<TeamPaymentCard />)

			expect(screen.getByText('7 of 10')).toBeInTheDocument()
		})

		it('lists every contribution with its payer', () => {
			contributions = [{ amountCents: 25_000, status: 'authorized' }]
			render(<TeamPaymentCard />)

			const row = screen.getByText('Pat Lee').closest('li')
			expect(row).toHaveTextContent('$250')
			expect(row).toHaveTextContent('Authorized')
		})
	})

	describe('contributing', () => {
		it('starts Checkout for the amount chosen', async () => {
			const user = userEvent.setup()
			render(<TeamPaymentCard />)

			await user.click(screen.getByRole('button', { name: '$250' }))
			await user.click(contributeButton())

			expect(startTeamContribution).toHaveBeenCalledWith(25_000)
		})

		it('refuses more than the team still needs before asking the server', async () => {
			contributions = [{ amountCents: 90_000, status: 'authorized' }]
			const user = userEvent.setup()
			render(<TeamPaymentCard />)

			await user.clear(amountInput())
			await user.type(amountInput(), '200')

			expect(
				screen.getByText('Your team only needs $100 more.')
			).toBeInTheDocument()
			expect(contributeButton()).toBeDisabled()
		})

		it('refuses less than the minimum', async () => {
			const user = userEvent.setup()
			render(<TeamPaymentCard />)

			await user.clear(amountInput())
			await user.type(amountInput(), '5')

			expect(contributeButton()).toBeDisabled()
			expect(
				screen.getByText(/minimum contribution is \$10\./)
			).toBeInTheDocument()
		})

		it('says why when Checkout could not be opened, and can be tried again', async () => {
			startTeamContribution.mockResolvedValue(
				'Every spot this season has been taken'
			)
			const user = userEvent.setup()
			render(<TeamPaymentCard />)

			await user.click(contributeButton())

			expect(toastError).toHaveBeenCalledWith('Could not start the payment', {
				description: 'Every spot this season has been taken',
			})
			expect(contributeButton()).toBeEnabled()
		})

		it('cannot open Checkout twice', async () => {
			startTeamContribution.mockReturnValue(new Promise(() => {}))
			const user = userEvent.setup()
			render(<TeamPaymentCard />)

			await user.click(contributeButton())
			await user.click(contributeButton())

			expect(startTeamContribution).toHaveBeenCalledTimes(1)
			expect(contributeButton()).toHaveTextContent('Opening Stripe...')
		})

		it('can be tried again after Back from Stripe restores the page', async () => {
			startTeamContribution.mockReturnValue(new Promise(() => {}))
			const user = userEvent.setup()
			render(<TeamPaymentCard />)
			await user.click(contributeButton())

			act(() => {
				const event = new Event('pageshow') as PageTransitionEvent
				Object.defineProperty(event, 'persisted', { value: true })
				window.dispatchEvent(event)
			})

			await waitFor(() => expect(contributeButton()).toBeEnabled())
		})
	})

	describe('what the payer is told about the hold', () => {
		it('says the card may be charged early, and never promises no charge', () => {
			render(<TeamPaymentCard />)

			expect(
				screen.getByText(/charged when your team registers/)
			).toBeInTheDocument()
			expect(
				screen.getByText(/charged early rather than allowed to lapse/)
			).toBeInTheDocument()
			expect(screen.queryByText(/never charged/)).not.toBeInTheDocument()
		})

		it('says money is refunded once the season fills', () => {
			season = openSeason({ registeredTeamCount: 12 })
			render(<TeamPaymentCard />)

			expect(
				screen.getByText(/All 12 spots have been taken/)
			).toBeInTheDocument()
			expect(
				screen.getByText(/anything already charged is refunded in full/)
			).toBeInTheDocument()
			expect(
				screen.queryByLabelText('Amount (dollars)')
			).not.toBeInTheDocument()
		})
	})

	describe('before registration opens', () => {
		beforeEach(() => {
			season = beforeOpening()
		})

		it('offers a player nothing to pay yet', () => {
			render(<TeamPaymentCard />)

			expect(
				screen.getByText(/Contributions open with registration on/)
			).toBeInTheDocument()
			expect(
				screen.queryByLabelText('Amount (dollars)')
			).not.toBeInTheDocument()
		})

		it('lets an admin contribute early, warning that it is a real hold', async () => {
			userStatus = { isAdmin: true, isBanned: false }
			const user = userEvent.setup()
			render(<TeamPaymentCard />)

			expect(
				screen.getByText(/As an admin you can contribute early to test/)
			).toBeInTheDocument()
			expect(
				screen.getByText(/within six days, or it is charged/)
			).toBeInTheDocument()

			await user.clear(amountInput())
			await user.type(amountInput(), '10')
			await user.click(contributeButton())

			expect(startTeamContribution).toHaveBeenCalledWith(1_000)
		})
	})

	it('shows a registered team as registered, with nothing to pay', () => {
		teamSeason = { name: 'Frostbite', registered: true }
		render(<TeamPaymentCard />)

		expect(
			screen.getByText('Your team is registered for 2026 Fall.')
		).toBeInTheDocument()
		expect(screen.queryByLabelText('Amount (dollars)')).not.toBeInTheDocument()
	})

	it('tells a fully funded team what is left', () => {
		contributions = [{ amountCents: TOTAL, status: 'authorized' }]
		render(<TeamPaymentCard />)

		expect(
			screen.getByText(/committed the full amount. It registers as soon as 10/)
		).toBeInTheDocument()
	})

	it('offers a banned player no way to pay', () => {
		userStatus = { isAdmin: false, isBanned: true }
		render(<TeamPaymentCard />)

		expect(screen.queryByLabelText('Amount (dollars)')).not.toBeInTheDocument()
	})
})
