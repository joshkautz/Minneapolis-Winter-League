import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * "Send Verification Email" on the profile. Within ten minutes of the last
 * one the league sends nothing more, and the button says when the last
 * went, where to look, and when another can be sent.
 */

const { sendVerificationEmailViaFunction, toastSuccess, toastInfo } =
	vi.hoisted(() => ({
		sendVerificationEmailViaFunction: vi.fn(),
		toastSuccess: vi.fn(),
		toastInfo: vi.fn(),
	}))

vi.mock('@/firebase/collections/functions', () => ({
	sendVerificationEmailViaFunction,
}))
vi.mock('sonner', () => ({
	toast: { success: toastSuccess, info: toastInfo, error: vi.fn() },
}))
vi.mock('@/providers', () => ({
	useAuthContext: () => ({
		authStateUser: { uid: 'player-1' },
		refreshUser: vi.fn(),
	}),
}))

const { EmailVerificationSection } =
	await import('./email-verification-section')

const renderSection = () =>
	render(
		<EmailVerificationSection
			isVerified={false}
			isLoading={false}
			isAuthenticatedUserBanned={false}
		/>
	)

beforeEach(() => {
	vi.clearAllMocks()
})

describe('EmailVerificationSection', () => {
	it('sends the email and says so', async () => {
		sendVerificationEmailViaFunction.mockResolvedValue({
			alreadyVerified: false,
			sent: true,
			lastSentAt: '2026-10-28T14:01:56Z',
			nextAllowedAt: '2026-10-28T14:11:56Z',
		})
		renderSection()

		await userEvent.click(
			screen.getByRole('button', { name: /Send Verification Email/ })
		)

		expect(toastSuccess).toHaveBeenCalledWith(
			'Verification email sent!',
			expect.anything()
		)
	})

	it('says when the last one went, rather than sending another', async () => {
		sendVerificationEmailViaFunction.mockResolvedValue({
			alreadyVerified: false,
			sent: false,
			lastSentAt: '2026-10-28T13:59:10Z',
			nextAllowedAt: '2026-10-28T14:09:10Z',
		})
		renderSection()

		await userEvent.click(
			screen.getByRole('button', { name: /Send Verification Email/ })
		)

		expect(toastSuccess).not.toHaveBeenCalled()
		expect(toastInfo).toHaveBeenCalledWith(
			'A verification email is already on its way',
			{
				description:
					'We sent one at 8:59 AM. Check your spam folder if it isn’t in your inbox. You can ask for another after 9:09 AM.',
			}
		)
	})
})
