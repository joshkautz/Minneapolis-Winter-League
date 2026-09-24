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

import { PARTICIPANT_PLACEHOLDER } from '../../../Functions/src/waiver/versions'

export {
	CURRENT_WAIVER_VERSION_ID,
	PARTICIPANT_PLACEHOLDER,
	WAIVER_VERSIONS,
	currentWaiverVersion,
	type WaiverParagraph,
	type WaiverVersion,
} from '../../../Functions/src/waiver/versions'
export {
	ADULT_AGE,
	WAIVER_LIMITS,
	isIsoDate,
	isMinorOn,
	leagueToday,
	waiverSubmissionErrors,
	type EmergencyContact,
	type WaiverField,
	type WaiverSubmission,
} from '../../../Functions/src/waiver/rules'

/** Puts the participant's name where the original waiver has a blank. */
export const fillParticipant = (text: string, participantName: string) =>
	text.split(PARTICIPANT_PLACEHOLDER).join(participantName)
