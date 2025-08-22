/**
 * String formatting utilities
 * 
 * Reusable functions for string manipulation and formatting
 */

/**
 * Generate message for pending requests count
 */
export const getRequestMessage = (count: number | undefined): string => {
	if (!count || count === 0) {
		return 'no requests pending at this time.'
	}
	if (count === 1) {
		return 'you have one pending request.'
	}
	return `you have ${count} pending requests.`
}

/**
 * Generate message for pending invites count
 */
export const getInviteMessage = (count: number | undefined): string => {
	if (!count || count === 0) {
		return 'no invites pending at this time.'
	}
	if (count === 1) {
		return 'you have one pending invite.'
	}
	return `you have ${count} pending invites.`
}

/**
 * Capitalize first letter of a string
 */
export const capitalize = (str: string): string => {
	if (!str) return str
	return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

/**
 * Convert string to title case
 */
export const toTitleCase = (str: string): string => {
	return str
		.toLowerCase()
		.split(' ')
		.map(word => capitalize(word))
		.join(' ')
}

/**
 * Truncate string with ellipsis
 */
export const truncate = (str: string, maxLength: number): string => {
	if (str.length <= maxLength) return str
	return str.slice(0, maxLength - 3) + '...'
}

/**
 * Generate initials from a name
 */
export const getInitials = (firstName: string, lastName?: string): string => {
	if (!firstName) return ''
	
	const first = firstName.charAt(0).toUpperCase()
	const last = lastName ? lastName.charAt(0).toUpperCase() : ''
	
	return first + last
}

/**
 * Format full name from first and last name
 */
export const formatFullName = (firstName: string, lastName?: string): string => {
	if (!firstName) return ''
	if (!lastName) return firstName
	return `${firstName} ${lastName}`
}

/**
 * Generate a slug from a string
 */
export const slugify = (str: string): string => {
	return str
		.toLowerCase()
		.trim()
		.replace(/[^\w\s-]/g, '') // Remove special characters
		.replace(/\s+/g, '-') // Replace spaces with hyphens
		.replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
}

/**
 * Pluralize a word based on count
 */
export const pluralize = (word: string, count: number): string => {
	if (count === 1) return word
	
	// Simple pluralization rules
	if (word.endsWith('y')) {
		return word.slice(0, -1) + 'ies'
	}
	if (word.endsWith('s') || word.endsWith('sh') || word.endsWith('ch')) {
		return word + 'es'
	}
	return word + 's'
}
