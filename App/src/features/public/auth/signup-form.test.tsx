import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * What the signup form says when the profanity filter refuses a name. It
 * offered a "Submit Appeal" button that did nothing; it now says who can
 * set a real name the filter refuses.
 */

vi.mock('@/providers', () => ({
	useAuthContext: () => ({
		createUserWithEmailAndPassword: vi.fn(),
		createUserWithEmailAndPasswordError: undefined,
		createUserWithEmailAndPasswordLoading: false,
		createUserWithEmailAndPasswordUser: undefined,
		sendEmailVerification: vi.fn(),
		sendEmailVerificationSending: false,
		sendEmailVerificationError: undefined,
	}),
}))
vi.mock('@/firebase/collections/functions', () => ({
	createPlayerViaFunction: vi.fn(),
}))

import { SignupForm } from './signup-form'
import { LEAGUE_CONTACT } from '@/shared/utils'

const fill = async (firstName: string) => {
	await userEvent.type(screen.getByLabelText('First name'), firstName)
	await userEvent.type(screen.getByLabelText('Last name'), 'Smith')
	await userEvent.type(screen.getByLabelText('Email'), 'a@example.com')
	await userEvent.type(screen.getByLabelText('Password'), 'secret-password')
	await userEvent.click(screen.getByRole('button', { name: /sign up/i }))
}

describe('SignupForm', () => {
	it('says who to ask when the filter refuses a name', async () => {
		render(<SignupForm onSuccess={vi.fn()} />)
		await fill('Asshole')

		expect(
			await screen.findByText(new RegExp(LEAGUE_CONTACT))
		).toBeInTheDocument()
		expect(
			screen.queryByRole('button', { name: /appeal/i })
		).not.toBeInTheDocument()
	})

	it('says nothing about the filter for other mistakes', async () => {
		render(<SignupForm onSuccess={vi.fn()} />)
		await fill('J0hn')

		expect(await screen.findByRole('alert')).toBeInTheDocument()
		expect(screen.queryByText(new RegExp(LEAGUE_CONTACT))).toBeNull()
	})
})
