/**
 * Centralized logging utility for the application
 * Provides consistent logging across all components and hooks
 */

export enum LogLevel {
	DEBUG = 'debug',
	INFO = 'info',
	WARN = 'warn',
	ERROR = 'error',
}

interface LogContext {
	component?: string
	action?: string
	userId?: string
	sessionId?: string
	[key: string]: unknown
}

class Logger {
	private isDevelopment = process.env.NODE_ENV === 'development'

	private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
		const timestamp = new Date().toISOString()
		const contextStr = context ? ` | Context: ${JSON.stringify(context)}` : ''
		return `[${timestamp}] [${level.toUpperCase()}] ${message}${contextStr}`
	}

	private shouldLog(level: LogLevel): boolean {
		// In production, only log warnings and errors
		if (!this.isDevelopment) {
			return level === LogLevel.WARN || level === LogLevel.ERROR
		}
		return true
	}

	debug(message: string, context?: LogContext): void {
		if (this.shouldLog(LogLevel.DEBUG)) {
			console.debug(this.formatMessage(LogLevel.DEBUG, message, context))
		}
	}

	info(message: string, context?: LogContext): void {
		if (this.shouldLog(LogLevel.INFO)) {
			console.info(this.formatMessage(LogLevel.INFO, message, context))
		}
	}

	warn(message: string, context?: LogContext): void {
		if (this.shouldLog(LogLevel.WARN)) {
			console.warn(this.formatMessage(LogLevel.WARN, message, context))
		}
	}

	error(message: string, error?: Error, context?: LogContext): void {
		if (this.shouldLog(LogLevel.ERROR)) {
			const errorContext = {
				...context,
				error: error ? {
					name: error.name,
					message: error.message,
					stack: error.stack,
				} : undefined,
			}
			console.error(this.formatMessage(LogLevel.ERROR, message, errorContext))
		}
	}

	/**
	 * Log authentication-related events
	 */
	auth(action: string, success: boolean, error?: Error, userId?: string): void {
		const message = `Auth: ${action} ${success ? 'succeeded' : 'failed'}`
		const context = { component: 'auth', action, userId, success }
		
		if (success) {
			this.info(message, context)
		} else {
			this.error(message, error, context)
		}
	}

	/**
	 * Log Firebase operations
	 */
	firebase(operation: string, collection?: string, error?: Error, context?: LogContext): void {
		const message = `Firebase: ${operation}${collection ? ` on ${collection}` : ''}`
		const firebaseContext = { component: 'firebase', operation, collection, ...context }
		
		if (error) {
			this.error(message, error, firebaseContext)
		} else {
			this.debug(message, firebaseContext)
		}
	}

	/**
	 * Log user interactions
	 */
	userAction(action: string, component: string, context?: LogContext): void {
		this.info(`User action: ${action}`, { component, action: 'user_interaction', ...context })
	}

	/**
	 * Log performance metrics
	 */
	performance(metric: string, value: number, unit: string, context?: LogContext): void {
		this.debug(`Performance: ${metric} = ${value}${unit}`, { component: 'performance', metric, value, unit, ...context })
	}
}

export const logger = new Logger()
