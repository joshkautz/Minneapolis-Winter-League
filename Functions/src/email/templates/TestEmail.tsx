/** A plain check that email is working, sent only to test recipients. */

import type { ReactElement } from 'react'
import {
	EmailLayout,
	Heading,
	Paragraph,
	type EmailFooter,
} from './EmailLayout.js'

export interface TestEmailProps {
	message: string
}

export const TestEmail = ({
	message,
	siteUrl,
	footer,
}: TestEmailProps & {
	recipientFirstName: string | null
	siteUrl: string
	footer: EmailFooter
}): ReactElement => (
	<EmailLayout preview={message} siteUrl={siteUrl} footer={footer}>
		<Heading>Email is working</Heading>
		<Paragraph>{message}</Paragraph>
	</EmailLayout>
)
