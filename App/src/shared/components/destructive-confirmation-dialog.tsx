import { ReactNode, useState } from 'react'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/shared/utils'

export const DestructiveConfirmationDialog = ({
	children,
	title,
	description,
	cancelText,
	continueText,
	onConfirm,
}: {
	children: ReactNode
	title: ReactNode
	description: ReactNode
	cancelText?: string
	continueText?: string
	onConfirm: () => void
}) => {
	const [open, setOpen] = useState(false)
	return (
		<AlertDialog open={open}>
			<AlertDialogTrigger
				onClick={() => {
					if (!open) {
						setOpen(true)
					}
				}}
				asChild
			>
				{children}
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel
						onClick={() => {
							if (open) {
								setOpen(false)
							}
						}}
					>
						{cancelText ?? 'Cancel'}
					</AlertDialogCancel>
					<AlertDialogAction
						className={cn(buttonVariants({ variant: 'destructive' }))}
						onClick={() => {
							onConfirm()
							if (open) {
								setOpen(false)
							}
						}}
					>
						{continueText ?? 'Continue'}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}
