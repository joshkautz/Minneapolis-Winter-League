import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { BlockMath, InlineMath } from './math'

/** The ranking explanation's formulas, drawn by the App's own KaTeX. */
describe('math', () => {
	it('renders a formula inline', () => {
		const { container } = render(<InlineMath math='E = mc^2' />)
		expect(container.querySelector('span > .katex')).not.toBeNull()
		expect(container.querySelector('.katex-display')).toBeNull()
	})

	it('renders a formula on its own line', () => {
		const { container } = render(<BlockMath math='\mu \sim \mathcal{N}' />)
		expect(container.querySelector('div > .katex-display')).not.toBeNull()
	})

	it('shows a malformed formula as an error instead of breaking the page', () => {
		const { container } = render(<InlineMath math='\frac{1}{' />)
		expect(container.querySelector('.katex-error')).not.toBeNull()
	})
})
