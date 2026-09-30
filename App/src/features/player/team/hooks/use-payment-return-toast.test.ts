import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

/**
 * What a payer is told on coming back from Stripe's page. Mounted by the
 * team page, so it also reaches a payer whose team was removed while they
 * were paying and who has no payment card to show it on.
 */

const { cancelTeamContribution, toastSuccess, toastInfo } = vi.hoisted(() => ({
	cancelTeamContribution: vi.fn(),
	toastSuccess: vi.fn(),
	toastInfo: vi.fn(),
}))

vi.mock('@/firebase/collections/payments', () => ({ cancelTeamContribution }))
vi.mock('sonner', () => ({
	toast: { success: toastSuccess, info: toastInfo, error: vi.fn() },
}))

const { usePaymentReturnToast } = await import('./use-payment-return-toast')

const returnWith = (status: string) =>
	window.history.replaceState({}, '', `/manage?payment=${status}`)

beforeEach(() => {
	cancelTeamContribution.mockReset()
	toastSuccess.mockReset()
	toastInfo.mockReset()
	window.history.replaceState({}, '', '/manage')
})

describe('usePaymentReturnToast', () => {
	it('thanks a payer still on their team', () => {
		returnWith('success')
		renderHook(() => usePaymentReturnToast({ isLoading: false, onTeam: true }))

		expect(toastSuccess).toHaveBeenCalledWith(
			'Payment received',
			expect.anything()
		)
		expect(cancelTeamContribution).not.toHaveBeenCalled()
		expect(window.location.search).toBe('')
	})

	it('tells a payer whose team is gone that the payment is being refunded', () => {
		returnWith('success')
		renderHook(() => usePaymentReturnToast({ isLoading: false, onTeam: false }))

		expect(toastSuccess).not.toHaveBeenCalled()
		expect(toastInfo).toHaveBeenCalledWith(
			'Payment received, and being refunded',
			expect.objectContaining({
				description: expect.stringMatching(/no longer in the season/),
			})
		)
	})

	it('frees the payer’s reservation when they come back without paying', () => {
		returnWith('cancel')
		renderHook(() => usePaymentReturnToast({ isLoading: false, onTeam: true }))

		expect(cancelTeamContribution).toHaveBeenCalledTimes(1)
		expect(window.location.search).toBe('')
	})

	it('waits until it knows whether the payer is on a team', () => {
		returnWith('success')
		const { rerender } = renderHook(
			({ isLoading }) => usePaymentReturnToast({ isLoading, onTeam: true }),
			{ initialProps: { isLoading: true } }
		)
		expect(toastSuccess).not.toHaveBeenCalled()

		rerender({ isLoading: false })
		expect(toastSuccess).toHaveBeenCalledTimes(1)
	})

	it('tells the payer once, however often the page re-renders', () => {
		returnWith('success')
		const { rerender } = renderHook(
			({ onTeam }) => usePaymentReturnToast({ isLoading: false, onTeam }),
			{ initialProps: { onTeam: true } }
		)
		rerender({ onTeam: false })

		expect(toastSuccess).toHaveBeenCalledTimes(1)
		expect(toastInfo).not.toHaveBeenCalled()
	})

	it('says nothing on an ordinary visit', () => {
		renderHook(() => usePaymentReturnToast({ isLoading: false, onTeam: true }))

		expect(toastSuccess).not.toHaveBeenCalled()
		expect(toastInfo).not.toHaveBeenCalled()
	})
})
