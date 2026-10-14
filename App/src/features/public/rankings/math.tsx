/**
 * Formulas for the ranking algorithm's explanation, rendered by KaTeX.
 *
 * The App's own KaTeX does the rendering: the `react-katex` wrapper this
 * replaces bundled an older KaTeX of its own, which drew every formula and
 * fell behind on security fixes. The formulas are fixed strings in this
 * feature and KaTeX's `trust` stays off, so its HTML is safe to set.
 */

import katex from 'katex'
import 'katex/dist/katex.min.css'

const render = (math: string, displayMode: boolean): string =>
	katex.renderToString(math, { displayMode, throwOnError: false })

/** A formula within a line of text. */
export const InlineMath = ({ math }: { math: string }) => (
	<span dangerouslySetInnerHTML={{ __html: render(math, false) }} />
)

/** A formula on a line of its own, centred. */
export const BlockMath = ({ math }: { math: string }) => (
	<div dangerouslySetInnerHTML={{ __html: render(math, true) }} />
)
