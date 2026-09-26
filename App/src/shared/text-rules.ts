/**
 * Length rules for written text — badges, news, posts and replies — imported
 * from `Functions/src/shared/textRules.ts` so a form refuses text in the
 * server's own words. That file has no imports, which is what makes loading
 * it from the other workspace safe.
 */

export {
	TEXT_RULES,
	textProblem,
	type TextRule,
} from '../../../Functions/src/shared/textRules'
