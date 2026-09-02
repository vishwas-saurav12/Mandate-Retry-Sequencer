/**
 * Minimal, dependency-free test harness. Deliberately not pulling in
 * jest/mocha/vitest — the project has zero runtime dependencies beyond
 * TypeScript tooling, and a handful of pass/fail assertions don't need
 * a framework. Uses Node's built-in `assert` module for assertions.
 */

export interface TestCase {
  name: string;
  fn: () => void | Promise<void>;
}

const registry: TestCase[] = [];

/** Register a test case. Call this at module load time in *.test.ts files. */
export function test(name: string, fn: () => void | Promise<void>): void {
  registry.push({ name, fn });
}

/** Runs every registered test, prints a report, and sets exit code 1 on any failure. */
export async function runAll(): Promise<void> {
  let passed = 0;
  let failed = 0;

  for (const { name, fn } of registry) {
    try {
      await fn();
      passed++;
      console.log(`  \u2713 ${name}`);
    } catch (err) {
      failed++;
      console.log(`  \u2717 ${name}`);
      console.log(`      ${(err as Error).message}`);
    }
  }

  console.log(`\n${passed} passed, ${failed} failed, ${registry.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}
