module.exports = {
  root: true,
  extends: ['eslint:recommended', 'prettier'],
  parser: '@babel/eslint-parser',
  env: {
    browser: true,
    node: true,
  },
  parserOptions: {
    sourceType: 'module',
    ecmaVersion: 2017,
  },
  plugins: ['jest'],
}
