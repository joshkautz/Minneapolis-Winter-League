/**
 * Form validation utilities
 *
 * Reusable validation functions and schemas for forms using Zod v4 best practices
 */

import * as z from 'zod'
import { Filter } from 'bad-words'

/**
 * Entries removed from the `bad-words` blocklist because they are real
 * people's names, and this filter is applied to names.
 *
 * Out of the box the list blocks Cox, Wang, Butt, Schaffer, Dick and Dyke,
 * among others — Cox is a top-1000 US surname and Wang is one of the most
 * common surnames in the world, so the form refused to let either register.
 *
 * The criterion for removal is: an established given name or surname whose
 * word is not primarily a slur against a group.
 *
 * **Keep in sync with `Functions/src/shared/names.ts`**, which holds the
 * authoritative copy — this one is a convenience so the reader sees the error
 * inline instead of after submitting.
 */
const REAL_NAMES_WRONGLY_FLAGGED = [
	'butt',
	'cox',
	'dick',
	'dyke',
	'fanny',
	'fuk',
	'gaylord',
	'hoar',
	'hoare',
	'hore',
	'kuntz',
	'lipshits',
	'lipshitz',
	'muff',
	'pecker',
	'schaffer',
	'schmuck',
	'wang',
	'willies',
	'willy',
]

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

export const loginPasswordSchema = z.string({
	error: 'Password is required',
})

export const nameSchema = z
	.string({
		error: (issue) => {
			if (issue.input === undefined) return 'Name is required'
			return 'Please enter a valid name'
		},
	})
	.trim()
	.min(2, 'Name must be at least 2 characters')
	.max(50, 'Name must be less than 50 characters')
	.regex(
		/^[a-zA-Z\s'-]+$/,
		'Name can only contain letters, spaces, hyphens, and apostrophes'
	)
	.refine(
		(name) => {
			// Consecutive apostrophes or hyphens are malformed; consecutive
			// spaces are a typo the transform below collapses, so they are
			// deliberately not rejected here.
			return !/'{2,}|-{2,}/.test(name)
		},
		{
			error: 'Name cannot contain consecutive hyphens or apostrophes',
		}
	)
	.refine(
		(name) => {
			// Check for inappropriate language using bad-words package
			return !filter.isProfane(name)
		},
		{
			error:
				'Name contains inappropriate language. Please choose a different name.',
		}
	)
	.transform((name) => {
		// Collapse runs of whitespace before title-casing, so a double-typed
		// or pasted space normalises instead of being rejected.
		return name
			.replace(/\s+/g, ' ')
			.replace(/\b\w/g, (char) => char.toUpperCase())
	})

export const teamNameSchema = z
	.string({
		error: (issue) => {
			if (issue.input === undefined) return 'Team name is required'
			return 'Please enter a valid team name'
		},
	})
	.trim()
	.min(2, 'Team name must be at least 2 characters')
	.max(50, 'Team name must be less than 50 characters')
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
export type TeamFormData = z.infer<typeof teamFormSchema>
export type RolloverTeamFormData = z.infer<typeof rolloverTeamFormSchema>
