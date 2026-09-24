import {
	fillParticipant,
	type WaiverParagraph,
	type WaiverVersion,
} from '@/shared/waiver'
import { cn } from '@/shared/utils'

export const WaiverParagraphText = ({
	paragraph,
	participantName,
	className,
}: {
	paragraph: WaiverParagraph
	participantName: string
	className?: string
}) => (
	<p
		className={cn(
			'leading-relaxed',
			paragraph.emphasized && 'font-semibold',
			className
		)}
	>
		{paragraph.lead && <strong>{paragraph.lead}</strong>}
		{fillParticipant(paragraph.text, participantName)}
	</p>
)

/**
 * The body of the waiver, set as the original PDF sets it: bold openings,
 * and the key releases in bold capitals. Deliberately a plain, full-width
 * page of text rather than a small scrolling box, so it can be read — and
 * printed — like the document it is.
 */
export const WaiverDocument = ({
	version,
	participantName,
	headingId,
}: {
	version: WaiverVersion
	participantName: string
	/** Lets the surrounding section be labelled by the title. */
	headingId?: string
}) => (
	<article className='space-y-4 text-sm text-foreground'>
		<h2
			id={headingId}
			className='text-center text-lg font-semibold uppercase tracking-wide'
		>
			{version.title}
		</h2>
		{version.paragraphs.map((paragraph, index) => (
			<WaiverParagraphText
				key={index}
				paragraph={paragraph}
				participantName={participantName}
			/>
		))}
	</article>
)
