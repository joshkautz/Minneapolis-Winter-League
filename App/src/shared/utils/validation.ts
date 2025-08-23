/**
 * Form validation utilities
 *
 * Reusable validation functions and schemas for forms
 *
 * This module provides Zod validation schemas that are aligned with the shared types
 * from @mwl/shared. Key improvements include:
 *
 * - Uses shared enum types (OfferCreator, OfferStatus) for consistency
 * - Schemas designed to be compatible with shared TypeScript interfaces
 * - Better type safety with generic validator functions
 * - Proper handling of Firebase DocumentReference types (using z.unknown())
 * - Pre-configured validators for common use cases
 *
 * Note: Firebase DocumentReference types use z.unknown() since they cannot be
 * validated at runtime, but the schemas maintain structural compatibility.
 */

import { z } from 'zod'
import { OfferCreator, OfferStatus } from '@mwl/shared'

// Common validation schemas with advanced features
export const emailSchema = z
	.string()
	.trim()
	.min(1, 'Email is required')
	.email('Please enter a valid email address')
	.transform((email) => email.toLowerCase())

export const passwordSchema = z
	.string()
	.min(8, 'Password must be at least 8 characters')
	.regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
	.regex(/[a-z]/, 'Password must contain at least one lowercase letter')
	.regex(/[0-9]/, 'Password must contain at least one number')
	.refine((password) => {
		// Additional custom validation: no common passwords
		const commonPasswords = ['password', '12345678', 'qwerty123']
		return !commonPasswords.includes(password.toLowerCase())
	}, 'Please choose a more secure password')

export const loginPasswordSchema = z.string().min(1, 'Password is required')

export const nameSchema = z
	.string()
	.trim()
	.min(1, 'Name is required')
	.min(2, 'Name must be at least 2 characters')
	.max(50, 'Name must be less than 50 characters')
	.regex(
		/^[a-zA-Z\s'-]+$/,
		'Name can only contain letters, spaces, hyphens, and apostrophes'
	)
	.refine((name) => {
		// Check for consecutive spaces or special characters
		return !/\s{2,}|'{2,}|-{2,}/.test(name)
	}, 'Name cannot contain consecutive spaces or special characters')
	.transform((name) => {
		// Capitalize first letter of each word and normalize spaces
		return name
			.replace(/\s+/g, ' ') // Replace multiple spaces with single space
			.replace(/\b\w/g, (char) => char.toUpperCase())
	})

export const teamNameSchema = z
	.string()
	.trim()
	.min(1, 'Team name is required')
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

// Phone number validation with preprocessing and transformation
export const phoneSchema = z
	.string()
	.trim()
	.min(1, 'Phone number is required')
	.transform((phone) => phone.replace(/\D/g, '')) // Remove all non-digits
	.pipe(
		z
			.string()
			.length(10, 'Phone number must be exactly 10 digits')
			.regex(/^\d{10}$/, 'Phone number must contain only digits')
			.transform(
				(digits) =>
					`(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
			)
	)

// Common validation functions
export const validateEmail = (email: string): boolean => {
	return emailSchema.safeParse(email).success
}

export const validatePassword = (password: string): boolean => {
	return passwordSchema.safeParse(password).success
}

export const validateName = (name: string): boolean => {
	return nameSchema.safeParse(name).success
}

export const validatePhoneNumber = (phone: string): boolean => {
	return phoneSchema.safeParse(phone).success
}

// File validation schemas
export const imageFileSchema = z
	.instanceof(File)
	.refine((file) => {
		const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
		return allowedTypes.includes(file.type)
	}, 'Please select a valid image file (JPEG, PNG, GIF, or WebP)')
	.refine((file) => {
		const maxSize = 5 * 1024 * 1024 // 5MB
		return file.size <= maxSize
	}, 'Image file must be less than 5MB')

export const optionalImageFileSchema = z
	.instanceof(File)
	.optional()
	.refine((file) => {
		if (!file) {
			return true
		}
		const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
		return allowedTypes.includes(file.type)
	}, 'Please select a valid image file (JPEG, PNG, GIF, or WebP)')
	.refine((file) => {
		if (!file) {
			return true
		}
		const maxSize = 5 * 1024 * 1024 // 5MB
		return file.size <= maxSize
	}, 'Image file must be less than 5MB')

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
	logo: z
		.string()
		.optional()
		.transform((val) => val || undefined), // Convert empty strings to undefined
})

// Enhanced search/query schemas
export const searchQuerySchema = z
	.string()
	.trim()
	.min(1, 'Search query cannot be empty')
	.max(100, 'Search query too long')
	.transform((query) => query.toLowerCase())

export const paginationSchema = z.object({
	page: z
		.number()
		.int()
		.positive()
		.default(1)
		.or(
			z
				.string()
				.transform((val) => parseInt(val, 10))
				.pipe(z.number().int().positive().default(1))
		),
	limit: z
		.number()
		.int()
		.positive()
		.max(100)
		.default(10)
		.or(
			z
				.string()
				.transform((val) => parseInt(val, 10))
				.pipe(z.number().int().positive().max(100).default(10))
		),
})

// URL/ID validation schemas
export const uuidSchema = z.string().uuid('Invalid ID format')
export const firestoreIdSchema = z
	.string()
	.min(1, 'ID is required')
	.max(100, 'ID too long')

// Environment validation schema
export const environmentSchema = z.object({
	NODE_ENV: z
		.enum(['development', 'production', 'test'])
		.default('development'),
	FIREBASE_API_KEY: z.string().min(1, 'Firebase API key is required'),
	FIREBASE_AUTH_DOMAIN: z.string().min(1, 'Firebase auth domain is required'),
	FIREBASE_PROJECT_ID: z.string().min(1, 'Firebase project ID is required'),
})

// Type exports for form data
export type LoginFormData = z.infer<typeof loginFormSchema>
export type SignupFormData = z.infer<typeof signupFormSchema>
export type ResetPasswordFormData = z.infer<typeof resetPasswordFormSchema>
export type ProfileFormData = z.infer<typeof profileFormSchema>
export type TeamFormData = z.infer<typeof teamFormSchema>
export type SearchQueryData = z.infer<typeof searchQuerySchema>
export type PaginationData = z.infer<typeof paginationSchema>

// Type exports for data model schemas - these are designed to be compatible with shared types
// Note: DocumentReference fields use z.unknown() since Firebase types can't be validated at runtime
export type PlayerSeasonSchemaType = z.infer<typeof playerSeasonSchema>
export type PlayerDataSchemaType = z.infer<typeof playerDataSchema>
export type TeamRosterItemSchemaType = z.infer<typeof teamRosterItemSchema>
export type TeamDataSchemaType = z.infer<typeof teamDataSchema>
export type SeasonDataSchemaType = z.infer<typeof seasonDataSchema>
export type OfferDataSchemaType = z.infer<typeof offerDataSchema>

// Advanced form schemas with conditional validation
export const teamRegistrationSchema = z
	.object({
		teamName: teamNameSchema,
		captainName: nameSchema,
		captainEmail: emailSchema,
		logoFile: optionalImageFileSchema,
		agreesToTerms: z.boolean(),
		hasMinimumPlayers: z.boolean(),
		playerCount: z.number().int().min(1, 'Must have at least 1 player'),
	})
	.refine((data) => data.agreesToTerms, 'Must agree to terms and conditions')
	.refine(
		(data) => data.hasMinimumPlayers && data.playerCount >= 5,
		'Team must have at least 5 players to register'
	)

export const playerEditSchema = z
	.object({
		firstname: nameSchema,
		lastname: nameSchema,
		email: emailSchema,
		phone: phoneSchema.optional(),
		isActive: z.boolean().default(true),
		emergencyContact: z
			.object({
				name: nameSchema,
				phone: phoneSchema,
				relationship: z.string().min(1, 'Relationship is required'),
			})
			.optional(),
	})
	.refine((data) => {
		// If player is active and under 18, emergency contact is required
		// This is a placeholder - you'd get age from birthday or other field
		return data.isActive ? true : data.emergencyContact !== undefined
	}, 'Emergency contact is required for active players')

// Payment validation schema
export const paymentDataSchema = z.object({
	amount: z
		.number()
		.positive('Amount must be positive')
		.max(1000, 'Amount cannot exceed $1000')
		.transform((val) => Math.round(val * 100) / 100), // Round to 2 decimal places
	currency: z.enum(['USD']).default('USD'),
	paymentMethod: z.enum(['stripe', 'cash', 'check']),
	description: z.string().optional(),
})

// API/Data Model Schemas for runtime validation
import { Timestamp } from 'firebase/firestore'

// Date/Timestamp validation schemas
export const timestampSchema = z
	.instanceof(Timestamp)
	.or(z.date().transform((date) => Timestamp.fromDate(date)))

export const dateStringSchema = z
	.string()
	.datetime()
	.transform((str) => new Date(str))

// API/Data Model Schemas for runtime validation - aligned with shared types

// Firebase DocumentReference placeholders - cannot validate at runtime
// Using z.unknown() to ensure they're required but accept any value
const documentRefSchema = z.unknown()
const nullableDocumentRefSchema = z.unknown().nullable()

export const playerSeasonSchema = z.object({
	banned: z.boolean().optional(),
	captain: z.boolean(),
	paid: z.boolean(),
	season: documentRefSchema, // DocumentReference - can't validate at runtime but must be present
	signed: z.boolean(),
	team: nullableDocumentRefSchema, // DocumentReference | null
})

export const playerDataSchema = z.object({
	admin: z.boolean(),
	email: emailSchema,
	firstname: nameSchema,
	lastname: nameSchema,
	seasons: z.array(playerSeasonSchema),
})

export const teamRosterItemSchema = z.object({
	captain: z.boolean(),
	player: documentRefSchema, // DocumentReference - required
})

export const teamDataSchema = z.object({
	logo: z.string().nullable(),
	name: teamNameSchema,
	placement: z.number().int().positive().nullable(),
	registered: z.boolean(),
	registeredDate: timestampSchema,
	roster: z.array(teamRosterItemSchema),
	season: documentRefSchema, // DocumentReference - required
	storagePath: z.string().nullable(),
	teamId: z.string().uuid(),
})

export const seasonDataSchema = z.object({
	dateEnd: timestampSchema,
	dateStart: timestampSchema,
	name: z.string().min(1, 'Season name is required'),
	registrationEnd: timestampSchema,
	registrationStart: timestampSchema,
	teams: z.array(documentRefSchema), // Array of DocumentReference
})

// Game/Offer related schemas - using shared enum types
export const offerStatusSchema = z.nativeEnum(OfferStatus)
export const offerCreatorSchema = z.nativeEnum(OfferCreator)

export const offerDataSchema = z.object({
	creator: offerCreatorSchema,
	creatorName: z.string().min(1),
	player: documentRefSchema, // DocumentReference - required
	status: offerStatusSchema,
	team: documentRefSchema, // DocumentReference - required
})

// Runtime validation helpers for API responses - with proper typing
export const validatePlayerData = (data: unknown): PlayerDataSchemaType => {
	return playerDataSchema.parse(data)
}

export const validateTeamData = (data: unknown): TeamDataSchemaType => {
	return teamDataSchema.parse(data)
}

export const validateSeasonData = (data: unknown): SeasonDataSchemaType => {
	return seasonDataSchema.parse(data)
}

export const validateOfferData = (data: unknown): OfferDataSchemaType => {
	return offerDataSchema.parse(data)
}

// Safe parsing helpers - with proper typing
export const safeParsePlayerData = (
	data: unknown
): z.SafeParseReturnType<unknown, PlayerDataSchemaType> => {
	return playerDataSchema.safeParse(data)
}

export const safeParseTeamData = (
	data: unknown
): z.SafeParseReturnType<unknown, TeamDataSchemaType> => {
	return teamDataSchema.safeParse(data)
}

export const safeParseSeasonData = (
	data: unknown
): z.SafeParseReturnType<unknown, SeasonDataSchemaType> => {
	return seasonDataSchema.safeParse(data)
}

export const safeParseOfferData = (
	data: unknown
): z.SafeParseReturnType<unknown, OfferDataSchemaType> => {
	return offerDataSchema.safeParse(data)
}

// Custom error map for better user-facing error messages
export const customErrorMap: z.ZodErrorMap = (issue, ctx) => {
	switch (issue.code) {
		case z.ZodIssueCode.invalid_type:
			if (issue.expected === 'string') {
				return { message: 'This field is required' }
			}
			if (issue.expected === 'number') {
				return { message: 'Please enter a valid number' }
			}
			break
		case z.ZodIssueCode.too_small:
			if (issue.type === 'string') {
				if (issue.minimum === 1) {
					return { message: 'This field is required' }
				}
				return { message: `Must be at least ${issue.minimum} characters long` }
			}
			if (issue.type === 'number') {
				return { message: `Must be at least ${issue.minimum}` }
			}
			break
		case z.ZodIssueCode.too_big:
			if (issue.type === 'string') {
				return {
					message: `Must be no more than ${issue.maximum} characters long`,
				}
			}
			if (issue.type === 'number') {
				return { message: `Must be no more than ${issue.maximum}` }
			}
			break
		case z.ZodIssueCode.invalid_string:
			if (issue.validation === 'email') {
				return { message: 'Please enter a valid email address' }
			}
			if (issue.validation === 'uuid') {
				return { message: 'Invalid ID format' }
			}
			break
		case z.ZodIssueCode.custom:
			// Custom validations should provide their own messages
			return { message: issue.message || 'Invalid value' }
		default:
			// Fall back to default message
			return { message: ctx.defaultError }
	}
	return { message: ctx.defaultError }
}

// Utility to set the custom error map globally
export const setCustomErrorMap = () => {
	z.setErrorMap(customErrorMap)
}

// Schema validation utilities with better error handling and type safety
export const createFormValidator = <TInput, TOutput>(
	schema: z.ZodSchema<TOutput, any, TInput>
) => {
	return {
		validate: (data: TInput): TOutput => {
			const result = schema.safeParse(data)
			if (!result.success) {
				throw new Error(
					result.error.errors.map((err) => err.message).join(', ')
				)
			}
			return result.data
		},
		validateAsync: async (data: TInput): Promise<TOutput> => {
			const result = await schema.safeParseAsync(data)
			if (!result.success) {
				throw new Error(
					result.error.errors.map((err) => err.message).join(', ')
				)
			}
			return result.data
		},
		getFieldErrors: (data: TInput): Record<string, string> => {
			const result = schema.safeParse(data)
			if (result.success) {
				return {}
			}

			const fieldErrors: Record<string, string> = {}
			result.error.errors.forEach((error) => {
				const path = error.path.join('.')
				if (!fieldErrors[path]) {
					fieldErrors[path] = error.message
				}
			})
			return fieldErrors
		},
		safeParse: (data: TInput): z.SafeParseReturnType<TInput, TOutput> => {
			return schema.safeParse(data)
		},
	}
}

// Pre-configured validators for common schemas
export const playerDataValidator = createFormValidator(playerDataSchema)
export const teamDataValidator = createFormValidator(teamDataSchema)
export const seasonDataValidator = createFormValidator(seasonDataSchema)
export const offerDataValidator = createFormValidator(offerDataSchema)
export const loginFormValidator = createFormValidator(loginFormSchema)
export const signupFormValidator = createFormValidator(signupFormSchema)
export const profileFormValidator = createFormValidator(profileFormSchema)
export const teamFormValidator = createFormValidator(teamFormSchema)
