import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const { useAuthContext } = vi.hoisted(() => ({ useAuthContext: vi.fn() }))
vi.mock('@/providers', () => ({ useAuthContext }))

const { AdminGate } = await import('./admin-gate')

const player = (data: Record<string, unknown> | undefined, loading = false) =>
	useAuthContext.mockReturnValue({
		authenticatedUserSnapshotLoading: loading,
		authenticatedUserSnapshot: data ? { data: () => data } : undefined,
	})

const renderGate = () =>
	render(
		<AdminGate>
			<p>Admin page</p>
		</AdminGate>
	)

describe('AdminGate', () => {
	it('shows the page to an admin', () => {
		player({ admin: true })
		renderGate()
		expect(screen.getByText('Admin page')).toBeVisible()
	})

	it('refuses anyone else', () => {
		player({ admin: false })
		renderGate()
		expect(screen.getByText('Access Denied')).toBeVisible()
		expect(screen.queryByText('Admin page')).not.toBeInTheDocument()
	})

	it('refuses a signed-in user with no player profile', () => {
		player(undefined)
		renderGate()
		expect(screen.getByText('Access Denied')).toBeVisible()
	})

	it('waits for the profile before deciding', () => {
		player(undefined, true)
		renderGate()
		expect(
			screen.getByRole('status', { name: 'Checking your access' })
		).toBeVisible()
		expect(screen.queryByText('Access Denied')).not.toBeInTheDocument()
	})
})
