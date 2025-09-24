import { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { ReloadIcon } from '@radix-ui/react-icons'

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
			{isLoading && <ReloadIcon className='mr-2 h-4 w-4 animate-spin' />}
			{isLoading ? loadingText : children}
		</Button>
	)
}
