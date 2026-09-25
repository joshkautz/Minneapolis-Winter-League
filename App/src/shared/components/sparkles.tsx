import { lazy, Suspense, type ComponentProps } from 'react'

const SparklesCore = lazy(() =>
	import('./particles').then((module) => ({ default: module.SparklesCore }))
)

/**
 * The particle animation, loaded on first render. tsparticles is large, and
 * importing it directly would put it in the chunk of every page that shares
 * a component with the home hero or the "Coming Soon" card.
 */
export const Sparkles = (props: ComponentProps<typeof SparklesCore>) => (
	<Suspense fallback={null}>
		<SparklesCore {...props} />
	</Suspense>
)
