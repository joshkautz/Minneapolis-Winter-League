import { baseConfig, nodeConfig } from '../eslint.base.js'

export default [
	...baseConfig,
	{
		...nodeConfig,
		rules: {
			...nodeConfig.rules,
			// Functions-specific rules: off
			'no-console': 'off',
			'no-alert': 'off',
			'@typescript-eslint/no-empty-object-type': 'off',
			'@typescript-eslint/no-explicit-any': 'error',
			'@typescript-eslint/explicit-function-return-type': 'error',
			'react/no-unescaped-entities': 'off',
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
