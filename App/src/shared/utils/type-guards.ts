/**
 * TypeScript utility functions and type guards
 *
 * Provides runtime type checking and type assertions for better type safety
 */

// Type guard utilities
export function isDefined<T>(value: T | null | undefined): value is T {
	return value !== null && value !== undefined
}

export function isString(value: unknown): value is string {
	return typeof value === 'string'
}

export function isNumber(value: unknown): value is number {
	return typeof value === 'number' && !isNaN(value)
}

export function isBoolean(value: unknown): value is boolean {
	return typeof value === 'boolean'
}

export function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isArray<T>(value: unknown): value is T[] {
	return Array.isArray(value)
}

export function isFunction(value: unknown): value is Function {
	return typeof value === 'function'
}

export function isPromise<T = unknown>(value: unknown): value is Promise<T> {
	return (
		value instanceof Promise ||
		(isObject(value) && isFunction((value as any).then))
	)
}

export function isError(value: unknown): value is Error {
	return value instanceof Error
}

export function isDate(value: unknown): value is Date {
	return value instanceof Date && !isNaN(value.getTime())
}

export function isNonEmptyString(value: unknown): value is string {
	return isString(value) && value.trim().length > 0
}

export function isNonEmptyArray<T>(value: unknown): value is T[] {
	return isArray(value) && value.length > 0
}

export function isEmail(value: unknown): value is string {
	if (!isString(value)) {return false}
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
	return emailRegex.test(value)
}

export function isUrl(value: unknown): value is string {
	if (!isString(value)) {return false}
	try {
		new URL(value)
		return true
	} catch {
		return false
	}
}

// Type assertion functions (throw if type check fails)
export function assertIsDefined<T>(
	value: T | null | undefined,
	message?: string
): asserts value is T {
	if (!isDefined(value)) {
		throw new TypeError(message || 'Value must be defined')
	}
}

export function assertIsString(
	value: unknown,
	message?: string
): asserts value is string {
	if (!isString(value)) {
		throw new TypeError(message || 'Value must be a string')
	}
}

export function assertIsNumber(
	value: unknown,
	message?: string
): asserts value is number {
	if (!isNumber(value)) {
		throw new TypeError(message || 'Value must be a number')
	}
}

export function assertIsObject(
	value: unknown,
	message?: string
): asserts value is Record<string, unknown> {
	if (!isObject(value)) {
		throw new TypeError(message || 'Value must be an object')
	}
}

export function assertIsArray<T>(
	value: unknown,
	message?: string
): asserts value is T[] {
	if (!isArray(value)) {
		throw new TypeError(message || 'Value must be an array')
	}
}

export function assertIsFunction(
	value: unknown,
	message?: string
): asserts value is Function {
	if (!isFunction(value)) {
		throw new TypeError(message || 'Value must be a function')
	}
}

// Firebase-specific type guards
export function hasFirebaseDocumentId(value: unknown): value is { id: string } {
	return isObject(value) && 'id' in value && isString(value.id)
}

export function hasFirebaseTimestamp(
	value: unknown
): value is { seconds: number; nanoseconds: number } {
	return (
		isObject(value) &&
		'seconds' in value &&
		'nanoseconds' in value &&
		isNumber(value.seconds) &&
		isNumber(value.nanoseconds)
	)
}

// React-specific type guards
export function isReactElement(value: unknown): value is React.ReactElement {
	return (
		isObject(value) &&
		'$$typeof' in value &&
		'type' in value &&
		'props' in value
	)
}

export function isReactComponent(
	value: unknown
): value is React.ComponentType<any> {
	return (
		isFunction(value) || (isObject(value) && isFunction((value as any).render))
	)
}

// Utility type helpers
export function hasProperty<K extends string>(
	obj: unknown,
	key: K
): obj is Record<K, unknown> {
	return isObject(obj) && key in obj
}

export function hasProperties<K extends string>(
	obj: unknown,
	keys: readonly K[]
): obj is Record<K, unknown> {
	if (!isObject(obj)) {return false}
	return keys.every((key) => key in obj)
}

// Safe property access with type narrowing
export function getProperty<
	T extends Record<string, unknown>,
	K extends keyof T,
>(obj: T, key: K): T[K] | undefined {
	return obj[key]
}

export function getRequiredProperty<
	T extends Record<string, unknown>,
	K extends keyof T,
>(obj: T, key: K, message?: string): T[K] {
	const value = obj[key]
	if (value === undefined) {
		throw new Error(message || `Required property '${String(key)}' is missing`)
	}
	return value
}

// Type-safe JSON parsing
export function parseJSON<T = unknown>(json: string): T | null {
	try {
		return JSON.parse(json) as T
	} catch {
		return null
	}
}

export function safeParseJSON<T = unknown>(json: string, fallback: T): T {
	const result = parseJSON<T>(json)
	return result !== null ? result : fallback
}

// Exhaustiveness checking
export function assertNever(value: never): never {
	throw new Error(`Unexpected value: ${JSON.stringify(value)}`)
}

// Type-safe environment variable access
export function getEnvVar(key: string, fallback?: string): string {
	const value = process.env[key] || fallback
	if (value === undefined) {
		throw new Error(`Environment variable '${key}' is required but not set`)
	}
	return value
}

export function getOptionalEnvVar(key: string): string | undefined {
	return process.env[key]
}
