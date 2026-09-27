import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

/**
 * The page every email's Unsubscribe link opens. The link carries the
 * player's id and token, so it works signed out; one button unsubscribes
 * from the kind of email they came from, and the switches change the rest.
 */

const {
	getEmailPreferencesViaFunction,
	updateEmailPreferencesViaFunction,
	auth,
	toastSuccess,
	toastError,
} = vi.hoisted(() => ({
	getEmailPreferencesViaFunction: vi.fn(),
	updateEmailPreferencesViaFunction: vi.fn(),
	auth: {
		authStateUser: null as { uid: string } | null,
		authStateLoading: false,
	},
	toastSuccess: vi.fn(),
	toastError: vi.fn(),
}))

vi.mock('@/firebase/collections/functions', () => ({
	getEmailPreferencesViaFunction,
	updateEmailPreferencesViaFunction,
}))
vi.mock('@/providers', () => ({
	useAuthContext: () => auth,
	// The page header shows a spinner while seasons load.
	useSeasonsContext: () => ({ seasonsQuerySnapshotLoading: false }),
}))
vi.mock('sonner', () => ({
	toast: { success: toastSuccess, error: toastError },
}))

const { EmailPreferencesPage } = await import('./email-preferences-page')

const ALL_ON = { announcements: true, registration: true, teams: true }
const LINK = { playerId: 'player-1', token: 'token-1' }

const openPage = (query = '?p=player-1&t=token-1&c=announcements') =>
	render(
		<MemoryRouter initialEntries={[`/email-preferences${query}`]}>
			<Routes>
				<Route path='/email-preferences' element={<EmailPreferencesPage />} />
			</Routes>
		</MemoryRouter>
	)

const respond = (preferences = ALL_ON) => ({
	email: 'j•••@example.com',
	preferences,
})

beforeEach(() => {
	vi.clearAllMocks()
	auth.authStateUser = null
	auth.authStateLoading = false
	getEmailPreferencesViaFunction.mockResolvedValue(respond())
	updateEmailPreferencesViaFunction.mockImplementation(
		async (_link: unknown, changes: Record<string, boolean>) =>
			respond({ ...ALL_ON, ...changes })
	)
})

describe('arriving from an email', () => {
	it('loads the preferences with the link, without signing in', async () => {
		openPage()

		expect(
			await screen.findByText('Unsubscribe from league announcements?')
		).toBeInTheDocument()
		expect(getEmailPreferencesViaFunction).toHaveBeenCalledWith(LINK)
		expect(screen.getByText(/at j•••@example\.com anymore/)).toBeInTheDocument()
	})

	it('unsubscribes from that kind of email with one click', async () => {
		const user = userEvent.setup()
		openPage()

		await user.click(await screen.findByRole('button', { name: 'Unsubscribe' }))

		expect(updateEmailPreferencesViaFunction).toHaveBeenCalledWith(LINK, {
			announcements: false,
		})
		expect(
			await screen.findByText(
				'You’re unsubscribed from league announcements'.replace('’', "'")
			)
		).toBeInTheDocument()
	})

	it('can undo it straight away', async () => {
		const user = userEvent.setup()
		openPage()
		await user.click(await screen.findByRole('button', { name: 'Unsubscribe' }))

		await user.click(await screen.findByRole('button', { name: 'Undo' }))

		expect(updateEmailPreferencesViaFunction).toHaveBeenLastCalledWith(LINK, {
			announcements: true,
		})
		expect(
			await screen.findByText('Unsubscribe from league announcements?')
		).toBeInTheDocument()
	})

	it('says so when already unsubscribed, and offers to resubscribe', async () => {
		getEmailPreferencesViaFunction.mockResolvedValue(
			respond({ ...ALL_ON, announcements: false })
		)
		openPage()

		expect(
			await screen.findByRole('button', { name: 'Resubscribe' })
		).toBeInTheDocument()
		expect(
			screen.getByText(/already don't get league announcements/)
		).toBeInTheDocument()
	})

	it('explains a link that does not work', async () => {
		getEmailPreferencesViaFunction.mockRejectedValue(
			Object.assign(new Error('This link is not valid.'), {
				code: 'functions/permission-denied',
			})
		)
		openPage()

		expect(await screen.findByRole('alert')).toBeInTheDocument()
		expect(updateEmailPreferencesViaFunction).not.toHaveBeenCalled()
	})

	it('keeps the switches working when the unsubscribe fails', async () => {
		const user = userEvent.setup()
		updateEmailPreferencesViaFunction.mockRejectedValueOnce(
			new Error('offline')
		)
		openPage()

		await user.click(await screen.findByRole('button', { name: 'Unsubscribe' }))

		await waitFor(() => expect(toastError).toHaveBeenCalled())
		expect(
			screen.getByText('Unsubscribe from league announcements?')
		).toBeInTheDocument()
	})

	it('offers only the switches for a link without a known kind of email', async () => {
		openPage('?p=player-1&t=token-1&c=nonsense')

		expect(
			await screen.findByText('Choose which emails you get')
		).toBeInTheDocument()
		expect(
			screen.queryByRole('button', { name: 'Unsubscribe' })
		).not.toBeInTheDocument()
	})
})

describe('without a link', () => {
	it('tells a signed-out visitor where the link is', async () => {
		openPage('')

		expect(
			await screen.findByText(/bottom of any league email/)
		).toBeInTheDocument()
		expect(getEmailPreferencesViaFunction).not.toHaveBeenCalled()
	})

	it('shows a signed-in player their own', async () => {
		auth.authStateUser = { uid: 'player-1' }
		openPage('')

		expect(
			await screen.findByText('Choose which emails you get')
		).toBeInTheDocument()
		expect(getEmailPreferencesViaFunction).toHaveBeenCalledWith({})
	})
})
