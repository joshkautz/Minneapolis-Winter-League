import { describe, expect, it } from 'vitest'
import { Timestamp } from 'firebase-admin/firestore'
import type { WebhookEventPayload } from 'resend'
import { deliveryReportOf, isUndeliverable, supersedes } from './delivery.js'
import type { DeliveryStatus } from '../types.js'

const AT = '2026-09-28T17:10:00.000Z'

const event = (type: string, extra: Record<string, unknown> = {}) =>
	({
		type,
		created_at: AT,
		data: {
			email_id: 'resend-1',
			created_at: AT,
			message_id: '<m@resend>',
			from: 'Minneapolis Winter League <notifications@mplswinterleague.com>',
			to: ['Pat@Example.com'],
			subject: 'Hello',
			...extra,
		},
	}) as unknown as WebhookEventPayload

describe('deliveryReportOf', () => {
	it.each([
		['email.delivered', 'delivered'],
		['email.delivery_delayed', 'delayed'],
		['email.complained', 'complained'],
	] as const)('reads %s as %s', (type, status) => {
		expect(deliveryReportOf(event(type))).toEqual({
			emailId: 'resend-1',
			status,
			at: new Date(AT),
			to: 'pat@example.com',
			undeliverable: false,
		})
	})

	it('treats a permanent bounce as undeliverable', () => {
		const report = deliveryReportOf(
			event('email.bounced', {
				bounce: {
					type: 'Permanent',
					subType: 'General',
					message: 'The mailbox does not exist.',
				},
			})
		)
		expect(report).toMatchObject({
			status: 'bounced',
			detail: 'The mailbox does not exist.',
			undeliverable: true,
		})
	})

	it.each(['Transient', 'Undetermined'])(
		'records a %s bounce without giving up on the address',
		(type) => {
			// A full mailbox or a server that is down may pass.
			const report = deliveryReportOf(
				event('email.bounced', {
					bounce: { type, subType: 'MailboxFull', message: 'Full' },
				})
			)
			expect(report).toMatchObject({ status: 'bounced', undeliverable: false })
		}
	)

	it('treats a blocked address as undeliverable', () => {
		const report = deliveryReportOf(
			event('email.suppressed', {
				suppressed: { type: 'bounce', message: 'On the suppression list.' },
			})
		)
		expect(report).toMatchObject({
			status: 'suppressed',
			detail: 'On the suppression list.',
			undeliverable: true,
		})
	})

	it('records a failure with its reason', () => {
		expect(
			deliveryReportOf(event('email.failed', { failed: { reason: 'Invalid' } }))
		).toMatchObject({
			status: 'failed',
			detail: 'Invalid',
			undeliverable: false,
		})
	})

	it.each(['email.sent', 'email.opened', 'email.clicked', 'email.scheduled'])(
		'ignores %s',
		(type) => {
			expect(deliveryReportOf(event(type))).toBeNull()
		}
	)

	it('ignores events that are not about an email', () => {
		expect(
			deliveryReportOf({
				type: 'domain.updated',
				created_at: AT,
				data: { id: 'd', name: 'mplswinterleague.com' },
			} as unknown as WebhookEventPayload)
		).toBeNull()
	})
})

describe('supersedes', () => {
	const at = (minute: number) => new Date(Date.UTC(2026, 8, 28, 17, minute))
	const current = (status: DeliveryStatus, minute: number) => ({
		status,
		at: at(minute),
	})
	const next = (status: DeliveryStatus, minute: number) => ({
		status,
		at: at(minute),
	})

	it('records the first report', () => {
		expect(supersedes(undefined, next('delayed', 1))).toBe(true)
	})

	it('lets delivery replace a delay', () => {
		expect(supersedes(current('delayed', 1), next('delivered', 2))).toBe(true)
	})

	it('ignores a delay reported after delivery, however late it arrives', () => {
		expect(supersedes(current('delivered', 1), next('delayed', 5))).toBe(false)
	})

	it('never lets delivery hide a complaint', () => {
		expect(supersedes(current('complained', 1), next('delivered', 5))).toBe(
			false
		)
		expect(supersedes(current('delivered', 1), next('complained', 5))).toBe(
			true
		)
	})

	it('takes the later of two final reports', () => {
		expect(supersedes(current('delivered', 1), next('bounced', 2))).toBe(true)
		expect(supersedes(current('bounced', 2), next('delivered', 1))).toBe(false)
	})

	it('accepts the same report again, so a retry is harmless', () => {
		expect(supersedes(current('delivered', 1), next('delivered', 1))).toBe(true)
	})
})

describe('isUndeliverable', () => {
	const flagged = {
		address: 'pat@example.com',
		reason: 'bounced' as const,
		detail: 'No such mailbox',
		at: Timestamp.now(),
	}

	it('holds while the player still has the address that failed', () => {
		expect(
			isUndeliverable({ email: 'Pat@Example.com', emailUndeliverable: flagged })
		).toBe(true)
	})

	it('lapses once an admin changes the address', () => {
		expect(
			isUndeliverable({ email: 'pat@new.com', emailUndeliverable: flagged })
		).toBe(false)
	})

	it('is false for an address that never failed', () => {
		expect(isUndeliverable({ email: 'pat@example.com' })).toBe(false)
	})
})
