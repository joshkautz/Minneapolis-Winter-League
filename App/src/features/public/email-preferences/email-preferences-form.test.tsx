import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * The switches, shared by the preferences page and the profile: each saves
 * as it is flipped, and "Unsubscribe from all" turns every one off, which
 * CAN-SPAM requires any menu of choices to offer.
 */

const { toastSuccess, toastError } = vi.hoisted(() => ({
	toastSuccess: vi.fn(),
	toastError: vi.fn(),
}))
vi.mock('sonner', () => ({
	toast: { success: toastSuccess, error: toastError },
}))

const { EmailPreferencesForm } = await import('./email-preferences-form')

const ALL_ON = { announcements: true, registration: true, teams: true }

const renderForm = (
	preferences = ALL_ON,
	update = vi.fn().mockResolvedValue(true)
) => {
	render(
		<EmailPreferencesForm
			preferences={preferences}
			saving={false}
			update={update}
		/>
	)
	return update
}

beforeEach(() => vi.clearAllMocks())

describe('EmailPreferencesForm', () => {
	it('shows a labelled switch for each kind of email', () => {
		renderForm({ ...ALL_ON, teams: false })

		expect(
			screen.getByRole('switch', { name: 'League announcements' })
		).toBeChecked()
		expect(
			screen.getByRole('switch', { name: 'Registration reminders' })
		).toBeChecked()
		expect(
			screen.getByRole('switch', { name: 'Team updates' })
		).not.toBeChecked()
	})

	it('saves a switch as it is flipped', async () => {
		const user = userEvent.setup()
		const update = renderForm()

		await user.click(screen.getByRole('switch', { name: 'Team updates' }))

		expect(update).toHaveBeenCalledWith({ teams: false })
		await waitFor(() =>
			expect(toastSuccess).toHaveBeenCalledWith(
				"You won't get team updates anymore."
			)
		)
	})

	it('turns one back on', async () => {
		const user = userEvent.setup()
		const update = renderForm({ ...ALL_ON, registration: false })

		await user.click(
			screen.getByRole('switch', { name: 'Registration reminders' })
		)

		expect(update).toHaveBeenCalledWith({ registration: true })
	})

	it('unsubscribes from everything at once', async () => {
		const user = userEvent.setup()
		const update = renderForm()

		await user.click(
			screen.getByRole('button', { name: 'Unsubscribe from all' })
		)

		expect(update).toHaveBeenCalledWith({
			announcements: false,
			registration: false,
			teams: false,
		})
	})

	it('has nothing left to unsubscribe from once everything is off', () => {
		renderForm({ announcements: false, registration: false, teams: false })

		expect(
			screen.getByRole('button', { name: 'Unsubscribe from all' })
		).toBeDisabled()
	})

	it('says why a change was not saved', async () => {
		const user = userEvent.setup()
		renderForm(ALL_ON, vi.fn().mockResolvedValue('Please try again.'))

		await user.click(screen.getByRole('switch', { name: 'Team updates' }))

		await waitFor(() =>
			expect(toastError).toHaveBeenCalledWith('Not saved', {
				description: 'Please try again.',
			})
		)
	})

	it('says account email cannot be turned off', () => {
		renderForm()
		expect(
			screen.getByText(/Account emails, like password resets, are always sent/)
		).toBeInTheDocument()
	})
})
