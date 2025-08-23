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
		chunkSizeWarningLimit: 1000, // Increase limit since we're not splitting chunks as aggressively
	},
})
