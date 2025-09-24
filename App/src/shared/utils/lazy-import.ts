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
export const lazyImport = <
	T extends Record<string, React.ComponentType<any>>,
	K extends keyof T,
>(
	importFn: () => Promise<T>,
	namedExport: K
): React.LazyExoticComponent<T[K]> => {
	return lazy(() =>
		importFn().then((module) => ({
			default: module[namedExport],
		}))
	)
}
