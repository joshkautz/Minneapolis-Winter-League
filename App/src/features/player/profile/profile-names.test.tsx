import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { DocumentSnapshot } from 'firebase/firestore'
import type { PlayerDocument } from '@/types'

/**
 * The profile's two name forms. The real name locks once the current
 * season's waiver is signed, saying why and who can change it; the
 * nickname can always change, and shows how the player will appear.
 */

const { updatePlayerViaFunction, toastSuccess } = vi.hoisted(() => ({
	updatePlayerViaFunction: vi.fn(),
	toastSuccess: vi.fn(),
}))

vi.mock('@/firebase/collections/functions', () => ({ updatePlayerViaFunction }))
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: vi.fn() } }))
vi.mock('@/providers', () => ({
	useAuthContext: () => ({ authStateUser: { email: 'john@example.com' } }),
}))

const { ProfileForm } = await import('./profile-form')
const { NicknameForm } = await import('./nickname-form')

const snapshot = (player: Partial<PlayerDocument>) =>
	({
		data: () => ({
			admin: false,
			banned: false,
			firstname: 'John',
			lastname: 'Lei',
			...player,
		}),
	}) as unknown as DocumentSnapshot<PlayerDocument>

beforeEach(() => {
	vi.clearAllMocks()
	updatePlayerViaFunction.mockResolvedValue({ success: true })
})

describe('ProfileForm', () => {
	it('lets an unsigned player correct their name', () => {
		render(
			<ProfileForm
				authenticatedUserSnapshot={snapshot({})}
				lockedBySeasonName={null}
			/>
		)

		expect(screen.getByLabelText('First Name')).toBeEnabled()
		expect(screen.getByRole('button', { name: 'Save Changes' })).toBeTruthy()
	})

	it('locks the name once the waiver is signed, and says why', () => {
		render(
			<ProfileForm
				authenticatedUserSnapshot={snapshot({})}
				lockedBySeasonName='Season 5'
			/>
		)

		expect(screen.getByLabelText('First Name')).toBeDisabled()
		expect(screen.getByLabelText('Last Name')).toBeDisabled()
		expect(screen.queryByRole('button', { name: 'Save Changes' })).toBeNull()
		expect(
			screen.getByText(
				'Your name is on your signed waiver for Season 5. To change it, contact the league.'
			)
		).toBeTruthy()
	})
})

describe('NicknameForm', () => {
	it('shows how the player will appear as they type', async () => {
		render(<NicknameForm authenticatedUserSnapshot={snapshot({})} />)

		await userEvent.type(screen.getByLabelText('Nickname'), 'Addie')

		expect(
			screen.getByText('You’ll appear as John “Addie” Lei.'.replace('’', "'"))
		).toBeTruthy()
	})

	it('saves the nickname alone, never the locked name', async () => {
		render(<NicknameForm authenticatedUserSnapshot={snapshot({})} />)

		await userEvent.type(screen.getByLabelText('Nickname'), '  Addie ')
		await userEvent.click(screen.getByRole('button', { name: 'Save Nickname' }))

		expect(updatePlayerViaFunction).toHaveBeenCalledWith({ nickname: 'Addie' })
		expect(toastSuccess).toHaveBeenCalledWith('Nickname saved')
	})

	it('clears the nickname when emptied', async () => {
		render(
			<NicknameForm
				authenticatedUserSnapshot={snapshot({ nickname: 'Addie' })}
			/>
		)

		await userEvent.clear(screen.getByLabelText('Nickname'))
		await userEvent.click(screen.getByRole('button', { name: 'Save Nickname' }))

		expect(updatePlayerViaFunction).toHaveBeenCalledWith({ nickname: null })
		expect(toastSuccess).toHaveBeenCalledWith('Nickname removed')
	})

	it('refuses a nickname the server would, before sending it', async () => {
		render(<NicknameForm authenticatedUserSnapshot={snapshot({})} />)

		await userEvent.type(screen.getByLabelText('Nickname'), 'Addie 2')
		await userEvent.click(screen.getByRole('button', { name: 'Save Nickname' }))

		expect(
			await screen.findByText(
				'Nickname can only contain letters, spaces, hyphens, and apostrophes'
			)
		).toBeTruthy()
		expect(updatePlayerViaFunction).not.toHaveBeenCalled()
	})
})
