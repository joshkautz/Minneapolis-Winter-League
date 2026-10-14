/**
 * The league waiver's text and signing rules.
 *
 * They live in Functions (`Functions/src/waiver/`), which is the only place
 * a signature is recorded, and are imported here rather than copied: a
 * liability waiver that the App and the server could each word differently
 * is exactly what must not happen. Both files are plain data and pure
 * functions with no imports, which is what makes loading them from the other
 * workspace safe.
 */

export {
	CURRENT_WAIVER_VERSION_ID,
	WAIVER_VERSIONS,
	currentWaiverVersion,
	fillParticipant,
	type WaiverParagraph,
	type WaiverVersion,
} from '../../../Functions/src/waiver/versions'
export {
	WAIVER_LIMITS,
	WAIVER_REMINDER_COOLDOWN_MS,
	isIsoDate,
	isMinorOn,
	leagueToday,
	waiverSubmissionErrors,
	type EmergencyContact,
	type WaiverField,
	type WaiverSubmission,
} from '../../../Functions/src/waiver/rules'
