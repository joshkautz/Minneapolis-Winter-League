import { cn, ExtendedOfferData, OfferData, OfferType } from '@/shared/utils'
import { Button } from '@/components/ui/button'
import { DocumentData, DocumentReference } from '@/firebase/firestore'

export interface NotificationCardItemProps {
	type: OfferType
	data: ExtendedOfferData | any
	statusColor?: string
	message?: string
	actionOptions: {
		title: string
		action: (
			offerDocumentReference: DocumentReference<OfferData, DocumentData>
		) => void
	}[]
}

export const NotificationCardItem = ({
	type,
	data,
	statusColor,
	message,
	actionOptions,
}: NotificationCardItemProps) => {
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
					{type === OfferType.OUTGOING_INVITE ||
					type === OfferType.INCOMING_REQUEST
						? data.playerName
						: data.creatorName}
				</p>
				<p className='overflow-hidden text-sm max-h-5 text-muted-foreground'>
					{`${message} ${data.teamName}`}
				</p>
			</div>
			<div className='flex justify-end flex-1 gap-2'>
				{actionOptions.map(({ title, action }, index) => (
					<Button
						key={`action-${index}-${title}`}
						size={'sm'}
						variant={'outline'}
						onClick={() => {
							action(data.ref)
						}}
					>
						{title}
					</Button>
				))}
			</div>
		</div>
	)
}
