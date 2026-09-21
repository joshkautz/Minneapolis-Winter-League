import { defineConfig } from 'vitest/config'

/**
 * Functions run on Node, so no DOM environment is needed. Tests live beside
 * the code they cover as `*.test.ts`.
 */
export default defineConfig({
	test: {
		environment: 'node',
		include: ['src/**/*.test.ts'],
	},
})
