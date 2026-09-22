/**
 * Error Boundary component for handling React errors gracefully
 */

import { Component, ErrorInfo, ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './card'
import { Alert, AlertDescription } from './alert'
import { Button } from './button'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { NewVersionAvailable } from './new-version-available'
import { isStaleDeploymentError } from '@/shared/utils/stale-deployment'

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
		// A stale deployment is expected after every release and says nothing
		// about the app, so it is noted rather than logged as a fault.
		if (isStaleDeploymentError(error)) {
			// eslint-disable-next-line no-console
			console.info(
				'ErrorBoundary: chunk from a previous deployment is gone; prompting for a refresh'
			)
			this.setState({ error, errorInfo })
			return
		}

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

	public override render() {
		if (this.state.hasError) {
			// Checked before any custom fallback: a stale deployment is not an
			// application error and must not be reported as one, whichever
			// boundary happens to catch it.
			if (isStaleDeploymentError(this.state.error)) {
				return <NewVersionAvailable />
			}

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
									An unexpected error occurred while loading this part of the
									page. Reloading usually clears it up.
								</AlertDescription>
							</Alert>

							{/*
							 * The error message itself is deliberately not shown. It is
							 * never actionable for a reader and rarely for us — the
							 * details that matter are in the console log above, with the
							 * component stack and route.
							 */}

							<div className='flex gap-2 pt-4'>
								<Button
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
