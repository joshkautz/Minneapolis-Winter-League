import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { TeamLogo } from './team-logo'

describe('TeamLogo', () => {
	it('shows the logo when there is one', () => {
		render(<TeamLogo name='Marlins' logo='https://example.com/a.png' />)
		expect(screen.getByRole('img', { name: 'Marlins logo' })).toHaveAttribute(
			'src',
			'https://example.com/a.png'
		)
	})

	it("shows the team's initial without one", () => {
		render(<TeamLogo name='marlins' logo={null} initialClassName='text-sm' />)
		expect(screen.getByRole('img', { name: 'marlins logo' })).toHaveTextContent(
			'M'
		)
	})

	it('falls back to the initial when the image fails to load', () => {
		render(
			<TeamLogo
				name='Marlins'
				logo='https://example.com/broken.png'
				initialClassName='text-sm'
			/>
		)
		fireEvent.error(screen.getByRole('img'))
		expect(screen.getByRole('img', { name: 'Marlins logo' })).toHaveTextContent(
			'M'
		)
	})

	it('tries a new logo after the old one failed', () => {
		// A captain replacing a broken logo should see the new one, not the
		// fallback the old URL earned.
		const { rerender } = render(
			<TeamLogo name='Marlins' logo='https://example.com/broken.png' />
		)
		fireEvent.error(screen.getByRole('img'))

		rerender(<TeamLogo name='Marlins' logo='https://example.com/new.png' />)

		expect(screen.getByRole('img')).toHaveAttribute(
			'src',
			'https://example.com/new.png'
		)
	})

	it('stays out of the accessibility tree when its name is written beside it', () => {
		render(<TeamLogo name='Marlins' logo={null} alt='' />)
		expect(screen.queryByRole('img')).toBeNull()
	})
})
