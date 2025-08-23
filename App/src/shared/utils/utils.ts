import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Core utilities
 *
 * Essential utility functions used throughout the application
 */

/**
 * Combine and merge Tailwind CSS classes
 */
export const cn = (...inputs: ClassValue[]) => {
	return twMerge(clsx(inputs))
}

/**
 * Create a delay/sleep function
 */
export const delay = (ms: number): Promise<void> => {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Safe JSON parse with fallback
 */
export const safeJsonParse = <T>(str: string, fallback: T): T => {
	try {
		return JSON.parse(str)
	} catch {
		return fallback
	}
}

/**
 * Generate a random ID
 */
export const generateId = (): string => {
	return Math.random().toString(36).substring(2) + Date.now().toString(36)
}

/**
 * Deep clone an object
 */
export const deepClone = <T>(obj: T): T => {
	return JSON.parse(JSON.stringify(obj))
}

/**
 * Check if value is empty (null, undefined, empty string, empty array, empty object)
 */
export const isEmpty = (value: unknown): boolean => {
	if (value == null) return true
	if (typeof value === 'string') return value.trim() === ''
	if (Array.isArray(value)) return value.length === 0
	if (typeof value === 'object') return Object.keys(value).length === 0
	return false
}
