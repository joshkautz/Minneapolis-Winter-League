import React, { lazy } from 'react'

/**
 * Utility for cleaner lazy imports with named exports
 *
 * This helper enables lazy loading of components that use named exports
 * instead of default exports, providing better tree-shaking and cleaner imports.
 *
 * @example
 * const Home = lazyImport(() => import('@/components/home/home'), 'Home')
 */

/** The names of a module's exports that are components. */
type ComponentExports<T> = {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a component of any props
	[K in keyof T]: T[K] extends React.ComponentType<any> ? K : never
}[keyof T]

/**
 * A feature's index can export hooks and helpers beside its pages; only the
 * named export has to be a component.
 */
export const lazyImport = <
	T extends Record<string, unknown>,
	K extends ComponentExports<T>,
>(
	importFn: () => Promise<T>,
	namedExport: K
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- as above
): React.LazyExoticComponent<T[K] & React.ComponentType<any>> => {
	return lazy(() =>
		importFn().then((module) => ({
			// eslint-disable-next-line @typescript-eslint/no-explicit-any -- as above
			default: module[namedExport] as T[K] & React.ComponentType<any>,
		}))
	)
}
