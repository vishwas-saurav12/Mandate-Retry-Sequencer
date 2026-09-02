import { AttemptRecord, CycleState, MandateRecord } from "../types/mandate";
import { diagnose } from "./diagnose";
import { decide } from "./decide";
import { execute } from "./execute";
import { AuditLog } from "../audit/auditLog";

export interface BatchSummary {
  totalCycles: number;
  recovered: number;
  escalated: number;
  awaitingUser: number;
  failedTerminal: number;
  recoveredAmountInr: number;
  atRiskAmountInr: number;
  recoveryRatePct: number;
}

/**
 * simulateOutcome is given the cycle AND the simulated point in time the
 * retry actually fires at (not wall-clock "now" — the logical time after
 * the 24h/72h/168h spacing has been applied). This is what lets success
 * probability legitimately depend on elapsed time, e.g. "the customer had
 * 3 days to top up their balance" instead of a flat coin flip.
 */
export type OutcomeSimulator = (
  cycle: CycleState,
  simulatedAttemptTime: Date,
) => AttemptRecord | undefined;

/**
 * Runs one mandate's first-failure record through the full loop until
 * it reaches a terminal-for-this-batch state (recovered, escalated,
 * awaiting user, or attempts exhausted).
 *
 * Time is simulated, not real: each retry's diagnosis/decision is made
 * at the logical timestamp the previous decision scheduled it for
 * (decision.nextEligibleRetryAt), so the 24h/72h/168h spacing from
 * rules.ts is actually reflected in what the outcome simulator sees,
 * instead of every retry resolving in the same instant.
 */
export function runCycle(
  mandate: MandateRecord,
  firstFailedAttempt: AttemptRecord,
  simulateOutcome: OutcomeSimulator,
  auditLog: AuditLog,
  startTime: Date = new Date(),
): CycleState {
  const cycle: CycleState = {
    mandate,
    attempts: [firstFailedAttempt],
    status: "PENDING",
  };

  let simulatedNow = startTime;

  // Loop bounded by MAX_ATTEMPTS_PER_CYCLE via decide.ts — never infinite.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const latestAttempt = cycle.attempts[cycle.attempts.length - 1];
    const diagnosis = diagnose(cycle, latestAttempt);
    const decision = decide(cycle, diagnosis, simulatedNow);

    // Advance simulated time to the point the retry is actually eligible
    // to fire, BEFORE resolving its outcome — this is what makes the
    // spacing real instead of decorative.
    if (decision.action === "SCHEDULE_RETRY" && decision.nextEligibleRetryAt) {
      simulatedNow = new Date(decision.nextEligibleRetryAt);
    }

    const { outcomeNote } = execute(cycle, decision, simulateOutcome, simulatedNow);

    auditLog.record({
      mandateId: mandate.mandateId,
      attemptNumber: latestAttempt.attemptNumber,
      diagnosis,
      decision,
      outcomeNote,
    });

    // Stop looping once we've reached a state that isn't "still retrying now".
    if (cycle.status !== "IN_RETRY") break;

    // If execute() didn't append a new attempt, nothing left to advance on.
    const newestAttempt = cycle.attempts[cycle.attempts.length - 1];
    if (newestAttempt === latestAttempt) break;
  }

  return cycle;
}

export function summarizeBatch(cycles: CycleState[]): BatchSummary {
  const summary: BatchSummary = {
    totalCycles: cycles.length,
    recovered: 0,
    escalated: 0,
    awaitingUser: 0,
    failedTerminal: 0,
    recoveredAmountInr: 0,
    atRiskAmountInr: 0,
    recoveryRatePct: 0,
  };

  for (const cycle of cycles) {
    summary.atRiskAmountInr += cycle.mandate.amountInr;
    switch (cycle.status) {
      case "RECOVERED":
        summary.recovered += 1;
        summary.recoveredAmountInr += cycle.recoveredAmountInr ?? cycle.mandate.amountInr;
        break;
      case "ESCALATED":
        summary.escalated += 1;
        break;
      case "AWAITING_USER":
        summary.awaitingUser += 1;
        break;
      case "FAILED_TERMINAL":
        summary.failedTerminal += 1;
        break;
    }
  }

  summary.recoveryRatePct = summary.totalCycles
    ? Math.round((summary.recovered / summary.totalCycles) * 1000) / 10
    : 0;

  return summary;
}
