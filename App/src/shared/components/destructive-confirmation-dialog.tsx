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
	open: externalOpen,
	onOpenChange: externalOnOpenChange,
}: {
	children: ReactNode
	title: ReactNode
	description: ReactNode
	cancelText?: string
	continueText?: string
	onConfirm: () => void
	open?: boolean
	onOpenChange?: (open: boolean) => void
}) => {
	const [internalOpen, setInternalOpen] = useState(false)
	const open = externalOpen ?? internalOpen
	const setOpen = externalOnOpenChange ?? setInternalOpen

	return (
		<AlertDialog open={open} onOpenChange={setOpen}>
			{externalOpen !== undefined ? (
				children
			) : (
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
			)}
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel
						onClick={() => {
							setOpen(false)
						}}
					>
						{cancelText ?? 'Cancel'}
					</AlertDialogCancel>
					<AlertDialogAction
						className={cn(buttonVariants({ variant: 'destructive' }))}
						onClick={() => {
							onConfirm()
							setOpen(false)
						}}
					>
						{continueText ?? 'Continue'}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}
