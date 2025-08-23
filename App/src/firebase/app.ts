import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
import { connectStorageEmulator, getStorage } from 'firebase/storage'
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions'
import { config, useEmulators } from './config.loader'

export const app = initializeApp(config)

// Initialize Firebase services
export const auth = getAuth(app)
export const firestore = getFirestore(app)
export const storage = getStorage(app)
export const functions = getFunctions(app)

// Connect to emulators if in development mode
if (useEmulators && import.meta.env?.DEV) {
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
	} catch (error) {
		console.warn('⚠️  Failed to connect to emulators:', error)
	}
}
