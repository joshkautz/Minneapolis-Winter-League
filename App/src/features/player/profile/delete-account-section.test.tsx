import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

/**
 * Deleting your own account from the profile. The server enforces every
 * rule; these pin that the page asks for the password first, says what is
 * kept, and only signs the player out once the server has deleted them.
 */

const {
	reauthenticateWithCredential,
	credential,
	signOut,
	deletePlayerViaFunction,
	toastSuccess,
	currentUser,
} = vi.hoisted(() => ({
	reauthenticateWithCredential: vi.fn(),
	credential: vi.fn((email: string, password: string) => ({
		email,
		password,
	})),
	signOut: vi.fn(),
	deletePlayerViaFunction: vi.fn(),
	toastSuccess: vi.fn(),
	currentUser: { uid: 'player-1', email: 'pat@example.com' },
}))

vi.mock('firebase/auth', async (importOriginal) => ({
	...(await importOriginal<typeof import('firebase/auth')>()),
	reauthenticateWithCredential,
	signOut,
	EmailAuthProvider: { credential },
}))

vi.mock('@/firebase/auth', () => ({ auth: { currentUser } }))

vi.mock('@/firebase/collections/functions', () => ({
	deletePlayerViaFunction,
}))

vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: vi.fn() } }))

const { DeleteAccountSection } = await import('./delete-account-section')

const renderSection = (
	props: Partial<Parameters<typeof DeleteAccountSection>[0]> = {}
) =>
	render(
		<MemoryRouter initialEntries={['/profile']}>
			<Routes>
				<Route
					path='/profile'
					element={
						<DeleteAccountSection
							isRostered={false}
							isBanned={false}
							currentSeasonName='2026 Fall'
							{...props}
						/>
					}
				/>
				<Route path='/' element={<p>Home page</p>} />
			</Routes>
		</MemoryRouter>
	)

const openDialog = async (user: ReturnType<typeof userEvent.setup>) => {
	await user.click(screen.getByRole('button', { name: 'Delete account' }))
	return screen.getByRole('alertdialog')
}

const confirmButton = () =>
	screen.getByRole('button', { name: /Delete my account|Deleting/ })

beforeEach(() => {
	vi.clearAllMocks()
	reauthenticateWithCredential.mockResolvedValue({})
	deletePlayerViaFunction.mockResolvedValue({ success: true, message: '' })
	signOut.mockResolvedValue(undefined)
})

describe('DeleteAccountSection', () => {
	it('explains what is deleted and that waivers are kept', async () => {
		const user = userEvent.setup()
		renderSection()

		const dialog = await openDialog(user)

		expect(dialog).toHaveTextContent(/cannot be undone/)
		expect(dialog).toHaveTextContent(/Your profile, name and email address/)
		expect(dialog).toHaveTextContent(/Your signed waivers/)
		expect(dialog).toHaveTextContent(/shown as from a former player/)
	})

	it('cannot be confirmed without a password', async () => {
		const user = userEvent.setup()
		renderSection()
		await openDialog(user)

		expect(confirmButton()).toBeDisabled()
	})

	it('re-enters the password, deletes, signs out and goes home', async () => {
		const user = userEvent.setup()
		renderSection()
		await openDialog(user)

		await user.type(
			screen.getByLabelText('Enter your password to confirm'),
			'hunter22'
		)
		await user.click(confirmButton())

		await screen.findByText('Home page')
		expect(credential).toHaveBeenCalledWith('pat@example.com', 'hunter22')
		expect(reauthenticateWithCredential).toHaveBeenCalledWith(currentUser, {
			email: 'pat@example.com',
			password: 'hunter22',
		})
		expect(deletePlayerViaFunction).toHaveBeenCalledTimes(1)
		expect(signOut).toHaveBeenCalledTimes(1)
		expect(toastSuccess).toHaveBeenCalledWith('Your account has been deleted.')
		// The password is checked before anything is deleted.
		expect(
			reauthenticateWithCredential.mock.invocationCallOrder[0]
		).toBeLessThan(deletePlayerViaFunction.mock.invocationCallOrder[0])
	})

	it('says so when the password is wrong, and deletes nothing', async () => {
		reauthenticateWithCredential.mockRejectedValue({
			code: 'auth/invalid-credential',
		})
		const user = userEvent.setup()
		renderSection()
		await openDialog(user)

		await user.type(
			screen.getByLabelText('Enter your password to confirm'),
			'wrong'
		)
		await user.click(confirmButton())

		expect(await screen.findByRole('alert')).toHaveTextContent(
			'That password is incorrect.'
		)
		expect(deletePlayerViaFunction).not.toHaveBeenCalled()
		expect(signOut).not.toHaveBeenCalled()
		expect(screen.getByRole('alertdialog')).toBeInTheDocument()
	})

	it('shows the server’s reason when it refuses', async () => {
		deletePlayerViaFunction.mockRejectedValue({
			code: 'functions/failed-precondition',
			message:
				'You are the only admin. Make someone else an admin before deleting your account.',
		})
		const user = userEvent.setup()
		renderSection()
		await openDialog(user)

		await user.type(
			screen.getByLabelText('Enter your password to confirm'),
			'hunter22'
		)
		await user.click(confirmButton())

		expect(await screen.findByRole('alert')).toHaveTextContent(/only admin/)
		expect(signOut).not.toHaveBeenCalled()
	})

	it('does not pass on an unexpected server error’s wording', async () => {
		deletePlayerViaFunction.mockRejectedValue({
			code: 'functions/internal',
			message: 'INTERNAL',
		})
		const user = userEvent.setup()
		renderSection()
		await openDialog(user)

		await user.type(
			screen.getByLabelText('Enter your password to confirm'),
			'hunter22'
		)
		await user.click(confirmButton())

		expect(await screen.findByRole('alert')).toHaveTextContent(
			/could not delete your account/
		)
	})

	it('cannot be dismissed while the deletion is running', async () => {
		let finish: () => void = () => {}
		deletePlayerViaFunction.mockReturnValue(
			new Promise((resolve) => {
				finish = () => resolve({ success: true, message: '' })
			})
		)
		const user = userEvent.setup()
		renderSection()
		await openDialog(user)
		await user.type(
			screen.getByLabelText('Enter your password to confirm'),
			'hunter22'
		)
		await user.click(confirmButton())

		await waitFor(() => expect(confirmButton()).toHaveTextContent('Deleting'))
		await user.keyboard('{Escape}')
		expect(screen.getByRole('alertdialog')).toBeInTheDocument()
		expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()

		finish()
		await screen.findByText('Home page')
	})

	it('asks a player on a team this season to leave it first', () => {
		renderSection({ isRostered: true })

		expect(
			screen.queryByRole('button', { name: 'Delete account' })
		).not.toBeInTheDocument()
		expect(screen.getByText(/on a team for 2026 Fall/)).toBeInTheDocument()
		expect(
			screen.getByRole('link', { name: 'Go to your team' })
		).toHaveAttribute('href', '/manage')
	})

	it('sends a banned player to the league', () => {
		renderSection({ isBanned: true })

		expect(
			screen.queryByRole('button', { name: 'Delete account' })
		).not.toBeInTheDocument()
		expect(
			screen.getByRole('link', { name: 'leadership@mplsmallard.com' })
		).toBeInTheDocument()
	})
})
