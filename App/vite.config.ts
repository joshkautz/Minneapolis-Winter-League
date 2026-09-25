/// <reference types="vitest" />
/// <reference types="vite/client" />

import path from 'path'
import { createRequire } from 'node:module'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const require = createRequire(import.meta.url)

/**
 * react-firebase-hooks declares `main` (CJS) and `module` (ESM) but no
 * `exports` map. Vitest hands node_modules packages to Node, which picks
 * `main`, so the hooks end up `require`-ing firebase/firestore and get the CJS
 * build — a *second* Firestore SDK instance. Any ref the app builds with the
 * ESM instance then fails that instance's type check with "Type does not match
 * the expected instance". Pinning the ESM build keeps a single instance.
 *
 * Resolved from package.json rather than hardcoded so npm's hoisting decisions
 * cannot silently break it.
 */
const reactFirebaseHooksEsm = (subpath: string): string =>
	path.join(
		path.dirname(require.resolve('react-firebase-hooks/package.json')),
		subpath,
		'dist/index.esm.js'
	)

export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: {
			'react-firebase-hooks/firestore': reactFirebaseHooksEsm('firestore'),
			'react-firebase-hooks/auth': reactFirebaseHooksEsm('auth'),
			'react-firebase-hooks/storage': reactFirebaseHooksEsm('storage'),
			'@': path.resolve(import.meta.dirname, './src'),
			'@/features': path.resolve(import.meta.dirname, './src/features'),
			'@/shared': path.resolve(import.meta.dirname, './src/shared'),
			'@/providers': path.resolve(import.meta.dirname, './src/providers'),
			'@/routes': path.resolve(import.meta.dirname, './src/routes'),
			'@/firebase': path.resolve(import.meta.dirname, './src/firebase'),
			'@/components': path.resolve(import.meta.dirname, './src/components'),
		},
		// Radix tracks open layers (dialogs, popovers, menus) in module state.
		// Two copies would keep two stacks, so a dialog opened from a menu
		// could be dismissed by the wrong Escape or outside click.
		dedupe: ['@radix-ui/react-dismissable-layer'],
	},
	server: {
		host: true,
	},
	test: {
		globals: true,
		environment: 'jsdom',
		setupFiles: ['./src/test/setup.ts'],
	},
	build: {
		outDir: 'dist',
		chunkSizeWarningLimit: 1000, // Increase limit since we're not splitting chunks as aggressively
	},
})
