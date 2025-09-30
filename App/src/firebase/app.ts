import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
import { connectStorageEmulator, getStorage } from 'firebase/storage'
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions'
import { logger } from '@/shared/utils'

// Firebase configuration from environment variables
const firebaseConfig = {
	apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
	authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
	projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
	storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
	messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
	appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

// Validate required environment variables
const requiredEnvVars = [
	'VITE_FIREBASE_API_KEY',
	'VITE_FIREBASE_AUTH_DOMAIN',
	'VITE_FIREBASE_PROJECT_ID',
	'VITE_FIREBASE_STORAGE_BUCKET',
	'VITE_FIREBASE_MESSAGING_SENDER_ID',
	'VITE_FIREBASE_APP_ID',
] as const

for (const envVar of requiredEnvVars) {
	if (!import.meta.env[envVar]) {
		throw new Error(`Missing required environment variable: ${envVar}`)
	}
}

// Initialize Firebase
export const app = initializeApp(firebaseConfig)

// Initialize Firebase services
export const auth = getAuth(app)
export const firestore = getFirestore(app)
export const storage = getStorage(app)
export const functions = getFunctions(app, 'us-central1')

// Connect to emulators when enabled
const useEmulators = import.meta.env.VITE_USE_EMULATORS === 'true'

if (useEmulators) {
	try {
		// Connect to all emulators
		connectAuthEmulator(auth, 'http://localhost:9099', {
			disableWarnings: true,
		})
		connectFirestoreEmulator(firestore, 'localhost', 8080)
		connectStorageEmulator(storage, 'localhost', 9199)
		connectFunctionsEmulator(functions, 'localhost', 5001)

		logger.info(`Firebase connected to emulators`, {
			component: 'firebase',
			projectId: firebaseConfig.projectId,
		})
	} catch (error) {
		logger.warn('Failed to connect to Firebase emulators', {
			component: 'firebase',
			error: error instanceof Error ? error.message : String(error),
		})
	}
} else {
	logger.info(`Firebase initialized`, {
		component: 'firebase',
		projectId: firebaseConfig.projectId,
		mode: import.meta.env.DEV ? 'development' : 'production',
	})
}

// Export configuration for debugging
export { firebaseConfig, useEmulators }
