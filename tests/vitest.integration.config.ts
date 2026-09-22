import { defineConfig } from 'vitest/config'

/**
 * Emulator-backed integration tests.
 *
 * These import the real Functions source and run it against the Firestore
 * emulator, so they cover what unit tests with mocked Firestore cannot:
 * actual document paths, transaction atomicity, and collection-group reads.
 *
 * Launched by `npm run test:integration`, which starts the emulator.
 */
export default defineConfig({
	test: {
		environment: 'node',
		include: ['tests/integration/**/*.test.ts'],
		// The emulator is shared state; parallel files would clear each
		// other's fixtures between a write and its assertion.
		fileParallelism: false,
		testTimeout: 20_000,
		hookTimeout: 20_000,
	},
})
