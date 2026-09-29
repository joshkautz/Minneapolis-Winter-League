import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

/**
 * The email section of the profile. When email to the player's address has
 * bounced for good, it says so and who can change the address: players
 * cannot change it themselves.
 */

const { getEmailPreferencesViaFunction } = vi.hoisted(() => ({
	getEmailPreferencesViaFunction: vi.fn(),
}))

vi.mock('@/firebase/collections/functions', () => ({
	getEmailPreferencesViaFunction,
	updateEmailPreferencesViaFunction: vi.fn(),
}))

const { EmailPreferencesSection } = await import('./email-preferences-section')

const ALL_ON = { announcements: true, registration: true, teams: true }

const respond = (undeliverable: boolean) =>
	getEmailPreferencesViaFunction.mockResolvedValue({
		email: 'p•••@umn.edu',
		preferences: ALL_ON,
		undeliverable,
	})

beforeEach(() => {
	getEmailPreferencesViaFunction.mockReset()
})

describe('EmailPreferencesSection', () => {
	it('warns that the address is bouncing, and who can change it', async () => {
		respond(true)
		render(<EmailPreferencesSection />)

		expect(
			await screen.findByText(
				/Email to p•••@umn\.edu is bouncing, so the league cannot reach you/
			)
		).toBeTruthy()
		expect(screen.getByText(/leadership@mplsmallard\.com/)).toBeTruthy()
	})

	it('says nothing about bouncing for an address that works', async () => {
		respond(false)
		render(<EmailPreferencesSection />)

		expect(
			await screen.findByText('Choose which league emails p•••@umn.edu gets.')
		).toBeTruthy()
		expect(screen.queryByText(/is bouncing/)).toBeNull()
	})
})
