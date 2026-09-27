/** Renders a template to the subject, HTML and plain text an email needs. */

import { createElement } from 'react'
import { render } from '@react-email/components'
import { EMAIL_CONFIG } from '../config/constants.js'
import type { EmailCategory } from '../types.js'
import {
	TEMPLATES,
	type EmailContext,
	type TemplateDefinition,
	type TemplateName,
	type TemplateProps,
} from './templates.js'

export interface RenderedEmail {
	subject: string
	html: string
	text: string
	category: EmailCategory
}

export interface RecipientContext {
	recipientFirstName: string | null
	/** Present for email a player can turn off. */
	unsubscribeUrl: string | null
}

export async function renderEmail<Name extends TemplateName>(
	name: Name,
	props: TemplateProps<Name>,
	recipient: RecipientContext
): Promise<RenderedEmail> {
	const definition = TEMPLATES[name] as unknown as TemplateDefinition<
		TemplateProps<Name>
	>
	const context: EmailContext = {
		recipientFirstName: recipient.recipientFirstName,
		siteUrl: EMAIL_CONFIG.SITE_URL,
		footer: {
			reason: definition.footerReason,
			unsubscribeUrl:
				definition.category === 'account' ? null : recipient.unsubscribeUrl,
			postalAddress:
				definition.category === 'announcements'
					? EMAIL_CONFIG.POSTAL_ADDRESS
					: null,
		},
	}
	// Each template's props are a plain object; the generic conditional type
	// just cannot say so.
	const element = createElement(definition.component, {
		...(props as object),
		...context,
	} as TemplateProps<Name> & EmailContext)
	const [html, text] = await Promise.all([
		render(element),
		render(element, { plainText: true }),
	])
	return {
		subject: definition.subject(props),
		html,
		text,
		category: definition.category,
	}
}
