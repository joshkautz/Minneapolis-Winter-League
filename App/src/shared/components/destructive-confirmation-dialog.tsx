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
import { usePendingAction } from '@/shared/hooks/use-pending-action'
import { LoadingSpinner } from './loading-spinner'

/**
 * Asks before something destructive. When `onConfirm` returns a promise the
 * dialog stays open until it settles, with a spinner on the confirm button
 * and no way to dismiss it, so the user sees the request go through rather
 * than a dialog that vanishes while the server is still working.
 */

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
	onConfirm: () => void | Promise<void>
	open?: boolean
	onOpenChange?: (open: boolean) => void
}) => {
	const [internalOpen, setInternalOpen] = useState(false)
	const open = externalOpen ?? internalOpen
	const setOpenState = externalOnOpenChange ?? setInternalOpen
	const { pending, run } = usePendingAction()

	// Neither Escape, the overlay nor Cancel may close it mid-request.
	const setOpen = (next: boolean) => {
		if (pending && !next) return
		setOpenState(next)
	}

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
			<AlertDialogContent aria-busy={pending}>
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel
						disabled={pending}
						onClick={() => {
							setOpen(false)
						}}
					>
						{cancelText ?? 'Cancel'}
					</AlertDialogCancel>
					<AlertDialogAction
						className={cn(buttonVariants({ variant: 'destructive' }))}
						disabled={pending}
						onClick={(event) => {
							// Radix closes the dialog on click; keep it open until the
							// action settles.
							event.preventDefault()
							void run(async () => {
								await onConfirm()
								setOpenState(false)
							})
						}}
					>
						{pending && (
							<span aria-hidden='true' className='inline-flex'>
								<LoadingSpinner size='sm' withMargin={false} />
							</span>
						)}
						{continueText ?? 'Continue'}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}
