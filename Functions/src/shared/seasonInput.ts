/**
 * The fields an admin sets on a season, checked once for createSeason and
 * updateSeason alike.
 */

import { Timestamp } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import type { SeasonStripeConfig } from '../types.js'

const NAME_MIN_LENGTH = 3
const NAME_MAX_LENGTH = 100

export interface SeasonInput {
	name: unknown
	dateStart: unknown
	dateEnd: unknown
	registrationStart: unknown
	registrationEnd: unknown
	stripe?: Partial<SeasonStripeConfig>
}

export interface ParsedSeasonInput {
	name: string
	dateStart: Timestamp
	dateEnd: Timestamp
	registrationStart: Timestamp
	registrationEnd: Timestamp
	/** Only when a production price is given; otherwise the season has none. */
	stripe: SeasonStripeConfig | undefined
}

const invalid = (message: string): HttpsError =>
	new HttpsError('invalid-argument', message)

const parseDate = (value: unknown, label: string): Timestamp => {
	if (value === undefined || value === null || value === '') {
		throw invalid(`${label} is required.`)
	}
	const date = new Date(value as string | number | Date)
	if (Number.isNaN(date.getTime())) {
		throw invalid(`${label} is not a valid date.`)
	}
	return Timestamp.fromDate(date)
}

/**
 * Checks a season's name, dates and Stripe prices, throwing
 * `invalid-argument` with a message for the admin when one is wrong.
 */
export function parseSeasonInput(input: SeasonInput): ParsedSeasonInput {
	if (typeof input.name !== 'string') {
		throw invalid('The season name is required.')
	}
	const name = input.name.trim()
	if (name.length < NAME_MIN_LENGTH || name.length > NAME_MAX_LENGTH) {
		throw invalid(
			`The season name must be between ${NAME_MIN_LENGTH} and ${NAME_MAX_LENGTH} characters.`
		)
	}

	const dateStart = parseDate(input.dateStart, 'The season start date')
	const dateEnd = parseDate(input.dateEnd, 'The season end date')
	const registrationStart = parseDate(
		input.registrationStart,
		'The registration start date'
	)
	const registrationEnd = parseDate(
		input.registrationEnd,
		'The registration end date'
	)

	if (dateEnd.toMillis() <= dateStart.toMillis()) {
		throw invalid('The season must end after it starts.')
	}
	if (registrationEnd.toMillis() <= registrationStart.toMillis()) {
		throw invalid('Registration must close after it opens.')
	}

	const stripe = input.stripe?.priceId
		? {
				priceId: input.stripe.priceId,
				...(input.stripe.priceIdDev && { priceIdDev: input.stripe.priceIdDev }),
				...(input.stripe.returningPlayerCouponId && {
					returningPlayerCouponId: input.stripe.returningPlayerCouponId,
				}),
				...(input.stripe.returningPlayerCouponIdDev && {
					returningPlayerCouponIdDev: input.stripe.returningPlayerCouponIdDev,
				}),
			}
		: undefined

	return {
		name,
		dateStart,
		dateEnd,
		registrationStart,
		registrationEnd,
		stripe,
	}
}
