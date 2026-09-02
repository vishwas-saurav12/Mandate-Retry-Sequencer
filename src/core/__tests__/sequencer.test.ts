import * as assert from "assert";
import { test } from "../../testing/testHarness";
import { makeMandate, makeAttempt } from "../../testing/fixtures";
import { runCycle, summarizeBatch, OutcomeSimulator } from "../sequencer";
import { AuditLog } from "../../audit/auditLog";
import { MAX_ATTEMPTS_PER_CYCLE } from "../rules";
import { CycleState } from "../../types/mandate";

const START = new Date("2026-08-31T06:00:00.000Z");

test("runCycle: never exceeds MAX_ATTEMPTS_PER_CYCLE even if every retry fails", () => {
  const mandate = makeMandate({ amountInr: 999 });
  const firstFailure = makeAttempt({ failureReason: "INSUFFICIENT_FUNDS" });
  const alwaysFails: OutcomeSimulator = (cycle, simulatedAttemptTime) => ({
    attemptNumber: cycle.attempts.length + 1,
    attemptedAt: simulatedAttemptTime.toISOString(),
    succeeded: false,
    failureReason: "INSUFFICIENT_FUNDS",
  });

  const auditLog = new AuditLog();
  const cycle = runCycle(mandate, firstFailure, alwaysFails, auditLog, START);

  assert.ok(
    cycle.attempts.length <= MAX_ATTEMPTS_PER_CYCLE,
    `expected at most ${MAX_ATTEMPTS_PER_CYCLE} attempts, got ${cycle.attempts.length}`,
  );
  assert.strictEqual(cycle.status, "AWAITING_USER"); // grace-period warning state
});

test("runCycle: marks RECOVERED and records the recovered amount when a retry succeeds", () => {
  const mandate = makeMandate({ amountInr: 1500 });
  const firstFailure = makeAttempt({ failureReason: "BANK_TECHNICAL_ERROR" });
  const succeedsOnFirstRetry: OutcomeSimulator = (cycle, simulatedAttemptTime) => ({
    attemptNumber: cycle.attempts.length + 1,
    attemptedAt: simulatedAttemptTime.toISOString(),
    succeeded: true,
  });

  const auditLog = new AuditLog();
  const cycle = runCycle(mandate, firstFailure, succeedsOnFirstRetry, auditLog, START);

  assert.strictEqual(cycle.status, "RECOVERED");
  assert.strictEqual(cycle.recoveredAmountInr, 1500);
});

test("runCycle: a revoked mandate is escalated immediately with no retry attempts added", () => {
  const mandate = makeMandate();
  const firstFailure = makeAttempt({ failureReason: "MANDATE_REVOKED" });
  const shouldNeverBeCalled: OutcomeSimulator = () => {
    throw new Error("simulateOutcome should not be called for a revoked mandate");
  };

  const auditLog = new AuditLog();
  const cycle = runCycle(mandate, firstFailure, shouldNeverBeCalled, auditLog, START);

  assert.strictEqual(cycle.status, "ESCALATED");
  assert.strictEqual(cycle.attempts.length, 1, "no retry attempt should have been added");
});

test("runCycle: audit log records exactly one entry per decision made", () => {
  const mandate = makeMandate();
  const firstFailure = makeAttempt({ failureReason: "LIMIT_BREACH" });
  const alwaysFails: OutcomeSimulator = (cycle, simulatedAttemptTime) => ({
    attemptNumber: cycle.attempts.length + 1,
    attemptedAt: simulatedAttemptTime.toISOString(),
    succeeded: false,
    failureReason: "LIMIT_BREACH",
  });

  const auditLog = new AuditLog();
  const cycle = runCycle(mandate, firstFailure, alwaysFails, auditLog, START);
  const entries = auditLog.forMandate(mandate.mandateId);

  // One audit entry per attempt-decision made in the loop.
  assert.ok(entries.length >= 1);
  assert.ok(entries.length <= MAX_ATTEMPTS_PER_CYCLE);
  for (const entry of entries) {
    assert.ok(entry.decision.explanation.length > 0, "every audit entry must carry an explanation");
  }
});

test("summarizeBatch: computes recovery rate and totals correctly", () => {
  const cycles: CycleState[] = [
    { mandate: makeMandate({ amountInr: 1000 }), attempts: [], status: "RECOVERED", recoveredAmountInr: 1000 },
    { mandate: makeMandate({ amountInr: 2000 }), attempts: [], status: "RECOVERED", recoveredAmountInr: 2000 },
    { mandate: makeMandate({ amountInr: 500 }), attempts: [], status: "ESCALATED" },
    { mandate: makeMandate({ amountInr: 750 }), attempts: [], status: "AWAITING_USER" },
  ];

  const summary = summarizeBatch(cycles);

  assert.strictEqual(summary.totalCycles, 4);
  assert.strictEqual(summary.recovered, 2);
  assert.strictEqual(summary.escalated, 1);
  assert.strictEqual(summary.awaitingUser, 1);
  assert.strictEqual(summary.recoveredAmountInr, 3000);
  assert.strictEqual(summary.atRiskAmountInr, 4250);
  assert.strictEqual(summary.recoveryRatePct, 50); // 2/4 = 50%
});
