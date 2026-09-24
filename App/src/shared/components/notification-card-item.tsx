import { useState } from 'react'
import { cn, OfferDocument, OfferDirection } from '@/shared/utils'
import { DocumentReference } from '@/firebase'
import { OfferDocumentWithUI } from '@/shared/hooks'
import { usePendingAction } from '@/shared/hooks/use-pending-action'
import { LoadingButton } from './loading-button'

export interface NotificationCardItemProps {
	type: OfferDirection
	data: OfferDocumentWithUI
	statusColor?: string
	message?: string
	actionOptions: {
		title: string
		/** Shown on the button while its action runs, e.g. "Accepting...". */
		pendingTitle: string
		action: (
			offerDocumentReference: DocumentReference<OfferDocument>
		) => Promise<void>
	}[]
}

export const NotificationCardItem = ({
	type,
	data,
	statusColor,
	message,
	actionOptions,
}: NotificationCardItemProps) => {
	// One action at a time per offer: accepting and rejecting the same offer
	// at once can only fail. The spinner goes on the button that was pressed.
	const { pending, run } = usePendingAction()
	const [pendingTitle, setPendingTitle] = useState<string | null>(null)

	return (
		<div className='flex items-end gap-2 py-2'>
			{statusColor && (
				<span
					className={cn(
						'flex shrink-0 content-center self-start w-2 h-2 mt-2 mr-2 translate-y-1 rounded-full',
						statusColor
					)}
				/>
			)}
			<div className='mr-2'>
				<p>
					{type === OfferDirection.OUTGOING_INVITE ||
					type === OfferDirection.INCOMING_REQUEST
						? data.playerName
						: data.creatorName}
				</p>
				<p className='overflow-hidden text-sm max-h-5 text-muted-foreground'>
					{`${message} ${data.teamName}`}
				</p>
			</div>
			<div className='flex justify-end flex-1 gap-2'>
				{actionOptions.map((option, index) => (
					<LoadingButton
						key={`action-${index}-${option.title}`}
						size={'sm'}
						variant={'outline'}
						disabled={pending}
						loading={pending && pendingTitle === option.title}
						loadingText={option.pendingTitle}
						onClick={() => {
							setPendingTitle(option.title)
							void run(() => option.action(data.ref))
						}}
					>
						{option.title}
					</LoadingButton>
				))}
			</div>
		</div>
	)
}
