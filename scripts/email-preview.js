#!/usr/bin/env node

/**
 * Renders every email template with its sample props to
 * `.email-previews/<template>.html` (and `.txt`), for review in a browser.
 * Sends nothing.
 *
 *   npm run email:preview
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const { TEMPLATES } = await import(
	join(root, 'Functions/dist/email/templates.js')
)
const { renderEmail } = await import(
	join(root, 'Functions/dist/email/render.js')
)

const out = join(root, '.email-previews')
mkdirSync(out, { recursive: true })

for (const [name, definition] of Object.entries(TEMPLATES)) {
	const email = await renderEmail(name, definition.sample, {
		recipientFirstName: 'Josh',
		unsubscribeUrl: 'https://mplswinterleague.com/email-preferences',
	})
	writeFileSync(join(out, `${name}.html`), email.html)
	writeFileSync(
		join(out, `${name}.txt`),
		`Subject: ${email.subject}\n\n${email.text}`
	)
	console.log(`${name}: ${email.subject}`)
}
console.log(`\nWrote previews to ${out}`)
