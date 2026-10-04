/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Shared helpers for the standalone test scripts (run by `npm test`).
 */

/** Prints a PASS line, or prints the failure and exits non-zero so the test run fails. */
export function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✓ PASS: ${message}`);
}

/** Runs `fn` and returns whatever it throws, or undefined if it completes normally. */
export function caught(fn: () => unknown): unknown {
  try {
    fn();
  } catch (err) {
    return err;
  }
  return undefined;
}
