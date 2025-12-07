/**
 * Error Boundary component for handling React errors gracefully
 */

import { Component, ErrorInfo, ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './card'
import { Alert, AlertDescription } from './alert'
import { Button } from './button'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
	children: ReactNode
	fallback?: ReactNode
	onError?: (error: Error, errorInfo: ErrorInfo) => void
}

interface State {
	hasError: boolean
	error: Error | null
	errorInfo: ErrorInfo | null
}

export class ErrorBoundary extends Component<Props, State> {
	public override state: State = {
		hasError: false,
		error: null,
		errorInfo: null,
	}

	public static getDerivedStateFromError(error: Error): State {
		// Update state so the next render will show the fallback UI
		return {
			hasError: true,
			error,
			errorInfo: null,
		}
	}

	public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
		// Enhanced error logging with context
		const errorContext = {
			error: error.message,
			stack: error.stack,
			componentStack: errorInfo.componentStack,
			route: window.location.pathname,
			timestamp: new Date().toISOString(),
			userAgent: navigator.userAgent,
		}

		// eslint-disable-next-line no-console
		console.group('🚨 ErrorBoundary: React Error Caught')
		// eslint-disable-next-line no-console
		console.error('Error:', error)
		// eslint-disable-next-line no-console
		console.error('Error Info:', errorInfo)
		// eslint-disable-next-line no-console
		console.error('Context:', errorContext)
		// eslint-disable-next-line no-console
		console.groupEnd()

		this.setState({
			error,
			errorInfo,
		})

		// Call the optional onError callback
		if (this.props.onError) {
			this.props.onError(error, errorInfo)
		}
	}

	private handleReset = () => {
		this.setState({
			hasError: false,
			error: null,
			errorInfo: null,
		})
	}

	public override render() {
		if (this.state.hasError) {
			// If a custom fallback is provided, use it
			if (this.props.fallback) {
				return this.props.fallback
			}

			// Default error UI
			return (
				<div className='container mx-auto px-4 py-8'>
					<Card>
						<CardHeader>
							<CardTitle className='flex items-center gap-2 text-red-600'>
								<AlertTriangle className='h-6 w-6' />
								Something went wrong
							</CardTitle>
						</CardHeader>
						<CardContent className='space-y-4'>
							<Alert variant='destructive'>
								<AlertTriangle className='h-4 w-4' />
								<AlertDescription>
									An unexpected error occurred while loading this component.
								</AlertDescription>
							</Alert>

							<div className='space-y-3'>
								<h3 className='font-semibold text-sm'>Error Details:</h3>
								<div className='bg-muted p-3 rounded-md text-sm font-mono overflow-auto max-h-32'>
									{this.state.error?.message || 'Unknown error occurred'}
								</div>

								{process.env.NODE_ENV === 'development' &&
									this.state.errorInfo && (
										<details className='mt-4'>
											<summary className='cursor-pointer text-sm font-semibold text-muted-foreground hover:text-foreground'>
												Stack Trace (Development)
											</summary>
											<div className='bg-muted p-3 rounded-md text-xs font-mono overflow-auto max-h-40 mt-2'>
												{this.state.errorInfo.componentStack}
											</div>
										</details>
									)}
							</div>

							<div className='flex gap-2 pt-4'>
								<Button
									onClick={this.handleReset}
									className='flex items-center gap-2'
								>
									<RefreshCw className='h-4 w-4' />
									Try Again
								</Button>
								<Button
									variant='outline'
									onClick={() => window.location.reload()}
									className='flex items-center gap-2'
								>
									<RefreshCw className='h-4 w-4' />
									Reload Page
								</Button>
							</div>
						</CardContent>
					</Card>
				</div>
			)
		}

		return this.props.children
	}
}

/**
 * Hook-based error boundary wrapper for functional components
 */
interface ErrorBoundaryWrapperProps {
	children: ReactNode
	fallback?: ReactNode
	onError?: (error: Error, errorInfo: ErrorInfo) => void
}

export const ErrorBoundaryWrapper = ({
	children,
	fallback,
	onError,
}: ErrorBoundaryWrapperProps) => {
	return (
		<ErrorBoundary fallback={fallback} onError={onError}>
			{children}
		</ErrorBoundary>
	)
}
