/**
 * Firebase Admin SDK Initialization Module
 *
 * The Firebase Admin Node.js SDK enables access to Firebase services from
 * privileged environments (such as servers or cloud) in Node.js.
 *
 * This module provides a safe wrapper around Firebase Admin initialization
 * to prevent "app already exists" errors during hot reloads, cold starts,
 * and multiple function imports.
 */
import {
	initializeApp as _initializeApp,
	getApps,
	getApp,
} from 'firebase-admin/app'

/**
 * Creates and initializes a Firebase Admin app instance safely.
 *
 * This function prevents multiple initialization attempts by checking if
 * a Firebase app already exists before trying to create a new one.
 *
 * **Why this wrapper is needed:**
 * - Firebase Admin can only be initialized once per process
 * - Direct calls to `_initializeApp()` will throw "app already exists" errors
 * - Hot reloads during development can trigger multiple initialization attempts
 * - Function cold starts and module imports may cause duplicate calls
 *
 * **How it works:**
 * 1. Check if any Firebase apps are already initialized (`getApps().length === 0`)
 * 2. If no apps exist, initialize a new default app with `_initializeApp()`
 * 3. If an app already exists, get the existing default app with `getApp()`
 *
 * This makes Firebase initialization **idempotent** - safe to call multiple times.
 *
 * @returns void - Firebase Admin app is available globally after initialization
 *
 * @example
 * ```typescript
 * // Safe to call multiple times
 * initializeApp()
 * initializeApp() // Won't throw error
 *
 * // Now you can use Firebase Admin services
 * import { getFirestore } from 'firebase-admin/firestore'
 * const db = getFirestore()
 * ```
 */
export const initializeApp = () => {
	if (getApps().length === 0) {
		_initializeApp()
	} else {
		getApp()
	}
}
