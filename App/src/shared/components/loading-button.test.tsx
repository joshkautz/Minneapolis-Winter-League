import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoadingButton } from './loading-button'

describe('LoadingButton', () => {
	it('is an ordinary button when not loading', async () => {
		const onClick = vi.fn()
		render(<LoadingButton onClick={onClick}>Invite</LoadingButton>)

		const button = screen.getByRole('button', { name: 'Invite' })
		expect(button).toBeEnabled()
		expect(button).toHaveAttribute('aria-busy', 'false')

		await userEvent.click(button)
		expect(onClick).toHaveBeenCalledTimes(1)
	})

	it('while loading, says so, is busy, and cannot be pressed', async () => {
		const onClick = vi.fn()
		render(
			<LoadingButton loading loadingText='Inviting...' onClick={onClick}>
				Invite
			</LoadingButton>
		)

		// The spinner is decorative; the name is the loading text alone.
		const button = screen.getByRole('button', { name: 'Inviting...' })
		expect(button).toBeDisabled()
		expect(button).toHaveAttribute('aria-busy', 'true')
		expect(button.querySelector('svg.animate-spin')).not.toBeNull()

		await userEvent.click(button)
		expect(onClick).not.toHaveBeenCalled()
	})

	it('keeps its label when no loading text is given', () => {
		render(<LoadingButton loading>Save</LoadingButton>)
		expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
	})

	it('stays disabled when disabled, loading or not', () => {
		render(<LoadingButton disabled>Invited</LoadingButton>)
		expect(screen.getByRole('button', { name: 'Invited' })).toBeDisabled()
	})
})
