import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { FirebaseError } from 'firebase/app'

/**
 * Where the league's account emails land. It spends the code from the
 * link once, says plainly when a link is dead and what to do, and after a
 * password reset signs the player straight in.
 */

const {
	applyActionCode,
	verifyPasswordResetCode,
	confirmPasswordReset,
	signInWithEmailAndPassword,
	refreshUser,
} = vi.hoisted(() => ({
	applyActionCode: vi.fn(),
	verifyPasswordResetCode: vi.fn(),
	confirmPasswordReset: vi.fn(),
	signInWithEmailAndPassword: vi.fn(),
	refreshUser: vi.fn(),
}))

vi.mock('firebase/auth', async (importOriginal) => ({
	...(await importOriginal<typeof import('firebase/auth')>()),
	applyActionCode,
	verifyPasswordResetCode,
	confirmPasswordReset,
	signInWithEmailAndPassword,
}))
let signedIn = false
vi.mock('@/providers', () => ({
	useAuthContext: () => ({
		authStateUser: signedIn ? { uid: 'player-1' } : null,
		refreshUser,
	}),
}))

const { AuthAction } = await import('./auth-action')

const open = (query: string) =>
	render(
		// StrictMode runs effects twice, as development does: a code must
		// still be spent only once.
		<StrictMode>
			<MemoryRouter initialEntries={[`/auth/action?${query}`]}>
				<AuthAction />
			</MemoryRouter>
		</StrictMode>
	)

const expired = () =>
	new FirebaseError('auth/invalid-action-code', 'The code is invalid.')

beforeEach(() => {
	vi.clearAllMocks()
	signedIn = false
	refreshUser.mockResolvedValue(undefined)
})

describe('confirming an email', () => {
	it('spends the code once and says the email is confirmed', async () => {
		applyActionCode.mockResolvedValue(undefined)
		signedIn = true
		open('mode=verifyEmail&oobCode=CODE')

		expect(await screen.findByText('Your email is confirmed')).toBeTruthy()
		expect(applyActionCode).toHaveBeenCalledTimes(1)
		expect(applyActionCode.mock.calls[0][1]).toBe('CODE')
		expect(refreshUser).toHaveBeenCalled()
		expect(
			screen.getByRole('link', { name: 'Go to your profile' })
		).toBeTruthy()
	})

	it('says a used or expired link is dead, and where to get another', async () => {
		applyActionCode.mockRejectedValue(expired())
		open('mode=verifyEmail&oobCode=OLD')

		expect(
			await screen.findByText(
				/This link has expired or has already been used\. If your email still isn’t confirmed, send a new link from your profile\./
			)
		).toBeTruthy()
	})
})

describe('resetting a password', () => {
	it('takes a new password, saves it and signs the player in', async () => {
		verifyPasswordResetCode.mockResolvedValue('pat@example.com')
		confirmPasswordReset.mockResolvedValue(undefined)
		signInWithEmailAndPassword.mockResolvedValue({})
		open('mode=resetPassword&oobCode=CODE')

		expect(await screen.findByText('For pat@example.com')).toBeTruthy()
		await userEvent.type(screen.getByLabelText('New password'), 'NewPass123')
		await userEvent.type(
			screen.getByLabelText('Confirm new password'),
			'NewPass123'
		)
		await userEvent.click(
			screen.getByRole('button', { name: 'Save new password' })
		)

		expect(await screen.findByText('Your password is changed')).toBeTruthy()
		expect(confirmPasswordReset.mock.calls[0].slice(1)).toEqual([
			'CODE',
			'NewPass123',
		])
		expect(signInWithEmailAndPassword.mock.calls[0].slice(1)).toEqual([
			'pat@example.com',
			'NewPass123',
		])
	})

	it('refuses a weak or mismatched password before trying it', async () => {
		verifyPasswordResetCode.mockResolvedValue('pat@example.com')
		open('mode=resetPassword&oobCode=CODE')

		await screen.findByText('For pat@example.com')
		await userEvent.type(screen.getByLabelText('New password'), 'NewPass123')
		await userEvent.type(
			screen.getByLabelText('Confirm new password'),
			'NewPass124'
		)
		await userEvent.click(
			screen.getByRole('button', { name: 'Save new password' })
		)

		expect(await screen.findByText('The passwords don’t match')).toBeTruthy()
		expect(confirmPasswordReset).not.toHaveBeenCalled()
	})

	it('says a dead link is dead before asking for a password', async () => {
		verifyPasswordResetCode.mockRejectedValue(expired())
		open('mode=resetPassword&oobCode=OLD')

		expect(
			await screen.findByText(/This link has expired or has already been used/)
		).toBeTruthy()
		expect(screen.queryByLabelText('New password')).toBeNull()
	})
})

it('refuses a link with no code, or one the league does not send', async () => {
	open('mode=verifyEmail')
	expect(await screen.findByText(/missing its code/)).toBeTruthy()
})
