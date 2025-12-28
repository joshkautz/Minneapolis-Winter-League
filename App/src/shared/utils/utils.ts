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
