module.exports = {
  verbose: true,
  transform: {
    '^.+\\.js$': 'babel-jest',
    '^.+\\.svelte$': 'jest-transform-svelte',
  },
  testMatch: ["**/__tests__/unit/*.[jt]s?(x)"],
  moduleFileExtensions: ['js', 'svelte'],
  setupFilesAfterEnv: ['@testing-library/jest-dom/extend-expect'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/web_modules/',
    '/docs/',
    '/example/',
    '/lib/',
    '/types/',
    '/tests/e2e/'
  ],
};
