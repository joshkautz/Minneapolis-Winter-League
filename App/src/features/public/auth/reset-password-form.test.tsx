import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * "Forgot password?" asks the league for the email, and says the same
 * thing whether or not an account uses the address.
 */

const { requestPasswordResetViaFunction, toastSuccess } = vi.hoisted(() => ({
	requestPasswordResetViaFunction: vi.fn(),
	toastSuccess: vi.fn(),
}))
vi.mock('@/firebase/collections/functions', () => ({
	requestPasswordResetViaFunction,
}))
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: vi.fn() } }))

const { ResetPasswordForm } = await import('./reset-password-form')

beforeEach(() => {
	vi.clearAllMocks()
	requestPasswordResetViaFunction.mockResolvedValue({ success: true })
})

describe('ResetPasswordForm', () => {
	it('asks the league to send the link, and never says whether it exists', async () => {
		const onSuccess = vi.fn()
		render(<ResetPasswordForm onSuccess={onSuccess} onBack={vi.fn()} />)

		await userEvent.type(screen.getByLabelText('Email'), 'pat@example.com')
		await userEvent.click(screen.getByRole('button', { name: /reset|send/i }))

		expect(requestPasswordResetViaFunction).toHaveBeenCalledWith({
			email: 'pat@example.com',
		})
		expect(toastSuccess).toHaveBeenCalledWith('Check your email', {
			description: expect.stringMatching(/^If an account uses that address/),
		})
		expect(onSuccess).toHaveBeenCalled()
	})
})
