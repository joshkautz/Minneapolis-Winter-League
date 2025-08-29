/**
 * Authentication utilities for Firebase Functions
 */

/**
 * Validates that a user is authenticated and has a verified email
 */
export function validateAuthentication(auth: any): void {
	if (!auth?.uid) {
		throw new Error('Authentication required')
	}

	if (!auth.token?.email_verified) {
		throw new Error('Email verification required')
	}
}

/**
 * Validates that a user is an admin
 */
export async function validateAdminUser(auth: any, firestore: any): Promise<void> {
	validateAuthentication(auth)
	
	const userDoc = await firestore.collection('players').doc(auth.uid).get()
	
	if (!userDoc.exists || !userDoc.data()?.admin) {
		throw new Error('Admin privileges required')
	}
}
