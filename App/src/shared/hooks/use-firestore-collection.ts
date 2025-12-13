/**
 * useFirestoreCollection - Enhanced Firestore collection hook with error handling
 *
 * Wraps react-firebase-hooks/firestore useCollection with:
 * - Automatic error logging to console
 * - Optional toast notifications for errors
 * - Structured return type that always includes error state
 * - Helpful debugging information for index errors
 */

import { useEffect, useRef } from 'react'
import { useCollection } from 'react-firebase-hooks/firestore'
import {
	type Query,
	type DocumentData,
	type QuerySnapshot,
	type FirestoreError,
} from 'firebase/firestore'
import { toast } from 'sonner'

import { logger } from '@/shared/utils'

export interface UseFirestoreCollectionOptions {
	/**
	 * Whether to show toast notifications on error
	 * @default true
	 */
	showToast?: boolean

	/**
	 * Custom toast title for errors
	 */
	toastTitle?: string

	/**
	 * Whether to log errors to console
	 * @default true
	 */
	logErrors?: boolean

	/**
	 * Name/identifier for this query (used in logging)
	 */
	queryName?: string
}

export interface UseFirestoreCollectionReturn<T extends DocumentData> {
	/** The query snapshot */
	snapshot: QuerySnapshot<T> | undefined
	/** Whether the query is loading */
	loading: boolean
	/** Any error that occurred */
	error: FirestoreError | undefined
	/** Whether there's an error */
	hasError: boolean
}

/**
 * Enhanced useCollection hook with built-in error handling
 *
 * @example
 * ```tsx
 * const { snapshot, loading, error, hasError } = useFirestoreCollection(
 *   allBadgesQuery(),
 *   { queryName: 'badges', toastTitle: 'Failed to load badges' }
 * )
 *
 * if (hasError) {
 *   return <QueryError error={error!} />
 * }
 * ```
 */
export const useFirestoreCollection = <T extends DocumentData = DocumentData>(
	query: Query<T> | null | undefined,
	options: UseFirestoreCollectionOptions = {}
): UseFirestoreCollectionReturn<T> => {
	const {
		showToast = true,
		toastTitle = 'Failed to load data',
		logErrors = true,
		queryName = 'unknown',
	} = options

	// Use the underlying hook
	const [snapshot, loading, error] = useCollection<T>(query)

	// Track if we've already shown a toast for this error to avoid duplicates
	const lastErrorRef = useRef<string | null>(null)

	// Handle errors
	useEffect(() => {
		if (error) {
			const errorKey = `${queryName}-${error.message}`

			// Log error to console
			if (logErrors) {
				logger.error(`Firestore query error [${queryName}]:`, {
					component: 'useFirestoreCollection',
					queryName,
					error: error.message,
					code: 'code' in error ? error.code : undefined,
				})

				// Check for index errors and provide helpful guidance
				if (error.message.includes('index')) {
					const indexUrlMatch = error.message.match(
						/https:\/\/console\.firebase\.google\.com[^\s)]+/
					)
					if (indexUrlMatch) {
						logger.info(
							`Create the required index here: ${indexUrlMatch[0]}`,
							{ component: 'useFirestoreCollection', queryName }
						)
					}
				}
			}

			// Show toast notification (avoid duplicates)
			if (showToast && lastErrorRef.current !== errorKey) {
				lastErrorRef.current = errorKey

				// Customize message based on error type
				let description = error.message
				if (error.message.includes('index')) {
					description =
						'A database index is required. Check the browser console for details.'
				} else if (
					error.message.includes('permission') ||
					('code' in error && error.code === 'permission-denied')
				) {
					description = 'You don\'t have permission to access this data.'
				}

				toast.error(toastTitle, {
					description,
					duration: 5000,
				})
			}
		} else {
			// Reset error tracking when error clears
			lastErrorRef.current = null
		}
	}, [error, queryName, showToast, toastTitle, logErrors])

	return {
		snapshot,
		loading,
		error,
		hasError: !!error,
	}
}

/**
 * Hook for handling multiple collection queries with unified error handling
 *
 * @example
 * ```tsx
 * const errors = useFirestoreCollectionErrors([
 *   { error: badgesError, name: 'badges' },
 *   { error: teamsError, name: 'teams' },
 * ])
 *
 * if (errors.hasErrors) {
 *   return <QueryError error={errors.firstError!} />
 * }
 * ```
 */
export interface CollectionErrorEntry {
	error: Error | undefined
	name: string
}

export interface UseFirestoreCollectionErrorsReturn {
	hasErrors: boolean
	firstError: Error | undefined
	allErrors: Array<{ name: string; error: Error }>
}

export const useFirestoreCollectionErrors = (
	entries: CollectionErrorEntry[],
	options: Omit<UseFirestoreCollectionOptions, 'queryName'> = {}
): UseFirestoreCollectionErrorsReturn => {
	const { showToast = true, logErrors = true } = options

	const lastErrorsRef = useRef<Set<string>>(new Set())

	const allErrors = entries
		.filter((entry): entry is { name: string; error: Error } => !!entry.error)
		.map(({ name, error }) => ({ name, error }))

	useEffect(() => {
		const currentErrorKeys = new Set<string>()

		allErrors.forEach(({ name, error }) => {
			const errorKey = `${name}-${error.message}`
			currentErrorKeys.add(errorKey)

			// Only process new errors
			if (!lastErrorsRef.current.has(errorKey)) {
				if (logErrors) {
					logger.error(`Firestore query error [${name}]:`, {
						component: 'useFirestoreCollectionErrors',
						queryName: name,
						error: error.message,
					})
				}

				if (showToast) {
					toast.error(`Failed to load ${name}`, {
						description: error.message,
						duration: 5000,
					})
				}
			}
		})

		lastErrorsRef.current = currentErrorKeys
	}, [allErrors, showToast, logErrors])

	return {
		hasErrors: allErrors.length > 0,
		firstError: allErrors[0]?.error,
		allErrors,
	}
}
