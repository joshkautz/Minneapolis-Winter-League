module.exports = {
	parser: '@typescript-eslint/parser',
	plugins: ['@typescript-eslint'],
	extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
	root: true,
	env: { browser: true, es6: true, node: true },
	ignorePatterns: ['lib/**'],
	rules: {},
}
