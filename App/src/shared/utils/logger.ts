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
	private logLevelHierarchy = {
		[LogLevel.DEBUG]: 0,
		[LogLevel.INFO]: 1,
		[LogLevel.WARN]: 2,
		[LogLevel.ERROR]: 3,
	}

	private getMinLogLevel(): LogLevel {
		const envLogLevel =
			import.meta.env.VITE_LOG_LEVEL?.toLowerCase() as LogLevel
		const validLevels = Object.values(LogLevel)

		if (validLevels.includes(envLogLevel)) {
			return envLogLevel
		}

		// Fallback to error level if VITE_LOG_LEVEL is invalid or missing
		return LogLevel.ERROR
	}

	private formatMessage(
		level: LogLevel,
		message: string,
		context?: LogContext
	): string {
		const timestamp = new Date().toISOString()
		const contextStr = context ? ` | Context: ${JSON.stringify(context)}` : ''
		return `[${timestamp}] [${level.toUpperCase()}] ${message}${contextStr}`
	}

	private shouldLog(level: LogLevel): boolean {
		const minLevel = this.getMinLogLevel()
		return this.logLevelHierarchy[level] >= this.logLevelHierarchy[minLevel]
	}

	debug(message: string, context?: LogContext): void {
		if (this.shouldLog(LogLevel.DEBUG)) {
			// eslint-disable-next-line no-console
			console.debug(this.formatMessage(LogLevel.DEBUG, message, context))
		}
	}

	info(message: string, context?: LogContext): void {
		if (this.shouldLog(LogLevel.INFO)) {
			// eslint-disable-next-line no-console
			console.info(this.formatMessage(LogLevel.INFO, message, context))
		}
	}

	warn(message: string, context?: LogContext): void {
		if (this.shouldLog(LogLevel.WARN)) {
			// eslint-disable-next-line no-console
			console.warn(this.formatMessage(LogLevel.WARN, message, context))
		}
	}

	error(message: string, error?: unknown, context?: LogContext): void {
		if (this.shouldLog(LogLevel.ERROR)) {
			const normalizedError =
				error instanceof Error
					? error
					: error !== undefined
						? new Error(String(error))
						: undefined
			const errorContext = {
				...context,
				error: normalizedError
					? {
							name: normalizedError.name,
							message: normalizedError.message,
							stack: normalizedError.stack,
						}
					: undefined,
			}
			// eslint-disable-next-line no-console
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
	firebase(
		operation: string,
		collection?: string,
		error?: Error,
		context?: LogContext
	): void {
		const message = `Firebase: ${operation}${collection ? ` on ${collection}` : ''}`
		const firebaseContext = {
			component: 'firebase',
			operation,
			collection,
			...context,
		}

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
		this.info(`User action: ${action}`, {
			component,
			action: 'user_interaction',
			...context,
		})
	}

	/**
	 * Log performance metrics
	 */
	performance(
		metric: string,
		value: number,
		unit: string,
		context?: LogContext
	): void {
		this.debug(`Performance: ${metric} = ${value}${unit}`, {
			component: 'performance',
			metric,
			value,
			unit,
			...context,
		})
	}
}

export const logger = new Logger()
