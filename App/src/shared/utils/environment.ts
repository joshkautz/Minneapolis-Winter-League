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

/**
 * Determine if the app is running in production mode
 */
export const isProduction = (): boolean => {
	return import.meta.env.PROD && import.meta.env.VITE_USE_EMULATORS !== 'true'
}

/**
 * Get current environment name
 */
export const getEnvironment = (): 'development' | 'production' | 'staging' => {
	if (import.meta.env.MODE === 'staging') {
		return 'staging'
	}

	if (isDevelopment()) {
		return 'development'
	}

	return 'production'
}

/**
 * Environment-specific configuration
 */
export const envConfig = {
	isDevelopment: isDevelopment(),
	isProduction: isProduction(),
	environment: getEnvironment(),
	useEmulators: import.meta.env.VITE_USE_EMULATORS === 'true',
} as const
