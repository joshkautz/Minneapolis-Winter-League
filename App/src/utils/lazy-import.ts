import { lazy } from 'react'

/**
 * Utility for cleaner lazy imports with named exports
 * 
 * This helper enables lazy loading of components that use named exports
 * instead of default exports, providing better tree-shaking and cleaner imports.
 * 
 * @example
 * const Home = lazyImport(() => import('@/components/home/home'), 'Home')
 */
export const lazyImport = <T extends Record<string, any>>(
	importFn: () => Promise<T>,
	namedExport: keyof T
) => lazy(() => importFn().then((module) => ({ default: module[namedExport] })))
