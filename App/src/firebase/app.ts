import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
import { connectStorageEmulator, getStorage } from 'firebase/storage'
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions'

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
]

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
export const functions = getFunctions(app)

// Environment configuration
const isDevelopment = import.meta.env.DEV
const useEmulators = import.meta.env.VITE_USE_EMULATORS === 'true'

// Connect to emulators when enabled
if (useEmulators && isDevelopment) {
	try {
		// Auth emulator
		connectAuthEmulator(auth, 'http://localhost:9099', {
			disableWarnings: true,
		})

		// Firestore emulator
		connectFirestoreEmulator(firestore, 'localhost', 8080)

		// Storage emulator
		connectStorageEmulator(storage, 'localhost', 9199)

		// Functions emulator
		connectFunctionsEmulator(functions, 'localhost', 5001)

		console.log('🔥 Connected to Firebase emulators')
		console.log(`🔥 Project ID: ${firebaseConfig.projectId}`)
		console.log(`🔥 Environment: development (emulators)`)
	} catch (error) {
		console.warn('⚠️  Failed to connect to emulators:', error)
	}
} else if (isDevelopment) {
	console.log('🔥 Firebase initialized in development mode (no emulators)')
	console.log(`🔥 Project ID: ${firebaseConfig.projectId}`)
} else {
	console.log('🔥 Firebase initialized in production mode')
	console.log(`🔥 Project ID: ${firebaseConfig.projectId}`)
}

// Export configuration for debugging
export { firebaseConfig, isDevelopment, useEmulators }
