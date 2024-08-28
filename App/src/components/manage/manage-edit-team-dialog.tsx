import { ReactNode, useState } from 'react'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '../ui/dialog'
import { ManageEditTeam } from './manage-edit-team'

export const ManageEditTeamDialog = ({
	closeDialog,
	children,
}: {
	closeDialog?: () => void
	children: ReactNode
}) => {
	const [open, setOpen] = useState(false)

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger
				onClick={() => {
					if (!open) {
						setOpen(true)
					}
				}}
				asChild
			>
				{children}
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Edit team</DialogTitle>
					<DialogDescription>{`Update your team's name or logo`}</DialogDescription>
				</DialogHeader>
				<div className="max-w-[400px]">
					<ManageEditTeam
						closeDialog={() => {
							setOpen(false)
							if (closeDialog) {
								closeDialog()
							}
						}}
					/>
				</div>
			</DialogContent>
		</Dialog>
	)
}
