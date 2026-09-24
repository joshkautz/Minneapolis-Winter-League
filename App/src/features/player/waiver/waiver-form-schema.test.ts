import { describe, expect, it } from 'vitest'
import {
	isMinorForForm,
	toSubmission,
	waiverFormSchema,
	type WaiverFormValues,
} from './waiver-form-schema'

const TODAY = '2026-10-01'

const values = (
	overrides: Partial<WaiverFormValues> = {}
): WaiverFormValues => ({
	dateOfBirth: '1990-05-17',
	mailingAddress: '123 Main St, Minneapolis, MN',
	emergencyContacts: [
		{ name: 'Sam Doe', relationship: 'Partner', phone: '612 555 0100' },
	],
	signerName: 'Test Player',
	guardianRelationship: '',
	agreed: true,
	...overrides,
})

describe('waiverFormSchema', () => {
	const schema = waiverFormSchema({
		participantName: 'Test Player',
		today: TODAY,
	})

	it('accepts what the server accepts', () => {
		expect(schema.safeParse(values()).success).toBe(true)
	})

	it("puts the server's message on the field it belongs to", () => {
		const result = schema.safeParse(values({ signerName: 'Someone Else' }))

		expect(result.success).toBe(false)
		expect(result.error?.issues).toEqual([
			expect.objectContaining({
				path: ['signerName'],
				message: 'Type your name as it appears on your profile: Test Player.',
			}),
		])
	})
})

describe('isMinorForForm', () => {
	it('is false until a whole, valid date is typed', () => {
		expect(isMinorForForm('', TODAY)).toBe(false)
		expect(isMinorForForm('2010-13-01', TODAY)).toBe(false)
	})

	it('is true for a player under 18 and false from their 18th birthday', () => {
		expect(isMinorForForm('2008-10-02', TODAY)).toBe(true)
		expect(isMinorForForm('2008-10-01', TODAY)).toBe(false)
	})

	it('ignores a date in the future', () => {
		expect(isMinorForForm('2030-01-01', TODAY)).toBe(false)
	})
})

describe('toSubmission', () => {
	it('sends no guardian relationship for an adult', () => {
		expect(
			toSubmission(values({ guardianRelationship: 'Mother' }), 'v1', TODAY)
				.guardianRelationship
		).toBeUndefined()
	})

	it("sends a minor's guardian relationship", () => {
		expect(
			toSubmission(
				values({ dateOfBirth: '2012-01-01', guardianRelationship: 'Mother' }),
				'v1',
				TODAY
			)
		).toMatchObject({ versionId: 'v1', guardianRelationship: 'Mother' })
	})
})
