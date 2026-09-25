import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FirebaseError } from 'firebase/app'

/**
 * A sign-up whose profile step failed leaves an account with no player
 * document. The dialog asks for the name again and retries createPlayer.
 */

const { useAuthContext, createPlayerViaFunction } = vi.hoisted(() => ({
	useAuthContext: vi.fn(),
	createPlayerViaFunction: vi.fn(),
}))
vi.mock('@/providers', () => ({ useAuthContext }))
vi.mock('@/firebase/collections/functions', () => ({ createPlayerViaFunction }))

const { CompleteProfileDialog } = await import('./complete-profile-dialog')

const signedIn = (profile: 'missing' | 'present' | 'loading') =>
	useAuthContext.mockReturnValue({
		authStateUser: { uid: 'u1', email: 'u1@example.com' },
		authenticatedUserSnapshotLoading: profile === 'loading',
		authenticatedUserSnapshot:
			profile === 'loading'
				? undefined
				: { exists: () => profile === 'present' },
	})

beforeEach(() => {
	vi.clearAllMocks()
	createPlayerViaFunction.mockResolvedValue({ success: true })
})

describe('CompleteProfileDialog', () => {
	it('stays hidden while the profile loads, and when it exists', () => {
		signedIn('loading')
		const { rerender } = render(<CompleteProfileDialog />)
		expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

		signedIn('present')
		rerender(<CompleteProfileDialog />)
		expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
	})

	it('stays hidden for a visitor who is not signed in', () => {
		useAuthContext.mockReturnValue({
			authStateUser: null,
			authenticatedUserSnapshotLoading: false,
			authenticatedUserSnapshot: undefined,
		})
		render(<CompleteProfileDialog />)
		expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
	})

	it('creates the missing profile with the account email', async () => {
		signedIn('missing')
		const user = userEvent.setup()
		render(<CompleteProfileDialog />)

		await user.type(screen.getByLabelText('First name'), 'josh')
		await user.type(screen.getByLabelText('Last name'), 'Kautz')
		await user.click(screen.getByRole('button', { name: 'Save profile' }))

		expect(createPlayerViaFunction).toHaveBeenCalledWith({
			firstname: 'Josh',
			lastname: 'Kautz',
			email: 'u1@example.com',
		})
	})

	it('says why when saving fails, so the player can try again', async () => {
		signedIn('missing')
		createPlayerViaFunction.mockRejectedValue(
			new FirebaseError('functions/internal', 'internal [0]')
		)
		const user = userEvent.setup()
		render(<CompleteProfileDialog />)

		await user.type(screen.getByLabelText('First name'), 'Josh')
		await user.type(screen.getByLabelText('Last name'), 'Kautz')
		await user.click(screen.getByRole('button', { name: 'Save profile' }))

		await waitFor(() =>
			expect(screen.getByRole('alert')).toHaveTextContent(
				'We could not reach the server.'
			)
		)
	})
})
