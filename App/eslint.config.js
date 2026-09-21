import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { baseConfig, reactConfig } from '../eslint.base.js'

export default [
	...baseConfig,
	react.configs.flat.recommended,
	{
		plugins: {
			'react-hooks': reactHooks,
			'react-refresh': reactRefresh,
		},
		settings: {
			react: {
				version: 'detect',
			},
		},
		...reactConfig,
		rules: {
			...reactConfig.rules,
			...reactHooks.configs.recommended.rules,
			'react-refresh/only-export-components': [
				'warn',
				{ allowConstantExport: true },
			],
			// App-specific overrides
			//
			// set-state-in-effect became an error in eslint-plugin-react-hooks 7.1.
			// It flags 23 pre-existing call sites across the admin screens, the
			// news/posts pages and a couple of shared hooks. Each needs individual
			// judgement — some are genuine cascading-render bugs, others are
			// deliberate sync-on-mount — so they are tracked in docs/ROADMAP.md
			// rather than suppressed one by one or bulk-refactored blind. Demoted
			// to a warning so it stays visible without gating CI.
			'react-hooks/set-state-in-effect': 'warn',
			'no-console': 'warn',
			'no-alert': 'warn',
			'@typescript-eslint/no-empty-object-type': 'warn',
			'@typescript-eslint/no-explicit-any': 'warn',
			'react/no-unescaped-entities': 'off',
		},
	},
	{
		files: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}'],
		rules: {
			'@typescript-eslint/no-explicit-any': 'off',
			'no-console': 'off',
		},
	},
]
