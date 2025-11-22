import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { ManageEditTeamForm } from './manage-edit-team-form'
import { toast } from 'sonner'

export const ManageEditTeamDialog = ({
	open = false,
	onOpenChange,
}: {
	open?: boolean
	onOpenChange?: (open: boolean) => void
}) => {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className='max-w-2xl'>
				<DialogHeader>
					<DialogTitle>Edit team</DialogTitle>
					<DialogDescription>{`Update your team's name or logo`}</DialogDescription>
				</DialogHeader>
				<ManageEditTeamForm
					handleResult={({ success, title, description }) => {
						if (success) {
							toast.success(title, {
								description,
							})
						} else {
							toast.error(title, {
								description,
							})
						}
						// Always close dialog on completion (success or error)
						onOpenChange?.(false)
					}}
				/>
			</DialogContent>
		</Dialog>
	)
}
