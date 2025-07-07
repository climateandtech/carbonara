module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/test/**/*.test.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js'
  ],
  testTimeout: 15000, // 15 seconds for CLI operations
  verbose: true,
  detectOpenHandles: true,
  forceExit: true
}; 