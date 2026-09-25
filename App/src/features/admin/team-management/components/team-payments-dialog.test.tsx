import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Timestamp } from 'firebase/firestore'

/**
 * The admin's refund for one team payment: the only way to give money back
 * by hand, so it has to name what it refunds, demand a reason for the
 * record, and stay put until Stripe has answered.
 */

const { refundTeamContributionViaFunction, toastSuccess, toastError } =
	vi.hoisted(() => ({
		refundTeamContributionViaFunction: vi.fn(),
		toastSuccess: vi.fn(),
		toastError: vi.fn(),
	}))

vi.mock('@/firebase/collections/functions', () => ({
	refundTeamContributionViaFunction,
}))

vi.mock('sonner', () => ({
	toast: { success: toastSuccess, error: toastError },
}))

vi.mock('@/firebase/collections/teams', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/firebase/collections/teams')>()),
	teamContributionsQuery: () => ({ kind: 'contributions' }),
}))

const contribution = (id: string, amountCents: number, status: string) => ({
	id,
	data: () => ({
		player: { id: `payer-${id}` },
		amountCents,
		status,
		paymentIntentId: id,
		createdAt: Timestamp.now(),
	}),
})

let contributions: ReturnType<typeof contribution>[]

vi.mock('react-firebase-hooks/firestore', () => ({
	useCollection: (query: unknown) =>
		query ? [{ docs: contributions }, false, undefined] : [undefined, false],
	useDocument: () => [
		{ data: () => ({ firstname: 'Pat', lastname: 'Lee' }) },
		false,
		undefined,
	],
}))

const { TeamPaymentsDialog } = await import('./team-payments-dialog')

const renderDialog = () =>
	render(
		<TeamPaymentsDialog
			open
			onOpenChange={() => {}}
			teamId='team-1'
			teamName='Frostbite'
			seasonId='season-1'
		/>
	)

const refundDialog = () => screen.getByRole('dialog', { name: /Refund this/ })

beforeEach(() => {
	vi.clearAllMocks()
	contributions = [
		contribution('pi_1', 60_000, 'paid'),
		contribution('pi_2', 40_000, 'refunded'),
	]
	refundTeamContributionViaFunction.mockResolvedValue({ success: true })
})

describe('TeamPaymentsDialog', () => {
	it('shows what the team still holds', () => {
		renderDialog()
		expect(screen.getByText('$600 paid and not refunded.')).toBeInTheDocument()
	})

	it('offers a refund only for a payment not yet refunded', () => {
		renderDialog()
		expect(screen.getAllByRole('button', { name: 'Refund' })).toHaveLength(1)
	})

	it('refunds with the reason given, and says so', async () => {
		const user = userEvent.setup()
		renderDialog()

		await user.click(screen.getByRole('button', { name: 'Refund' }))
		const dialog = refundDialog()
		expect(dialog).toHaveTextContent('Refunds $600 to the payer.')
		const confirm = within(dialog).getByRole('button', { name: 'Refund' })
		expect(confirm).toBeDisabled()

		await user.type(within(dialog).getByLabelText('Reason'), 'Test payment.')
		await user.click(confirm)

		expect(refundTeamContributionViaFunction).toHaveBeenCalledWith({
			teamId: 'team-1',
			seasonId: 'season-1',
			paymentIntentId: 'pi_1',
			reason: 'Test payment.',
		})
		expect(toastSuccess).toHaveBeenCalledWith('Payment refunded', {
			description: '$600 back to the payer.',
		})
		await waitFor(() =>
			expect(
				screen.queryByRole('dialog', { name: /Refund this/ })
			).not.toBeInTheDocument()
		)
	})

	it('says why when Stripe refuses, and stays open to try again', async () => {
		refundTeamContributionViaFunction.mockRejectedValue(
			new Error('Stripe could not refund this payment')
		)
		const user = userEvent.setup()
		renderDialog()

		await user.click(screen.getByRole('button', { name: 'Refund' }))
		await user.type(within(refundDialog()).getByLabelText('Reason'), 'Test.')
		await user.click(
			within(refundDialog()).getByRole('button', { name: 'Refund' })
		)

		expect(toastError).toHaveBeenCalledWith('Could not refund this payment', {
			description: 'Stripe could not refund this payment',
		})
		expect(refundDialog()).toBeInTheDocument()
	})

	it('cannot be dismissed or sent twice while the refund is running', async () => {
		let finish: () => void = () => {}
		refundTeamContributionViaFunction.mockReturnValue(
			new Promise((resolve) => {
				finish = () => resolve({ success: true })
			})
		)
		const user = userEvent.setup()
		renderDialog()
		await user.click(screen.getByRole('button', { name: 'Refund' }))
		await user.type(within(refundDialog()).getByLabelText('Reason'), 'Test.')

		await user.click(
			within(refundDialog()).getByRole('button', { name: 'Refund' })
		)
		await user.keyboard('{Escape}')

		expect(refundDialog()).toBeInTheDocument()
		expect(
			within(refundDialog()).getByRole('button', { name: /Refunding/ })
		).toBeDisabled()
		expect(
			within(refundDialog()).getByRole('button', { name: 'Cancel' })
		).toBeDisabled()
		expect(refundTeamContributionViaFunction).toHaveBeenCalledTimes(1)

		finish()
		await waitFor(() =>
			expect(
				screen.queryByRole('dialog', { name: /Refund this/ })
			).not.toBeInTheDocument()
		)
	})
})
