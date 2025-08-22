/**
 * Form validation utilities
 * 
 * Reusable validation functions and schemas for forms
 */

import * as z from 'zod'

// Common validation schemas
export const emailSchema = z.string().email('Please enter a valid email address')

export const passwordSchema = z
	.string()
	.min(6, 'Password must be at least 6 characters')

export const nameSchema = z
	.string()
	.min(2, 'Name must be at least 2 characters')
	.max(50, 'Name must be less than 50 characters')

export const teamNameSchema = z
	.string()
	.min(2, 'Team name must be at least 2 characters')
	.max(30, 'Team name must be less than 30 characters')

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

// Phone number validation
export const phoneSchema = z
	.string()
	.regex(/^\(\d{3}\) \d{3}-\d{4}$/, 'Please enter a valid phone number')

export const validatePhoneNumber = (phone: string): boolean => {
	return phoneSchema.safeParse(phone).success
}

// File validation
export const validateImageFile = (file: File): boolean => {
	const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
	const maxSize = 5 * 1024 * 1024 // 5MB
	
	return allowedTypes.includes(file.type) && file.size <= maxSize
}

export const getFileValidationError = (file: File): string | null => {
	const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
	const maxSize = 5 * 1024 * 1024 // 5MB
	
	if (!allowedTypes.includes(file.type)) {
		return 'Please select a valid image file (JPEG, PNG, GIF, or WebP)'
	}
	
	if (file.size > maxSize) {
		return 'Image file must be less than 5MB'
	}
	
	return null
}
