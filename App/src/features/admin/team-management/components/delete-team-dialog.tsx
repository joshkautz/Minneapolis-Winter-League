import { useState } from 'react'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'
import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { deleteUnregisteredTeamViaFunction } from '@/firebase/collections/functions'
import { LoadingButton } from '@/shared/components'
import { errorMessage, logger } from '@/shared/utils'
import { useRosterSize } from './use-roster-size'

const players = (count: number): string =>
	`${count} player${count === 1 ? '' : 's'}`

/**
 * Confirms deleting an unregistered team from a season.
 *
 * Only unregistered teams in the current season are offered for deletion:
 * a registered team's money is settled through the Payments dialog instead,
 * and `deleteUnregisteredTeam` refuses both anyway. The season is sent with
 * the request so the server can refuse one that is not current rather than
 * delete the wrong season's entry.
 */
export const DeleteTeamDialog = ({
	team,
	seasonId,
	onClose,
}: {
	/** The team to delete, or null while the dialog is closed. */
	team: { id: string; name: string } | null
	seasonId: string
	onClose: () => void
}) => {
	const [isDeleting, setIsDeleting] = useState(false)
	const rosterSize = useRosterSize(team?.id, seasonId)

	const handleConfirm = async () => {
		if (!team || isDeleting) return
		setIsDeleting(true)
		try {
			const result = await deleteUnregisteredTeamViaFunction({
				teamId: team.id,
				seasonId,
			})
			toast.success(result.message, {
				description: `${players(result.playersRemoved)} removed from the team`,
			})
			onClose()
		} catch (error) {
			logger.error('Error deleting team', error)
			toast.error(
				errorMessage(error, 'The team could not be deleted. Please try again.')
			)
		} finally {
			setIsDeleting(false)
		}
	}

	return (
		<AlertDialog
			open={!!team}
			onOpenChange={(open) => {
				// Stays open, spinner showing, until the request settles.
				if (!open && !isDeleting) onClose()
			}}
		>
			<AlertDialogContent aria-busy={isDeleting}>
				<AlertDialogHeader>
					<AlertDialogTitle className='flex items-center gap-2'>
						<Trash2 className='h-5 w-5 text-red-600' aria-hidden='true' />
						Delete Team "{team?.name}"?
					</AlertDialogTitle>
					<AlertDialogDescription asChild>
						<div className='space-y-2'>
							<p>
								This will permanently delete the team from this season and
								remove{' '}
								<strong>
									{rosterSize === undefined
										? 'every player'
										: players(rosterSize)}
								</strong>{' '}
								from its roster, revoking captain status and deleting its open
								offers.
							</p>
							<p className='text-red-600 font-semibold'>
								This action cannot be undone.
							</p>
						</div>
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
					<LoadingButton
						variant='destructive'
						loading={isDeleting}
						loadingText='Deleting...'
						onClick={() => void handleConfirm()}
					>
						<Trash2 className='h-4 w-4' aria-hidden='true' />
						Delete Team
					</LoadingButton>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}
