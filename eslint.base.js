import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import globals from 'globals'

/**
 * Shared ESLint configuration for Minneapolis Winter League
 *
 * This configuration provides consistent linting rules across all packages:
 * - App (React frontend)
 * - Functions (Node.js backend)
 * - Shared (TypeScript library)
 *
 * Rules are balanced for development productivity while maintaining code quality.
 */

// Base configuration for all packages
const baseConfig = [
	{
		ignores: [
			'**/node_modules/**',
			'**/dist/**',
			'**/build/**',
			'**/.firebase/**',
			'**/.emulator/**',
			'**/coverage/**',
		],
	},
	eslint.configs.recommended,
	...tseslint.configs.recommended,
	{
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: 'module',
		},
		rules: {
			// TypeScript specific rules - balanced approach
			'@typescript-eslint/no-explicit-any': 'off', // Turn off for now to allow validation functions
			'@typescript-eslint/no-unused-vars': [
				'warn', // Changed from error to warn
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					caughtErrorsIgnorePattern: '^_',
				},
			],
			'@typescript-eslint/explicit-function-return-type': 'off',
			'@typescript-eslint/explicit-module-boundary-types': 'off', // Turn off for flexibility
			'@typescript-eslint/no-non-null-assertion': 'warn',
			'@typescript-eslint/no-empty-object-type': 'warn', // Allow {} for flexibility
			'@typescript-eslint/no-unsafe-function-type': 'warn',

			// General JavaScript/TypeScript rules - relaxed for productivity
			'no-console': 'warn', // Allow console but warn
			'no-debugger': 'warn', // Warn instead of error
			'no-alert': 'warn',
			'prefer-const': 'error',
			'no-var': 'error',
			eqeqeq: ['warn', 'always'], // Warn instead of error
			curly: 'off', // Allow single-line if statements for readability
			'no-duplicate-imports': 'warn', // Warn but don't block
			'no-unused-expressions': 'warn',
		},
	},
]

// Node.js specific configuration (for Functions and Shared)
const nodeConfig = {
	languageOptions: {
		globals: {
			...globals.node,
			...globals.es2022,
		},
	},
	rules: {
		'no-console': 'off', // Allow console in Node.js environments
	},
}

// React specific configuration (for App)
const reactConfig = {
	languageOptions: {
		globals: {
			...globals.browser,
			...globals.es2022,
		},
		parserOptions: {
			ecmaFeatures: {
				jsx: true,
			},
		},
	},
	rules: {
		'react/react-in-jsx-scope': 'off',
		'react/jsx-uses-react': 'off',
		'react/prop-types': 'off',
		'react/display-name': 'warn',
		'react/jsx-key': 'error',
		'react/jsx-no-duplicate-props': 'error',
		'react/jsx-no-undef': 'error',
		'react/jsx-uses-vars': 'error',
		'react/no-deprecated': 'warn',
		'react/no-unknown-property': 'error',
		'react/self-closing-comp': 'warn',
		'react/no-unescaped-entities': 'warn', // Warn instead of error
	},
}

export { baseConfig, nodeConfig, reactConfig }
