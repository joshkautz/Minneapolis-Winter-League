import { baseConfig, nodeConfig } from '../eslint.base.js'

export default [
	...baseConfig,
	{
		...nodeConfig,
		rules: {
			...nodeConfig.rules,
			// Functions-specific rules
			'@typescript-eslint/no-explicit-any': 'error', // Stricter for backend
			'no-console': 'off', // Console allowed for logging
			'@typescript-eslint/explicit-function-return-type': 'warn', // Better for API functions
		},
	},
	{
		files: ['**/*.test.{ts,js}', '**/*.spec.{ts,js}'],
		rules: {
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/explicit-function-return-type': 'off',
		},
	},
]
