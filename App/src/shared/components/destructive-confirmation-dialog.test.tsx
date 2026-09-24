import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DestructiveConfirmationDialog } from './destructive-confirmation-dialog'

/**
 * The dialog used to close the moment Continue was pressed, while the
 * request was still in flight, leaving nothing on screen to say it was
 * working. It now stays open, busy, until the action settles.
 */

const deferred = () => {
	let resolve!: () => void
	const promise = new Promise<void>((settle) => {
		resolve = settle
	})
	return { promise, resolve }
}

const renderDialog = (onConfirm: () => void | Promise<void>) =>
	render(
		<DestructiveConfirmationDialog
			title='Delete the team?'
			description='This cannot be undone.'
			continueText='Delete'
			onConfirm={onConfirm}
		>
			<button type='button'>Open</button>
		</DestructiveConfirmationDialog>
	)

describe('DestructiveConfirmationDialog', () => {
	it('stays open and busy until the action settles, then closes', async () => {
		const call = deferred()
		const onConfirm = vi.fn(() => call.promise)
		renderDialog(onConfirm)

		await userEvent.click(screen.getByRole('button', { name: 'Open' }))
		await userEvent.click(screen.getByRole('button', { name: 'Delete' }))

		expect(onConfirm).toHaveBeenCalledTimes(1)
		const dialog = screen.getByRole('alertdialog')
		expect(dialog).toHaveAttribute('aria-busy', 'true')
		expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
		expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()

		call.resolve()
		await waitFor(() =>
			expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
		)
	})

	it('cannot be dismissed with Escape mid-request', async () => {
		const call = deferred()
		renderDialog(() => call.promise)

		await userEvent.click(screen.getByRole('button', { name: 'Open' }))
		await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
		await userEvent.keyboard('{Escape}')

		expect(screen.getByRole('alertdialog')).toBeInTheDocument()

		call.resolve()
		await waitFor(() =>
			expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
		)
	})

	it('still closes straight away for a synchronous action', async () => {
		const onConfirm = vi.fn()
		renderDialog(onConfirm)

		await userEvent.click(screen.getByRole('button', { name: 'Open' }))
		await userEvent.click(screen.getByRole('button', { name: 'Delete' }))

		expect(onConfirm).toHaveBeenCalledTimes(1)
		await waitFor(() =>
			expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
		)
	})

	it('can be cancelled when nothing is running', async () => {
		const onConfirm = vi.fn()
		renderDialog(onConfirm)

		await userEvent.click(screen.getByRole('button', { name: 'Open' }))
		await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

		expect(onConfirm).not.toHaveBeenCalled()
		await waitFor(() =>
			expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
		)
	})
})
