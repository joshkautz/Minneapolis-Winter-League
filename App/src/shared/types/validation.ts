/**
 * Validation type definitions
 *
 * Type-safe definitions for form validation and data validation schemas
 */

// Form validation result types
export interface ValidationResult<T = unknown> {
	success: boolean
	data?: T
	errors?: ValidationError[]
}

export interface ValidationError {
	field: string
	message: string
	code?: string
}

// Generic validation function type
export type ValidatorFunction<T> = (value: unknown) => ValidationResult<T>

// Form field validation state
export interface FieldValidationState {
	isValid: boolean
	isDirty: boolean
	isTouched: boolean
	error?: string
}

// Form validation state
export interface FormValidationState {
	isValid: boolean
	isSubmitting: boolean
	hasErrors: boolean
	fields: Record<string, FieldValidationState>
}

// Custom validation rule type
export interface CustomValidationRule<T = unknown> {
	validate: (value: T) => boolean | Promise<boolean>
	message: string
	code?: string
}

// Conditional validation rule
export interface ConditionalValidationRule<T = unknown> {
	condition: (data: Record<string, unknown>) => boolean
	rule: CustomValidationRule<T>
}

// File validation constraints
export interface FileValidationConstraints {
	maxSize?: number // in bytes
	allowedTypes?: string[]
	maxFiles?: number
	minFiles?: number
}

// Password strength requirements
export interface PasswordStrengthRequirements {
	minLength: number
	requireUppercase: boolean
	requireLowercase: boolean
	requireNumbers: boolean
	requireSpecialChars: boolean
	forbiddenPatterns?: RegExp[]
}

// Email validation options
export interface EmailValidationOptions {
	allowInternational?: boolean
	requireTLD?: boolean
	blockedDomains?: string[]
	allowedDomains?: string[]
}

// Phone number validation options
export interface PhoneValidationOptions {
	country?: string
	format?: 'E164' | 'NATIONAL' | 'INTERNATIONAL'
	allowExtensions?: boolean
}

// Date validation constraints
export interface DateValidationConstraints {
	minDate?: Date
	maxDate?: Date
	allowPast?: boolean
	allowFuture?: boolean
	allowWeekends?: boolean
	excludedDates?: Date[]
}
