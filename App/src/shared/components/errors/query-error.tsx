/**
 * QueryError component for displaying Firestore query errors
 *
 * Provides a user-friendly error display with accessibility support
 * and helpful guidance for common error types (missing indexes, permissions, etc.)
 */

import { AlertTriangle, RefreshCw, ExternalLink } from 'lucide-react'
import { FirestoreError } from 'firebase/firestore'

import { cn } from '@/shared/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

/**
 * Categorizes Firestore errors for user-friendly messaging
 */
type ErrorCategory =
	| 'permission'
	| 'index'
	| 'network'
	| 'not-found'
	| 'unavailable'
	| 'unknown'

interface QueryErrorProps {
	/** The error object from useCollection/useDocument hooks */
	error: Error | FirestoreError
	/** Optional title override */
	title?: string
	/** Optional custom message to display instead of the default */
	message?: string
	/** Callback for retry button - if not provided, retry button won't be shown */
	onRetry?: () => void
	/** Whether to show in a compact inline format vs full card */
	variant?: 'card' | 'inline' | 'banner'
	/** Additional CSS classes */
	className?: string
}

/**
 * Extracts useful information from Firestore errors
 */
const categorizeError = (error: Error | FirestoreError): ErrorCategory => {
	const message = error.message.toLowerCase()
	const code = 'code' in error ? (error as FirestoreError).code : ''

	if (code === 'permission-denied' || message.includes('permission')) {
		return 'permission'
	}
	if (message.includes('index') || message.includes('requires an index')) {
		return 'index'
	}
	if (message.includes('network') || message.includes('offline')) {
		return 'network'
	}
	if (code === 'not-found') {
		return 'not-found'
	}
	return 'unknown'
}

/**
 * Gets user-friendly messaging based on error category
 */
const getErrorContent = (
	category: ErrorCategory
): { title: string; description: string; action?: string } => {
	switch (category) {
		case 'permission':
			return {
				title: 'Access Denied',
				description:
					"You don't have permission to access this data. Please try signing in again or contact support if the problem persists.",
				action: 'Sign in again',
			}
		case 'index':
			return {
				title: 'Database Configuration Required',
				description:
					"This query requires a database index that hasn't been created yet. Check the browser console for a link to create the required index.",
				action: 'Check console for index link',
			}
		case 'network':
			return {
				title: 'Connection Error',
				description:
					'Unable to connect to the server. Please check your internet connection and try again.',
				action: 'Retry',
			}
		case 'not-found':
			return {
				title: 'Not Found',
				description:
					'The requested data could not be found. It may have been deleted or moved.',
			}
		case 'unavailable':
			return {
				title: 'Service Unavailable',
				description:
					'The service is temporarily unavailable. Please try again in a few moments.',
				action: 'Retry',
			}
		default:
			return {
				title: 'Something Went Wrong',
				description:
					'An unexpected error occurred while loading data. Please try again.',
				action: 'Retry',
			}
	}
}

/**
 * Extracts index creation URL from error message if present
 */
const extractIndexUrl = (error: Error): string | null => {
	const urlMatch = error.message.match(
		/https:\/\/console\.firebase\.google\.com[^\s)]+/
	)
	return urlMatch ? urlMatch[0] : null
}

/**
 * QueryError - Displays Firestore query errors in a user-friendly format
 *
 * Features:
 * - Categorizes errors and displays appropriate messaging
 * - Extracts and displays index creation links
 * - Accessible with ARIA attributes
 * - Multiple display variants (card, inline, banner)
 * - Optional retry functionality
 */
export const QueryError = ({
	error,
	title: customTitle,
	message: customMessage,
	onRetry,
	variant = 'card',
	className,
}: QueryErrorProps) => {
	const category = categorizeError(error)
	const content = getErrorContent(category)
	const indexUrl = category === 'index' ? extractIndexUrl(error) : null

	const title = customTitle || content.title
	const description = customMessage || content.description

	// Inline variant - minimal display
	if (variant === 'inline') {
		return (
			<div
				role='alert'
				aria-live='polite'
				className={cn(
					'flex items-center gap-2 text-sm text-destructive',
					className
				)}
			>
				<AlertTriangle className='h-4 w-4 flex-shrink-0' aria-hidden='true' />
				<span>{description}</span>
				{onRetry && (
					<Button
						variant='ghost'
						size='sm'
						onClick={onRetry}
						className='h-auto p-1'
					>
						<RefreshCw className='h-3 w-3' />
						<span className='sr-only'>Retry</span>
					</Button>
				)}
			</div>
		)
	}

	// Banner variant - full-width alert style
	if (variant === 'banner') {
		return (
			<div
				role='alert'
				aria-live='polite'
				className={cn(
					'flex items-center justify-between gap-4 rounded-lg border border-destructive/50 bg-destructive/10 p-4',
					className
				)}
			>
				<div className='flex items-start gap-3'>
					<AlertTriangle
						className='h-5 w-5 text-destructive flex-shrink-0 mt-0.5'
						aria-hidden='true'
					/>
					<div className='space-y-1'>
						<p className='font-medium text-destructive'>{title}</p>
						<p className='text-sm text-muted-foreground'>{description}</p>
						{indexUrl && (
							<a
								href={indexUrl}
								target='_blank'
								rel='noopener noreferrer'
								className='inline-flex items-center gap-1 text-sm text-primary hover:underline mt-2'
							>
								Create required index
								<ExternalLink className='h-3 w-3' aria-hidden='true' />
							</a>
						)}
					</div>
				</div>
				{onRetry && (
					<Button variant='outline' size='sm' onClick={onRetry}>
						<RefreshCw className='h-4 w-4 mr-2' aria-hidden='true' />
						Retry
					</Button>
				)}
			</div>
		)
	}

	// Card variant - default, full display
	return (
		<Card className={cn('border-destructive/50', className)}>
			<CardContent className='p-6'>
				<div
					role='alert'
					aria-live='polite'
					className='flex flex-col items-center text-center space-y-4'
				>
					<div className='flex items-center justify-center gap-2 text-destructive'>
						<AlertTriangle className='h-6 w-6' aria-hidden='true' />
						<h2 className='text-xl font-semibold'>{title}</h2>
					</div>

					<p className='text-muted-foreground max-w-md'>{description}</p>

					{indexUrl && (
						<a
							href={indexUrl}
							target='_blank'
							rel='noopener noreferrer'
							className='inline-flex items-center gap-2 text-sm text-primary hover:underline'
						>
							<ExternalLink className='h-4 w-4' aria-hidden='true' />
							Create required Firestore index
						</a>
					)}

					{/* Technical details for debugging - visible but de-emphasized */}
					<details className='w-full max-w-md text-left'>
						<summary className='text-xs text-muted-foreground cursor-pointer hover:text-foreground'>
							Technical details
						</summary>
						<pre className='mt-2 p-2 bg-muted rounded text-xs overflow-auto max-h-32'>
							{error.message}
						</pre>
					</details>

					{onRetry && (
						<Button variant='outline' onClick={onRetry} className='mt-2'>
							<RefreshCw className='h-4 w-4 mr-2' aria-hidden='true' />
							Try Again
						</Button>
					)}
				</div>
			</CardContent>
		</Card>
	)
}
