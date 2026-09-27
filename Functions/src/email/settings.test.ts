import { describe, expect, it } from 'vitest'
import { EMAIL_OFF, deliveryFor } from './settings.js'

describe('deliveryFor', () => {
	it('holds everything while email is off', () => {
		expect(deliveryFor(EMAIL_OFF, 'josh@example.com')).toMatchObject({
			send: false,
			status: 'held',
		})
	})

	it('sends only to test recipients in test mode, ignoring case', () => {
		const settings = {
			mode: 'test' as const,
			testRecipients: ['josh@example.com'],
		}
		expect(deliveryFor(settings, 'Josh@Example.com')).toEqual({ send: true })
		expect(deliveryFor(settings, 'player@example.com')).toMatchObject({
			send: false,
			status: 'skipped',
		})
	})

	it('sends to everyone when live', () => {
		expect(
			deliveryFor({ mode: 'live', testRecipients: [] }, 'player@example.com')
		).toEqual({ send: true })
	})
})
