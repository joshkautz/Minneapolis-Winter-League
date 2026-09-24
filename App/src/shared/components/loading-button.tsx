import type { ComponentProps, ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { LoadingSpinner } from './loading-spinner'

type LoadingButtonProps = ComponentProps<typeof Button> & {
	/** An action this button started is still running. */
	loading?: boolean
	/**
	 * What the button says while loading, e.g. "Inviting...". Replaces the
	 * children, so a leading icon gives way to the spinner rather than
	 * sitting beside it.
	 */
	loadingText?: ReactNode
}

/**
 * A button for anything that calls the server. While `loading` it shows a
 * spinner, cannot be pressed again, and is marked busy for assistive tech,
 * so a slow round trip never looks like a click that did nothing.
 */
export const LoadingButton = ({
	loading = false,
	loadingText,
	disabled,
	children,
	...props
}: LoadingButtonProps) => (
	<Button {...props} disabled={disabled || loading} aria-busy={loading}>
		{loading ? (
			<>
				<span aria-hidden='true' className='inline-flex'>
					<LoadingSpinner size='sm' withMargin={false} />
				</span>
				{loadingText ?? children}
			</>
		) : (
			children
		)}
	</Button>
)
