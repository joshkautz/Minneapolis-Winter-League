import { defineConfig } from 'vitest/config'

/**
 * Firestore security-rules tests.
 *
 * These run against the Firestore emulator rather than a mock, because the
 * rules language is only meaningfully exercised by the real engine. Launch
 * them with `npm run test:rules`, which boots the emulator via
 * `firebase emulators:exec`.
 */
export default defineConfig({
	test: {
		environment: 'node',
		// Globs resolve from the Vitest root (the repo root), not this file.
		include: ['tests/rules/**/*.test.ts'],
		// The emulator is shared process-wide state; parallel suites would
		// clear each other's seeded documents mid-assertion.
		fileParallelism: false,
		testTimeout: 20_000,
		hookTimeout: 20_000,
	},
})
