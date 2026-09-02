import * as assert from "assert";
import { test } from "../../testing/testHarness";
import { makeCycleWithAttempts } from "../../testing/fixtures";
import { decide } from "../decide";
import { MAX_ATTEMPTS_PER_CYCLE, RETRY_SPACING_HOURS } from "../rules";

const NOW = new Date("2026-08-31T06:00:00.000Z");

test("decide: never schedules a retry once MAX_ATTEMPTS_PER_CYCLE is reached", () => {
  const cycle = makeCycleWithAttempts(MAX_ATTEMPTS_PER_CYCLE, "INSUFFICIENT_FUNDS");
  const decision = decide(cycle, "INSUFFICIENT_FUNDS", NOW);
  assert.notStrictEqual(
    decision.action,
    "SCHEDULE_RETRY",
    `expected no more retries at ${MAX_ATTEMPTS_PER_CYCLE} attempts, got SCHEDULE_RETRY`,
  );
  assert.strictEqual(decision.action, "SEND_GRACE_PERIOD_WARNING");
});

test("decide: never schedules a retry above MAX_ATTEMPTS_PER_CYCLE even if called again", () => {
  const cycle = makeCycleWithAttempts(MAX_ATTEMPTS_PER_CYCLE + 3, "INSUFFICIENT_FUNDS");
  const decision = decide(cycle, "INSUFFICIENT_FUNDS", NOW);
  assert.notStrictEqual(decision.action, "SCHEDULE_RETRY");
});

test("decide: a revoked mandate is always escalated, never auto-retried", () => {
  // Check at every attempt count from 1 up to the cap — revocation must
  // win regardless of how much retry budget is left.
  for (let attemptCount = 1; attemptCount <= MAX_ATTEMPTS_PER_CYCLE; attemptCount++) {
    const cycle = makeCycleWithAttempts(attemptCount, "MANDATE_REVOKED");
    const decision = decide(cycle, "MANDATE_REVOKED", NOW);
    assert.strictEqual(
      decision.action,
      "ESCALATE_TO_HUMAN",
      `at attemptCount=${attemptCount}, expected ESCALATE_TO_HUMAN, got ${decision.action}`,
    );
  }
});

test("decide: PIN re-auth required routes to a user reminder, not a silent retry", () => {
  const cycle = makeCycleWithAttempts(1, "PIN_REAUTH_REQUIRED", { amountInr: 25000 });
  const decision = decide(cycle, "PIN_REAUTH_REQUIRED", NOW);
  assert.strictEqual(decision.action, "SEND_USER_REMINDER");
});

test("decide: unknown failure reason escalates instead of retrying blind", () => {
  const cycle = makeCycleWithAttempts(1, "UNKNOWN");
  const decision = decide(cycle, "UNKNOWN", NOW);
  assert.strictEqual(decision.action, "ESCALATE_TO_HUMAN");
});

test("decide: auto-retryable failures use the spaced retry schedule (24h / 72h / 168h)", () => {
  // First failure -> retry #2 should be scheduled RETRY_SPACING_HOURS[0] later.
  const cycle1 = makeCycleWithAttempts(1, "INSUFFICIENT_FUNDS");
  const d1 = decide(cycle1, "INSUFFICIENT_FUNDS", NOW);
  assert.strictEqual(d1.action, "SCHEDULE_RETRY");
  const expected1 = new Date(NOW.getTime() + RETRY_SPACING_HOURS[0] * 3600 * 1000).toISOString();
  assert.strictEqual(d1.nextEligibleRetryAt, expected1);

  // Second failure -> retry #3 should be scheduled RETRY_SPACING_HOURS[1] later.
  const cycle2 = makeCycleWithAttempts(2, "INSUFFICIENT_FUNDS");
  const d2 = decide(cycle2, "INSUFFICIENT_FUNDS", NOW);
  const expected2 = new Date(NOW.getTime() + RETRY_SPACING_HOURS[1] * 3600 * 1000).toISOString();
  assert.strictEqual(d2.nextEligibleRetryAt, expected2);
});

test("decide: retries are never spaced back-to-back (each scheduled retry is in the future relative to now)", () => {
  for (let attemptCount = 1; attemptCount < MAX_ATTEMPTS_PER_CYCLE; attemptCount++) {
    const cycle = makeCycleWithAttempts(attemptCount, "BANK_TECHNICAL_ERROR");
    const decision = decide(cycle, "BANK_TECHNICAL_ERROR", NOW);
    if (decision.action === "SCHEDULE_RETRY") {
      assert.ok(decision.nextEligibleRetryAt, "expected a nextEligibleRetryAt timestamp");
      const gapHours = (new Date(decision.nextEligibleRetryAt!).getTime() - NOW.getTime()) / 3600000;
      assert.ok(gapHours >= RETRY_SPACING_HOURS[0], `expected at least ${RETRY_SPACING_HOURS[0]}h gap, got ${gapHours}h`);
    }
  }
});
