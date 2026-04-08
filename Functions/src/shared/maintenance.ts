/**
 * Migration kill-switch helper.
 *
 * While `system/maintenance.migrationInProgress === true`, every Firestore
 * trigger should early-return without writing, so that a long-running
 * migration script can write to canonical collections without racing or
 * being amplified by trigger fan-out.
 *
 * The flag doc is write-locked to admins by firestore.rules.
 */

import type { Firestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'

const MAINTENANCE_DOC_PATH = 'system/maintenance'

/**
 * Returns true if the migration kill-switch flag is set. Triggers should
 * early-return without writing when this returns true.
 */
export const isMigrationInProgress = async (
	firestore: Firestore
): Promise<boolean> => {
	try {
		const snap = await firestore.doc(MAINTENANCE_DOC_PATH).get()
		return snap.exists && snap.data()?.migrationInProgress === true
	} catch (error) {
		// If we can't read the doc, default to false — never block production
		// triggers because of a transient read failure on the kill-switch.
		logger.warn('Failed to read migration kill-switch flag', error)
		return false
	}
}

export const MAINTENANCE_FLAG_PATH = MAINTENANCE_DOC_PATH
