/// <reference types="vitest" />
/// <reference types="vite/client" />

import path from 'path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: {
			'@': path.resolve(__dirname, './src'),
			'@/features': path.resolve(__dirname, './src/features'),
			'@/shared': path.resolve(__dirname, './src/shared'),
			'@/providers': path.resolve(__dirname, './src/providers'),
			'@/pages': path.resolve(__dirname, './src/pages'),
			'@/routes': path.resolve(__dirname, './src/routes'),
			'@/firebase': path.resolve(__dirname, './src/firebase'),
			'@/components': path.resolve(__dirname, './src/components'),
		},
		dedupe: ['@radix-ui/react-dismissable-layer'],
	},
	server: {
		host: true,
	},
	test: {
		globals: true,
		environment: 'jsdom',
	},
	build: {
		outDir: 'dist',
		chunkSizeWarningLimit: 600, // Increase warning limit to account for Firebase chunk
		rollupOptions: {
			output: {
				/**
				 * Bundle optimization strategy:
				 * Splits large vendor libraries into separate chunks to improve caching
				 * and reduce initial bundle size. This helps with:
				 * - Better browser caching (vendors change less frequently)
				 * - Faster initial page loads
				 * - More efficient updates (only changed chunks need re-download)
				 */
				manualChunks: (id) => {
					// React and React-related libraries
					if (id.includes('react') && !id.includes('firebase')) {
						return 'react-vendor'
					}

					// Radix UI components
					if (id.includes('@radix-ui/')) {
						return 'radix-ui'
					}

					// Form libraries
					if (
						id.includes('react-hook-form') ||
						id.includes('@hookform/') ||
						id.includes('zod')
					) {
						return 'forms'
					}

					// Firebase related
					if (id.includes('firebase') || id.includes('@firebase/')) {
						return 'firebase'
					}

					// Other vendor libraries
					if (id.includes('node_modules')) {
						return 'vendor'
					}
				},
			},
		},
	},
})
