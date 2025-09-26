/**
 * Form validation utilities
 *
 * Reusable validation functions and schemas for forms using Zod v4 best practices
 */

import * as z from 'zod'
import { Filter } from 'bad-words'

// Initialize profanity filter
const filter = new Filter()

// Common validation schemas using Zod v4 best practices
export const emailSchema = z
	.string({
		error: (issue) => {
			if (issue.input === undefined) return 'Email is required'
			return 'Please enter a valid email address'
		},
	})
	.email('Please enter a valid email address')
	.trim()
	.toLowerCase()

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
			// Check for consecutive spaces or special characters
			return !/\s{2,}|'{2,}|-{2,}/.test(name)
		},
		{
			error: 'Name cannot contain consecutive spaces or special characters',
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
		// Capitalize first letter of each word and normalize spaces
		return name
			.replace(/\s+/g, ' ') // Replace multiple spaces with single space
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
	.max(30, 'Team name must be less than 30 characters')
	.refine(
		(name) => name.trim().length >= 2,
		'Team name cannot be just whitespace'
	)
	.refine((name) => {
		// Check for inappropriate words (basic example)
		const inappropriateWords = ['test', 'admin', 'system', 'banned', 'deleted']
		return !inappropriateWords.some((word) => name.toLowerCase().includes(word))
	}, 'Team name contains inappropriate content')
	.refine((name) => {
		// Ensure team name doesn't look like a placeholder
		const placeholderPatterns = [/^team\s*\d*$/i, /^untitled/i, /^new\s*team/i]
		return !placeholderPatterns.some((pattern) => pattern.test(name))
	}, 'Please choose a more specific team name')
	.transform((name) => {
		// Normalize and capitalize properly
		return name.replace(/\s+/g, ' ').trim()
	})

// Compound schemas for common form patterns
export const authFormBaseSchema = z.object({
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
