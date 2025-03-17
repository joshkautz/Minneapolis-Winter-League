import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import react from 'eslint-plugin-react'

export default [
	eslint.configs.recommended,
	...tseslint.configs.recommended,
	react.configs.flat.recommended,
	{
		settings: {
			react: {
				version: 'detect',
			},
		},
		rules: {
			'react/react-in-jsx-scope': 'off',
			'react/jsx-uses-react': 'off',
			'react/prop-types': 'off',
		},
	},
	{
		ignores: ['dist', 'eslint.config.js', 'tailwind.config.js'],
	},
]
