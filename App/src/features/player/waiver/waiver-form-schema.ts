import * as z from 'zod'
import {
	isIsoDate,
	isMinorOn,
	waiverSubmissionErrors,
	type WaiverSubmission,
} from '@/shared/waiver'

/**
 * The waiver form's values. Checked by the same rules the server applies
 * (`waiverSubmissionErrors`), so a player who passes here passes there, and
 * the messages under the fields are the server's own.
 */
export const waiverFormSchema = (context: {
	participantName: string
	/** `YYYY-MM-DD` in Minneapolis */
	today: string
}) =>
	z
		.object({
			dateOfBirth: z.string(),
			mailingAddress: z.string(),
			emergencyContacts: z.array(
				z.object({
					name: z.string(),
					relationship: z.string(),
					phone: z.string(),
				})
			),
			signerName: z.string(),
			guardianRelationship: z.string(),
			agreed: z.boolean(),
		})
		.superRefine((values, ctx) => {
			const errors = waiverSubmissionErrors(values, context)
			for (const [field, message] of Object.entries(errors)) {
				ctx.addIssue({ code: 'custom', path: [field], message })
			}
		})

export type WaiverFormValues = z.infer<ReturnType<typeof waiverFormSchema>>

export const EMPTY_CONTACT = { name: '', relationship: '', phone: '' }

/** Whether the date typed so far makes the player a minor today. */
export const isMinorForForm = (dateOfBirth: string, today: string): boolean =>
	isIsoDate(dateOfBirth) &&
	dateOfBirth <= today &&
	isMinorOn(dateOfBirth, today)

/** What the callable receives. Drops the guardian field for an adult. */
export const toSubmission = (
	values: WaiverFormValues,
	versionId: string,
	today: string
): WaiverSubmission => ({
	versionId,
	dateOfBirth: values.dateOfBirth,
	mailingAddress: values.mailingAddress,
	emergencyContacts: values.emergencyContacts,
	signerName: values.signerName,
	guardianRelationship: isMinorForForm(values.dateOfBirth, today)
		? values.guardianRelationship
		: undefined,
	agreed: values.agreed,
})
