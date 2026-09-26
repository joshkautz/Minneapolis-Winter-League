import { describe, expect, it } from 'vitest'
import { parseSeasonInput, type SeasonInput } from './seasonInput.js'

const valid: SeasonInput = {
	name: '  2026 Fall  ',
	dateStart: '2026-11-07T00:00:00.000Z',
	dateEnd: '2026-12-19T00:00:00.000Z',
	registrationStart: '2026-10-01T00:00:00.000Z',
	registrationEnd: '2026-10-31T00:00:00.000Z',
}

const refusal = (input: Partial<SeasonInput>): string => {
	try {
		parseSeasonInput({ ...valid, ...input })
	} catch (error) {
		return (error as Error).message
	}
	throw new Error('expected a refusal')
}

describe('parseSeasonInput', () => {
	it('trims the name and converts the dates', () => {
		const season = parseSeasonInput(valid)
		expect(season.name).toBe('2026 Fall')
		expect(season.registrationEnd.toDate().toISOString()).toBe(
			'2026-10-31T00:00:00.000Z'
		)
		expect(season.stripe).toBeUndefined()
	})

	it('names a date that cannot be read', () => {
		expect(refusal({ dateEnd: 'next December' })).toBe(
			'The season end date is not a valid date.'
		)
	})

	it('names a missing date', () => {
		expect(refusal({ registrationStart: '' })).toBe(
			'The registration start date is required.'
		)
	})

	it('refuses a season that ends before it starts', () => {
		expect(refusal({ dateEnd: '2026-11-01T00:00:00.000Z' })).toBe(
			'The season must end after it starts.'
		)
	})

	it('refuses registration that closes before it opens', () => {
		expect(refusal({ registrationEnd: '2026-09-30T00:00:00.000Z' })).toBe(
			'Registration must close after it opens.'
		)
	})

	it('checks the trimmed name length', () => {
		expect(refusal({ name: '  ab  ' })).toMatch(/between 3 and 100/)
		expect(refusal({ name: undefined })).toBe('The season name is required.')
	})

	it('keeps only the Stripe prices that were given', () => {
		const season = parseSeasonInput({
			...valid,
			stripe: { priceId: 'price_1', priceIdDev: '' },
		})
		expect(season.stripe).toEqual({ priceId: 'price_1' })
	})
})
