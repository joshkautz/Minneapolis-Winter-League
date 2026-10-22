import { useCollection } from 'react-firebase-hooks/firestore'
import { History } from 'lucide-react'
import { nameHistoryQuery, playerRefById } from '@/firebase/collections/players'
import { displayName } from '@/shared/name-rules'
import { useAuthorName, useQueryErrorHandler } from '@/shared/hooks'
import { formatTimestampWithTime } from '@/shared/utils'
import type { NameHistoryDocument } from '@/types'

/** Who made a change, as the history says it. */
const ChangedBy = ({
	entry,
	playerId,
}: {
	entry: NameHistoryDocument
	playerId: string
}) => {
	const adminRef = playerRefById(entry.changedBy)
	if (entry.source === 'signup') return <>signed up as</>
	if (entry.changedBy === playerId) return <>the player changed it to</>
	return adminRef ? (
		<AdminChange adminRef={adminRef} />
	) : (
		<>an admin changed it to</>
	)
}

const AdminChange = ({
	adminRef,
}: {
	adminRef: NonNullable<ReturnType<typeof playerRefById>>
}) => {
	const name = useAuthorName(adminRef, 'a former admin')
	return <>{name} changed it to</>
}

/**
 * Every change to a player's name and nickname, newest first, for an admin
 * to see who a player was before they renamed themselves. The history
 * starts when it was introduced, in October 2026; for anything earlier,
 * the player's waiver records the name they signed with.
 */
export const NameHistory = ({ playerId }: { playerId: string }) => {
	const [snapshot, loading, error] = useCollection(nameHistoryQuery(playerId))
	useQueryErrorHandler({
		error,
		component: 'NameHistory',
		errorLabel: 'name history',
	})

	const entries = snapshot?.docs.map((doc) => ({ id: doc.id, ...doc.data() }))

	return (
		<div className='space-y-3'>
			<h3 className='text-lg font-semibold flex items-center gap-2'>
				<History className='h-5 w-5' aria-hidden='true' />
				Name history
			</h3>
			{loading ? (
				<p className='text-sm text-muted-foreground'>Loading...</p>
			) : !entries || entries.length === 0 ? (
				<p className='text-sm text-muted-foreground'>
					No changes recorded. Changes are kept from October 2026; the
					player&apos;s waiver shows the name they signed with.
				</p>
			) : (
				<ol className='space-y-2 text-sm' aria-label='Name history'>
					{entries.map((entry) => (
						<li key={entry.id} className='flex flex-col'>
							<span className='text-xs text-muted-foreground'>
								{formatTimestampWithTime(entry.changedAt) ?? 'Just now'}
							</span>
							<span>
								{entry.before && (
									<>
										<span className='line-through text-muted-foreground'>
											{displayName(entry.before)}
										</span>{' '}
									</>
								)}
								<ChangedBy entry={entry} playerId={playerId} />{' '}
								<span className='font-medium'>{displayName(entry.after)}</span>
							</span>
						</li>
					))}
				</ol>
			)}
		</div>
	)
}
