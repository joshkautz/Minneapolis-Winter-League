/**
 * What a waiver submission must contain, shared by the form that collects it
 * and the callable that records it.
 *
 * Like `versions.ts`, this file has no imports, so the App can load it too.
 * The callable is still the only check that counts: the App runs the same
 * rules only so a player sees a problem beside the field instead of after
 * pressing Sign.
 */

/** Anyone younger signs through a parent or guardian. */
export const ADULT_AGE = 18

/**
 * The league plays in Minneapolis, so "today" and ages are Central. The same
 * value as `FIREBASE_CONFIG.TIME_ZONE`, repeated because this file cannot
 * import; `rules.test.ts` keeps the two equal.
 */
export const LEAGUE_TIME_ZONE = 'America/Chicago'

export const WAIVER_LIMITS = {
	/** A form this old is certainly a typo; the waiver has no upper age. */
	OLDEST_AGE: 110,
	MAX_ADDRESS_LENGTH: 300,
	MIN_ADDRESS_LENGTH: 5,
	MAX_NAME_LENGTH: 100,
	MAX_RELATIONSHIP_LENGTH: 50,
	/** The original form has three rows for emergency contacts. */
	MAX_EMERGENCY_CONTACTS: 3,
	MIN_PHONE_DIGITS: 7,
	MAX_PHONE_DIGITS: 15,
} as const

export interface EmergencyContact {
	name: string
	relationship: string
	phone: string
}

/** What a player submits to sign. */
export interface WaiverSubmission {
	versionId: string
	/** `YYYY-MM-DD` */
	dateOfBirth: string
	mailingAddress: string
	emergencyContacts: EmergencyContact[]
	/** The participant's own name, or for a minor their parent or guardian's. */
	signerName: string
	/** Only for a minor: how the signer is related to them. */
	guardianRelationship?: string
	/** The consent checkbox. */
	agreed: boolean
}

export type WaiverField =
	| 'dateOfBirth'
	| 'mailingAddress'
	| 'emergencyContacts'
	| 'signerName'
	| 'guardianRelationship'
	| 'agreed'

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** Whether `value` is a real calendar date written as `YYYY-MM-DD`. */
export const isIsoDate = (value: string): boolean => {
	const match = ISO_DATE.exec(value)
	if (!match) return false
	const [year, month, day] = match.slice(1).map(Number)
	const date = new Date(Date.UTC(year, month - 1, day))
	return (
		date.getUTCFullYear() === year &&
		date.getUTCMonth() === month - 1 &&
		date.getUTCDate() === day
	)
}

/** Today's date in Minneapolis, as `YYYY-MM-DD`. */
export const leagueToday = (now: Date = new Date()): string =>
	// en-CA formats dates as YYYY-MM-DD.
	new Intl.DateTimeFormat('en-CA', {
		timeZone: LEAGUE_TIME_ZONE,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).format(now)

/**
 * Whole years between a birth date and a day, both `YYYY-MM-DD`. Compared as
 * calendar dates rather than instants, so a birthday counts from its first
 * minute in Minneapolis whatever time zone the server runs in.
 */
export const ageOn = (dateOfBirth: string, today: string): number => {
	const [birthYear, birthMonth, birthDay] = dateOfBirth.split('-').map(Number)
	const [year, month, day] = today.split('-').map(Number)
	const hadBirthdayThisYear =
		month > birthMonth || (month === birthMonth && day >= birthDay)
	return year - birthYear - (hadBirthdayThisYear ? 0 : 1)
}

export const isMinorOn = (dateOfBirth: string, today: string): boolean =>
	ageOn(dateOfBirth, today) < ADULT_AGE

/**
 * A name reduced to what identifies it: case, Unicode composition, spacing
 * and punctuation are ignored, so "Mary-Jo O'Neil" matches "mary jo oneil".
 * Accented letters stay distinct from unaccented ones.
 */
export const normalizeName = (name: string): string =>
	name
		.normalize('NFKC')
		.toLocaleLowerCase('en-US')
		.replace(/['’`]/g, '')
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim()

export const namesMatch = (typed: string, onFile: string): boolean =>
	normalizeName(typed) !== '' && normalizeName(typed) === normalizeName(onFile)

const digitCount = (phone: string): number => phone.replace(/\D/g, '').length

/**
 * Why a submission would be refused, by field, or an empty object if it is
 * complete. One message per field: the first thing to fix.
 */
export const waiverSubmissionErrors = (
	submission: Omit<WaiverSubmission, 'versionId'>,
	context: {
		/** The name on the participant's profile. */
		participantName: string
		/** `YYYY-MM-DD` in Minneapolis; see `leagueToday`. */
		today: string
	}
): Partial<Record<WaiverField, string>> => {
	const errors: Partial<Record<WaiverField, string>> = {}
	const { OLDEST_AGE } = WAIVER_LIMITS

	let minor = false
	if (!isIsoDate(submission.dateOfBirth)) {
		errors.dateOfBirth = 'Enter your date of birth.'
	} else if (submission.dateOfBirth > context.today) {
		errors.dateOfBirth = 'Your date of birth cannot be in the future.'
	} else if (ageOn(submission.dateOfBirth, context.today) > OLDEST_AGE) {
		errors.dateOfBirth = 'Check the year of your date of birth.'
	} else {
		minor = isMinorOn(submission.dateOfBirth, context.today)
	}

	const address = submission.mailingAddress.trim()
	if (address.length < WAIVER_LIMITS.MIN_ADDRESS_LENGTH) {
		errors.mailingAddress = 'Enter your mailing address.'
	} else if (address.length > WAIVER_LIMITS.MAX_ADDRESS_LENGTH) {
		errors.mailingAddress = `Keep your address under ${WAIVER_LIMITS.MAX_ADDRESS_LENGTH} characters.`
	}

	const contacts = submission.emergencyContacts
	if (contacts.length === 0) {
		errors.emergencyContacts = 'Add at least one emergency contact.'
	} else if (contacts.length > WAIVER_LIMITS.MAX_EMERGENCY_CONTACTS) {
		errors.emergencyContacts = `Add at most ${WAIVER_LIMITS.MAX_EMERGENCY_CONTACTS} emergency contacts.`
	} else {
		for (const [index, contact] of contacts.entries()) {
			const which = contacts.length > 1 ? ` for contact ${index + 1}` : ''
			const digits = digitCount(contact.phone)
			if (!contact.name.trim()) {
				errors.emergencyContacts = `Enter a name${which}.`
			} else if (contact.name.trim().length > WAIVER_LIMITS.MAX_NAME_LENGTH) {
				errors.emergencyContacts = `Shorten the name${which}.`
			} else if (!contact.relationship.trim()) {
				errors.emergencyContacts = `Enter how they are related to you${which}.`
			} else if (
				contact.relationship.trim().length >
				WAIVER_LIMITS.MAX_RELATIONSHIP_LENGTH
			) {
				errors.emergencyContacts = `Shorten the relationship${which}.`
			} else if (
				digits < WAIVER_LIMITS.MIN_PHONE_DIGITS ||
				digits > WAIVER_LIMITS.MAX_PHONE_DIGITS
			) {
				errors.emergencyContacts = `Enter a phone number${which}.`
			}
			if (errors.emergencyContacts) break
		}
	}

	const signer = submission.signerName.trim()
	if (!signer) {
		errors.signerName = minor
			? "Type the parent or guardian's full name to sign."
			: 'Type your full name to sign.'
	} else if (signer.length > WAIVER_LIMITS.MAX_NAME_LENGTH) {
		errors.signerName = 'Shorten the name.'
	} else if (!minor && !namesMatch(signer, context.participantName)) {
		errors.signerName = `Type your name as it appears on your profile: ${context.participantName}.`
	} else if (minor && namesMatch(signer, context.participantName)) {
		// The player cannot stand in as their own guardian.
		errors.signerName =
			'A parent or guardian must sign for a player under 18. Type their name.'
	}

	if (minor) {
		const relationship = submission.guardianRelationship?.trim() ?? ''
		if (!relationship) {
			errors.guardianRelationship = 'Enter how you are related to the player.'
		} else if (relationship.length > WAIVER_LIMITS.MAX_RELATIONSHIP_LENGTH) {
			errors.guardianRelationship = 'Shorten the relationship.'
		}
	}

	if (submission.agreed !== true) {
		errors.agreed = 'Check the box to agree to the waiver.'
	}

	return errors
}
