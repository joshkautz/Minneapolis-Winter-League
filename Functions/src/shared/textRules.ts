/**
 * Length rules for the text admins and players write: badges, news, posts
 * and replies.
 *
 * The App imports this file (`App/src/shared/text-rules.ts`) so a form can
 * refuse text in the same words the server would. Keep it free of imports:
 * it is loaded from the other workspace.
 */

export interface TextRule {
	/** How the message names the field: "Title", "Post content". */
	label: string
	min: number
	max: number
}

export const TEXT_RULES = {
	badgeName: { label: 'Name', min: 3, max: 100 },
	badgeDescription: { label: 'Description', min: 10, max: 500 },
	newsTitle: { label: 'Title', min: 3, max: 200 },
	newsContent: { label: 'Content', min: 10, max: 10_000 },
	postContent: { label: 'Post content', min: 10, max: 2_000 },
	replyContent: { label: 'Reply content', min: 10, max: 1_000 },
} as const satisfies Record<string, TextRule>

/** Why `value` breaks `rule` — missing, too short, too long — or null. */
export const textProblem = (value: unknown, rule: TextRule): string | null => {
	if (typeof value !== 'string' || value.trim() === '') {
		return `${rule.label} is required.`
	}
	const length = value.trim().length
	if (length < rule.min) {
		return `${rule.label} must be at least ${rule.min} characters long.`
	}
	if (length > rule.max) {
		return `${rule.label} must not exceed ${rule.max.toLocaleString('en-US')} characters.`
	}
	return null
}
