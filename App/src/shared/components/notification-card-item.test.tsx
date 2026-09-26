import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OfferDirection } from '@/types'
import type { OfferDocumentWithUI } from '@/shared/hooks'
import { NotificationCardItem } from './notification-card-item'

/**
 * An offer row with Accept and Reject. Both used to read "Loading..." when
 * either was pressed; now only the pressed one spins and the other waits.
 */

const offer = {
	playerName: 'Pat Lee',
	teamName: 'Surly',
	creatorName: 'Sam Doe',
	ref: { id: 'offer-1' },
} as unknown as OfferDocumentWithUI

const deferred = () => {
	let resolve!: () => void
	const promise = new Promise<void>((settle) => {
		resolve = settle
	})
	return { promise, resolve }
}

describe('NotificationCardItem', () => {
	it('spins only the pressed action and holds the others', async () => {
		const accepting = deferred()
		const accept = vi.fn(() => accepting.promise)
		const reject = vi.fn(async () => {})

		render(
			<NotificationCardItem
				type={OfferDirection.INCOMING_INVITE}
				data={offer}
				message='invited you to join'
				actionOptions={[
					{ title: 'Accept', pendingTitle: 'Accepting...', action: accept },
					{ title: 'Reject', pendingTitle: 'Rejecting...', action: reject },
				]}
			/>
		)

		await userEvent.click(screen.getByRole('button', { name: 'Accept' }))

		expect(accept).toHaveBeenCalledWith(offer.ref)
		expect(
			screen.getByRole('button', { name: 'Accepting...' })
		).toHaveAttribute('aria-busy', 'true')
		const rejectButton = screen.getByRole('button', { name: 'Reject' })
		expect(rejectButton).toBeDisabled()
		expect(rejectButton).toHaveAttribute('aria-busy', 'false')

		await userEvent.click(rejectButton)
		expect(reject).not.toHaveBeenCalled()

		accepting.resolve()
		await waitFor(() =>
			expect(screen.getByRole('button', { name: 'Reject' })).toBeEnabled()
		)
		expect(screen.getByRole('button', { name: 'Accept' })).toBeEnabled()
	})
})
