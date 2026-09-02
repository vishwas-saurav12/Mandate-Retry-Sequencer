/**
 * Test runner entry point. Importing each *.test.ts file registers its
 * test() calls into the shared harness registry; runAll() then executes
 * everything and reports pass/fail.
 */
import "./core/__tests__/decide.test";
import "./core/__tests__/diagnose.test";
import "./core/__tests__/sequencer.test";
import { runAll } from "./testing/testHarness";

runAll();
