import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

/**
 * What the leave and remove confirmations say about money, which has to
 * match what settlement then does.
 */

let season: Record<string, unknown> | undefined
let registered: boolean

vi.mock('@/providers', () => ({
	useSeasonsContext: () => ({
		currentSeasonQueryDocumentSnapshot: { data: () => season },
	}),
	useTeamsContext: () => ({
		currentSeasonTeamsQuerySnapshot: {
			docs: [
				{
					ref: { parent: { parent: { id: 'team-1' } } },
					data: () => ({ registered }),
				},
			],
		},
	}),
}))

vi.mock('@/shared/hooks/use-user-status', () => ({
	useUserStatus: () => ({ currentSeasonData: { team: { id: 'team-1' } } }),
}))

const { useDeparturePaymentNote } = await import('./use-departure-payment-note')

beforeEach(() => {
	season = { teamRegistrationTotalCents: 100_000 }
	registered = false
})

describe('useDeparturePaymentNote', () => {
	it('tells a leaver their money comes back before the team registers', () => {
		const { result } = renderHook(() => useDeparturePaymentNote())
		expect(result.current).toBe(
			"Anything you paid toward the team's registration is released or refunded in full."
		)
	})

	it('names the player a captain is removing', () => {
		const { result } = renderHook(() => useDeparturePaymentNote('Pat'))
		expect(result.current).toMatch(/^Anything Pat paid .* released/)
	})

	it('says the money stays once the team has registered', () => {
		registered = true
		const { result } = renderHook(() => useDeparturePaymentNote())
		expect(result.current).toBe(
			'The team has registered, so anything you paid toward it stays with the team.'
		)
	})

	it('says nothing in a season without team payments', () => {
		season = {}
		const { result } = renderHook(() => useDeparturePaymentNote())
		expect(result.current).toBeNull()
	})
})
