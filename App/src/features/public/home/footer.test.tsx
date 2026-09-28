import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/providers/site-settings-context', () => ({
	useSiteSettings: () => ({ isValentine: false }),
}))

const { Footer } = await import('./footer')

describe('Footer partners', () => {
	it('links the Greyed Duck logo to its site', () => {
		render(<Footer />)

		const link = screen.getByRole('link', { name: 'Visit Greyed Duck website' })
		expect(link.getAttribute('href')).toBe('https://umnmensulti.com/')
		expect(link.getAttribute('target')).toBe('_blank')
		expect(link.getAttribute('rel')).toBe('noopener noreferrer')
		expect(
			screen.getByRole('img', { name: 'Greyed Duck logo' }).getAttribute('src')
		).toBe('/greyed-duck.webp')
	})

	it('still links Lost Yeti Design Company', () => {
		render(<Footer />)

		expect(
			screen
				.getByRole('link', { name: 'Visit Lost Yeti Design Company website' })
				.getAttribute('href')
		).toBe('https://lostyetidesign.com/')
	})

	it('no longer shows Minneapolis Mallard as a partner', () => {
		// The league's contact address is still at mplsmallard.com; only the
		// partnership ended.
		render(<Footer />)

		expect(screen.queryByRole('img', { name: /mallard/i })).toBeNull()
		expect(
			screen.queryByRole('link', { name: /minneapolis mallard/i })
		).toBeNull()
	})
})
