import { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { LoadingSpinner } from '@/shared/components'

interface FormSubmitButtonProps {
	children: ReactNode
	isLoading?: boolean
	disabled?: boolean
	className?: string
	loadingText?: string
	type?: 'button' | 'submit' | 'reset'
}

/**
 * Standardized submit button with loading state
 * Provides consistent submit button behavior across forms
 */
export const FormSubmitButton = ({
	children,
	isLoading = false,
	disabled = false,
	className,
	loadingText = 'Loading...',
	type = 'submit',
}: FormSubmitButtonProps) => {
	return (
		<Button type={type} disabled={disabled || isLoading} className={className}>
			{isLoading && <LoadingSpinner size='sm' className='mr-2' />}
			{isLoading ? loadingText : children}
		</Button>
	)
}
