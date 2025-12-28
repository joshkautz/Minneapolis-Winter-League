/**
 * Environment detection utilities
 */

/**
 * Determine if the app is running in development mode
 */
export const isDevelopment = (): boolean => {
	return (
		import.meta.env.DEV ||
		import.meta.env.VITE_USE_EMULATORS === 'true' ||
		import.meta.env.MODE === 'development'
	)
}
