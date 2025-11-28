// FIXME: Workaround for vitest worker communication timeout during cleanup
// This suppresses "[vitest-worker]: Timeout calling 'onTaskUpdate'" errors
// that occur after all tests complete successfully. This is a known vitest issue
// where worker cleanup can timeout without affecting test results.
// TODO: Remove this workaround when vitest fixes worker cleanup timeouts
// See: https://github.com/vitest-dev/vitest/issues/...

// Suppress unhandled worker timeout errors that occur during test cleanup
process.on('unhandledRejection', (reason) => {
  const errorMessage = reason instanceof Error ? reason.message : String(reason || '');
  const errorName = reason instanceof Error ? reason.name : '';
  
  if (
    errorMessage.includes('onTaskUpdate') ||
    errorMessage.includes('vitest-worker') ||
    errorMessage.includes('[vitest-worker]') ||
    errorName.includes('vitest-worker')
  ) {
    // Silently ignore worker communication timeouts during cleanup
    return;
  }
  // Re-throw other unhandled rejections
  throw reason;
});

