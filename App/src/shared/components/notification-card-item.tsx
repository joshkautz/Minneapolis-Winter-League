import { cn, OfferDocument, OfferDirection } from '@/shared/utils'
import { Button } from '@/components/ui/button'
import { DocumentReference } from '@/firebase/firestore'
import { OfferDocumentWithUI } from '@/shared/hooks'
import { LoadingSpinner } from '@/shared/components'

export interface NotificationCardItemProps {
	type: OfferDirection
	data: OfferDocumentWithUI
	statusColor?: string
	message?: string
	actionOptions: {
		title: string
		action: (offerDocumentReference: DocumentReference<OfferDocument>) => void
		isLoading?: boolean
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
				{actionOptions.map(({ title, action, isLoading }, index) => (
					<Button
						key={`action-${index}-${title}`}
						size={'sm'}
						variant={'outline'}
						disabled={isLoading || actionOptions.some((opt) => opt.isLoading)}
						onClick={() => {
							action(data.ref)
						}}
					>
						{isLoading ? (
							<>
								<LoadingSpinner size='sm' withMargin={false} />
								<span className='ml-2'>Loading...</span>
							</>
						) : (
							title
						)}
					</Button>
				))}
			</div>
		</div>
	)
}
