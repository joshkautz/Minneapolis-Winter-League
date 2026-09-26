/**
 * Form validation utilities
 *
 * Reusable validation functions and schemas for forms using Zod v4 best practices
 */

import * as z from 'zod'
import { Filter } from 'bad-words'
import {
	NAME_MAX_LENGTH,
	NAME_MIN_LENGTH,
	PLAYER_NAME_CHARACTERS,
	REAL_NAMES_WRONGLY_FLAGGED,
	REPEATED_PUNCTUATION,
	formatPlayerName,
	normalizeTypography,
} from '@/shared/name-rules'

const filter = new Filter()
filter.removeWords(...REAL_NAMES_WRONGLY_FLAGGED)

// Common validation schemas using Zod v4 best practices
export const emailSchema = z
	.string({
		error: (issue) => {
			if (issue.input === undefined) return 'Email is required'
			return 'Please enter a valid email address'
		},
	})
	// Trim before validating: the chain runs in order, so validating first
	// rejected a pasted "  a@b.com  " as a malformed address.
	.trim()
	.toLowerCase()
	.email('Please enter a valid email address')

export const passwordSchema = z
	.string({
		error: 'Password is required',
	})
	.min(8, 'Password must be at least 8 characters')
	.regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
	.regex(/[a-z]/, 'Password must contain at least one lowercase letter')
	.regex(/[0-9]/, 'Password must contain at least one number')
	.refine(
		(password) => {
			// Additional custom validation: no common passwords
			const commonPasswords = ['password', '12345678', 'qwerty123']
			return !commonPasswords.includes(password.toLowerCase())
		},
		{
			error: 'Please choose a more secure password',
		}
	)

const loginPasswordSchema = z.string({
	error: 'Password is required',
})

/**
 * The rules are the server's own (`@/shared/name-rules`); this schema only
 * shows them inline, so the reader sees the error before submitting.
 */
export const nameSchema = z
	.string({
		error: (issue) => {
			if (issue.input === undefined) return 'Name is required'
			return 'Please enter a valid name'
		},
	})
	.trim()
	.transform(normalizeTypography)
	.pipe(
		z
			.string()
			.min(
				NAME_MIN_LENGTH,
				`Name must be at least ${NAME_MIN_LENGTH} characters`
			)
			.max(
				NAME_MAX_LENGTH,
				`Name must be at most ${NAME_MAX_LENGTH} characters`
			)
			// Letters from any script: José and Nguyễn are names, and an
			// ASCII-only class refuses them.
			.regex(
				PLAYER_NAME_CHARACTERS,
				'Name can only contain letters, spaces, hyphens, and apostrophes'
			)
			// Consecutive spaces are a typo the transform below collapses, so
			// they are deliberately not rejected here.
			.refine((name) => !REPEATED_PUNCTUATION.test(name), {
				error: 'Name cannot contain consecutive hyphens or apostrophes',
			})
			.refine((name) => !filter.isProfane(name), {
				error:
					'Name contains inappropriate language. Please choose a different name.',
			})
	)
	.transform(formatPlayerName)

export const teamNameSchema = z
	.string({
		error: (issue) => {
			if (issue.input === undefined) return 'Team name is required'
			return 'Please enter a valid team name'
		},
	})
	.trim()
	.min(
		NAME_MIN_LENGTH,
		`Team name must be at least ${NAME_MIN_LENGTH} characters`
	)
	.max(
		NAME_MAX_LENGTH,
		`Team name must be at most ${NAME_MAX_LENGTH} characters`
	)
	.refine(
		(name) => {
			// Check for inappropriate language using bad-words package
			return !filter.isProfane(name)
		},
		{
			error:
				'Team name contains inappropriate language. Please choose a different name.',
		}
	)

// Compound schemas for common form patterns
const authFormBaseSchema = z.object({
	email: emailSchema,
})

export const loginFormSchema = authFormBaseSchema.extend({
	password: loginPasswordSchema,
})

export const signupFormSchema = authFormBaseSchema.extend({
	firstName: nameSchema,
	lastName: nameSchema,
	password: passwordSchema,
})

export const resetPasswordFormSchema = authFormBaseSchema.pick({ email: true })

export const profileFormSchema = z.object({
	firstname: nameSchema,
	lastname: nameSchema,
	email: emailSchema,
})

/** Finishing a profile whose creation failed at sign-up. */
export const completeProfileFormSchema = profileFormSchema.pick({
	firstname: true,
	lastname: true,
})

export const teamFormSchema = z.object({
	name: teamNameSchema,
	logo: z.string().optional(),
})

export const rolloverTeamFormSchema = z.object({
	selectedTeam: z.string().min(1, 'Please select a team to rollover'),
})

// Type exports for form data
export type LoginFormData = z.infer<typeof loginFormSchema>
export type SignupFormData = z.infer<typeof signupFormSchema>
export type ResetPasswordFormData = z.infer<typeof resetPasswordFormSchema>
export type ProfileFormData = z.infer<typeof profileFormSchema>
export type CompleteProfileFormData = z.infer<typeof completeProfileFormSchema>
export type TeamFormData = z.infer<typeof teamFormSchema>
export type RolloverTeamFormData = z.infer<typeof rolloverTeamFormSchema>
