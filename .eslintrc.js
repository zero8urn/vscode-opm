module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
  plugins: ['@typescript-eslint', 'prettier'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
  ],
  env: { node: true, es2020: true },
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
    'prettier/prettier': 'warn',
  },
};
