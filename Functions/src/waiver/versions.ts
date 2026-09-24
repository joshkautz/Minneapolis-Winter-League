/**
 * The league's Waiver and Release of Liability, as data.
 *
 * This is the one copy of the text. Functions fingerprints it to record
 * exactly what a player agreed to, and the App imports this same file to
 * show it — so it must stay free of imports, which is what lets both
 * workspaces load it.
 *
 * **A published version never changes.** A signature records a version id
 * and the SHA-256 of that version, and is only evidence if the text behind
 * that id is still the text the player saw. `versions.test.ts` pins
 * each version's hash, so editing one fails CI. To change the wording, add a
 * new version and point `CURRENT_WAIVER_VERSION_ID` at it; keep every old
 * one here for as long as its signatures are kept.
 */

/** One paragraph, set the way the league's original PDF sets it. */
export interface WaiverParagraph {
	/** An opening phrase in bold, such as "IN CONSIDERATION OF". */
	readonly lead?: string
	/** The rest of the paragraph, following `lead` directly. */
	readonly text: string
	/** The whole paragraph is in bold capitals in the original. */
	readonly emphasized?: boolean
}

export interface WaiverVersion {
	readonly id: string
	readonly title: string
	readonly paragraphs: readonly WaiverParagraph[]
	/** Above the emergency contacts on the original form. */
	readonly emergencyContactsIntro: string
	/** What an adult participant affirms by signing. */
	readonly adultAffirmation: string
	/** Introduces the parent or guardian section for a minor. */
	readonly guardianIntro: string
	/** What a parent or guardian certifies by signing for a minor. */
	readonly guardianCertification: WaiverParagraph
	/** The checkbox an adult participant ticks. */
	readonly agreement: string
	/** The checkbox a parent or guardian ticks for a minor. */
	readonly guardianAgreement: string
	/**
	 * Consent to sign electronically. Not in the paper original, which was
	 * signed by hand or through Dropbox Sign; here it is what makes a typed
	 * name a signature. It and the two checkboxes are what the signer
	 * actually clicks, so they are fingerprinted with the rest.
	 */
	readonly electronicSignatureConsent: string
}

/**
 * Stands for the participant's name wherever the original has a blank for
 * it. Rendered as the name on their profile; fingerprinted as written.
 */
export const PARTICIPANT_PLACEHOLDER = '{participant}'

/** The text players signed through Dropbox Sign until September 2026. */
const ORIGINAL: WaiverVersion = {
	id: '2026-09-original',
	title: 'Waiver and Release of Liability',
	paragraphs: [
		{
			lead: 'IN CONSIDERATION OF',
			text: ' the risk of injury that exists while participating in MINNEAPOLIS WINTER LEAGUE (hereinafter the "Activity"); and',
		},
		{
			lead: 'IN CONSIDERATION OF',
			text: ' my desire to participate in said Activity and being given the right to participate in same;',
		},
		{
			lead: 'I HEREBY',
			text: ', for myself, my heirs, executors, administrators, assigns, or personal representatives (hereinafter collectively, "Releasor," "I" or "me", which terms shall also include Releasor\'s parents or guardian if Releasor is under 18 years of age), knowingly and voluntarily enter into this WAIVER AND RELEASE OF LIABILITY and hereby waive any and all rights, claims or causes of action of any kind arising out of my participation in the Activity; and',
		},
		{
			lead: 'I HEREBY',
			text: ' release and forever discharge MINNEAPOLIS MALLARD, located at 4534 Washburn Ave N, Minneapolis, Minnesota 55412, their affiliates, managers, members, agents, attorneys, staff, volunteers, heirs, representatives, predecessors, successors and assigns (collectively "Releasees"), from any physical or psychological injury that I may suffer as a direct result of my participation in the aforementioned Activity.',
		},
		{
			emphasized: true,
			text: "I AM VOLUNTARILY PARTICIPATING IN THE AFOREMENTIONED ACTIVITY AND I AM PARTICIPATING IN THE ACTIVITY ENTIRELY AT MY OWN RISK. I AM AWARE OF THE RISKS ASSOCIATED WITH PARTICIPATING IN THIS ACTIVITY, WHICH MAY INCLUDE, BUT ARE NOT LIMITED TO: PHYSICAL OR PSYCHOLOGICAL INJURY, PAIN, SUFFERING, ILLNESS, DISFIGUREMENT, TEMPORARY OR PERMANENT DISABILITY (INCLUDING PARALYSIS), ECONOMIC OR EMOTIONAL LOSS, AND DEATH. I UNDERSTAND THAT THESE INJURIES OR OUTCOMES MAY ARISE FROM MY OWN OR OTHERS' NEGLIGENCE, CONDITIONS RELATED TO TRAVEL TO AND FROM THE ACTIVITY, OR FROM CONDITIONS AT THE ACTIVITY LOCATION(S). NONETHELESS, I ASSUME ALL RELATED RISKS, BOTH KNOWN AND UNKNOWN TO ME, OF MY PARTICIPATION IN THIS ACTIVITY.",
		},
		{
			lead: 'I FURTHER AGREE',
			text: " to indemnify, defend and hold harmless the Releasees against any and all claims, suits or actions of any kind whatsoever for liability, damages, compensation or otherwise brought by me or anyone on my behalf, including attorney's fees and any related costs.",
		},
		{
			lead: 'I FURTHER ACKNOWLEDGE',
			text: ' that Releasees are not responsible for errors, omissions, acts or failures to act of any party or entity conducting a specific event or activity on behalf of Releasees. In the event that I should require medical care or treatment, I authorize MINNEAPOLIS MALLARD to provide all emergency medical care deemed necessary, including but not limited to, first aid, CPR, the use of AEDs, emergency medical transport, and sharing of medical information with medical personnel. I further agree to assume all costs involved and agree to be financially responsible for any costs incurred as a result of such treatment. I am aware and understand that I should carry my own health insurance.',
		},
		{
			lead: 'I FURTHER ACKNOWLEDGE',
			text: " that this Activity may involve a test of a person's physical and mental limits and may carry with it the potential for death, serious injury, and property loss. I agree not to participate in the Activity unless I am medically able and properly trained, and I agree to abide by the decision of the MINNEAPOLIS MALLARD official or agent, regarding my approval to participate in the Activity.",
		},
		{
			emphasized: true,
			text: 'I HEREBY ACKNOWLEDGE THAT I HAVE CAREFULLY READ THIS "WAIVER AND RELEASE" AND FULLY UNDERSTAND THAT IT IS A RELEASE OF LIABILITY. I EXPRESSLY AGREE TO RELEASE AND DISCHARGE MINNEAPOLIS MALLARD AND ALL OF ITS AFFILIATES, MANAGERS, MEMBERS, AGENTS, ATTORNEYS, STAFF, VOLUNTEERS, HEIRS, REPRESENTATIVES, PREDECESSORS, SUCCESSORS AND ASSIGNS, FROM ANY AND ALL CLAIMS OR CAUSES OF ACTION AND I AGREE TO VOLUNTARILY GIVE UP OR WAIVE ANY RIGHT THAT I OTHERWISE HAVE TO BRING A LEGAL ACTION AGAINST MINNEAPOLIS MALLARD FOR PERSONAL INJURY OR PROPERTY DAMAGE.',
		},
		{
			text: 'To the extent that statute or case law does not prohibit releases for ordinary negligence, this release is also for such negligence on the part of MINNEAPOLIS MALLARD, its agents, and employees.',
		},
		{
			text: 'I agree that this Release shall be governed for all purposes by Minnesota law, without regard to any conflict of law principles. This Release supersedes any and all previous oral or written promises or other agreements.',
		},
		{
			text: 'I understand that MINNEAPOLIS MALLARD reserves the right to suspend or permanently ban any participants from the Activity without refund at its sole discretion. This authority may be exercised in response to behavior deemed inappropriate, disruptive, or dangerous, including but not limited to harassment, threats, substance abuse, dangerous conduct, or any actions that compromise the safety and well-being of other participants. MINNEAPOLIS MALLARD, its officers employees, and volunteers shall be immune from any liability, claims, or damages arising from the decision to suspend or ban a participant. Participants acknowledge that MINNEAPOLIS MALLARD has a duty to maintain a safe and positive environment for all, and that the exercise of this authority is necessary to fulfill that duty. Participants who are suspended or banned shall receive written notification of the decision, which will include the reasons for the action and any applicable duration of the suspension or ban. At its discretion, MINNEAPOLIS MALLARD may also provide procedures for appealing a suspension or ban.',
		},
		{
			text: "In the event that any damage to equipment or facilities occurs as a result of my or my family's or my agent's willful actions, neglect or recklessness, I acknowledge and agree to be held liable for any and all costs associated with any such actions of neglect or recklessness.",
		},
		{
			emphasized: true,
			text: 'THIS WAIVER AND RELEASE OF LIABILITY SHALL REMAIN IN EFFECT FOR THE DURATION OF MY PARTICIPATION IN THE ACTIVITY, DURING THIS INITIAL AND ALL SUBSEQUENT EVENTS OF PARTICIPATION.',
		},
		{
			lead: 'THIS AGREEMENT',
			text: ` was entered into at arm's-length, without duress or coercion, and is to be interpreted as an agreement between two parties of equal bargaining strength. Both Participant, ${PARTICIPANT_PLACEHOLDER} and MINNEAPOLIS MALLARD agree that this agreement is clear and unambiguous as to its terms, and that no other evidence shall be used or admitted to alter or explain the terms of this agreement, but that it will be interpreted based on the language in accordance with the purposes for which it is entered into.`,
		},
		{
			text: 'In the event that any provision contained within this Release of Liability shall be deemed to be severable or invalid, or if any term, condition, phrase or portion of this agreement shall be determined to be unlawful or otherwise unenforceable, the remainder of this agreement shall remain in full force and effect. If a court should find that any provision of this agreement to be invalid or unenforceable, but that by limiting said provision it would become valid and enforceable, then said provision shall be deemed to be written, construed and enforced as so limited.',
		},
	],
	emergencyContactsIntro:
		'In the event of an emergency, please contact the following person(s) in the order presented:',
	adultAffirmation:
		'I, THE UNDERSIGNED PARTICIPANT, AFFIRM THAT I AM OF THE AGE OF 18 YEARS OR OLDER, AND THAT I AM FREELY SIGNING THIS AGREEMENT. I CERTIFY THAT I HAVE READ THIS AGREEMENT, THAT I FULLY UNDERSTAND ITS CONTENT AND THAT THIS RELEASE CANNOT BE MODIFIED ORALLY. I AM AWARE THAT THIS IS A RELEASE OF LIABILITY AND A CONTRACT AND THAT I AM SIGNING IT OF MY OWN FREE WILL.',
	guardianIntro:
		'In the event that the participant is under the age of consent (18 years of age), then this release must be signed by a parent or guardian, as follows:',
	guardianCertification: {
		lead: 'I HEREBY CERTIFY',
		text: ` that I am the parent or guardian of ${PARTICIPANT_PLACEHOLDER}, named above, and do hereby give my consent without reservation to the foregoing on behalf of this individual.`,
	},
	agreement:
		'I have read and agree to this Waiver and Release of Liability, and I agree to sign it electronically.',
	guardianAgreement: `I am the parent or guardian of ${PARTICIPANT_PLACEHOLDER}. I have read and agree to this Waiver and Release of Liability on their behalf, and I agree to sign it electronically.`,
	electronicSignatureConsent:
		'Typing a name here is a signature, with the same legal effect as signing by hand.',
}

/** Every version players have signed, by id. Never remove one. */
export const WAIVER_VERSIONS: Readonly<Record<string, WaiverVersion>> = {
	[ORIGINAL.id]: ORIGINAL,
}

/** The version a player signs today. */
export const CURRENT_WAIVER_VERSION_ID = ORIGINAL.id

export const currentWaiverVersion = (): WaiverVersion =>
	WAIVER_VERSIONS[CURRENT_WAIVER_VERSION_ID]
