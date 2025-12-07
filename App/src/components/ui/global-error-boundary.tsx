/**
 * Global Error Boundary Wrapper for the entire application
 *
 * This provides a final safety net for any errors that might escape
 * route-level error boundaries or occur in the app shell itself.
 */

import { ReactNode } from 'react'
import { ErrorBoundary } from './error-boundary'
import { Card, CardContent, CardHeader, CardTitle } from './card'
import { Alert, AlertDescription } from './alert'
import { Button } from './button'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'

interface GlobalErrorBoundaryProps {
	children: ReactNode
}

const GlobalErrorFallback = () => {
	const handleGoHome = () => {
		window.location.href = '/'
	}

	const handleReload = () => {
		window.location.reload()
	}

	return (
		<div className='min-h-screen flex items-center justify-center p-4 bg-background'>
			<div className='max-w-md w-full'>
				<Card>
					<CardHeader>
						<CardTitle className='flex items-center gap-2 text-red-600'>
							<AlertTriangle className='h-6 w-6' />
							Application Error
						</CardTitle>
					</CardHeader>
					<CardContent className='space-y-4'>
						<Alert variant='destructive'>
							<AlertTriangle className='h-4 w-4' />
							<AlertDescription>
								Something went wrong with the application. We apologize for the
								inconvenience.
							</AlertDescription>
						</Alert>

						<div className='text-sm text-muted-foreground'>
							<p>
								An unexpected error occurred that prevented the application from
								working properly. You can try refreshing the page or returning
								to the home page.
							</p>
						</div>

						<div className='flex flex-col gap-2 pt-4'>
							<Button
								onClick={handleReload}
								className='flex items-center gap-2'
							>
								<RefreshCw className='h-4 w-4' />
								Refresh Page
							</Button>
							<Button
								variant='outline'
								onClick={handleGoHome}
								className='flex items-center gap-2'
							>
								<Home className='h-4 w-4' />
								Go to Home Page
							</Button>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	)
}

export const GlobalErrorBoundary = ({ children }: GlobalErrorBoundaryProps) => {
	return (
		<ErrorBoundary
			fallback={<GlobalErrorFallback />}
			onError={(error, errorInfo) => {
				// eslint-disable-next-line no-console
				console.error('Global application error:', error, errorInfo)

				// You could send this to an error reporting service here
				// Example: Sentry, LogRocket, Bugsnag, etc.
				// errorReportingService.captureException(error, {
				//   contexts: { errorInfo },
				//   tags: { errorBoundary: 'global' }
				// })
			}}
		>
			{children}
		</ErrorBoundary>
	)
}
