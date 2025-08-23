import { config as productionConfig } from './config'
import { config as developmentConfig } from './config.development'
import { config as stagingConfig } from './config.staging'

// Get environment from Vite environment variables
const environment = import.meta.env?.VITE_FIREBASE_ENV || 'production'
const useEmulators = import.meta.env?.VITE_USE_EMULATORS === 'true'

let config: typeof productionConfig

switch (environment) {
	case 'development':
		config = developmentConfig
		break
	case 'staging':
		config = stagingConfig
		break
	case 'production':
	default:
		config = productionConfig
		break
}

// Log which environment we're using (only in development)
if (import.meta.env?.DEV) {
	console.log(`🔥 Firebase environment: ${environment}`)
	console.log(`🔥 Project ID: ${config.projectId}`)
	console.log(`🔥 Use emulators: ${useEmulators}`)
}

export { config, environment, useEmulators }
