import { AttemptRecord, CycleState, FailureReason, MandateRecord } from "../types/mandate";

let mandateCounter = 0;

export function makeMandate(overrides: Partial<MandateRecord> = {}): MandateRecord {
  mandateCounter += 1;
  return {
    mandateId: `TEST-MID-${mandateCounter}`,
    customerId: `TEST-CUST-${mandateCounter}`,
    amountInr: 999,
    billingCycleId: "CYC-TEST",
    originalDebitDate: "2026-08-01T06:00:00.000Z",
    mandateCreatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

export function makeAttempt(overrides: Partial<AttemptRecord> = {}): AttemptRecord {
  return {
    attemptNumber: 1,
    attemptedAt: "2026-08-01T06:00:00.000Z",
    succeeded: false,
    failureReason: "INSUFFICIENT_FUNDS",
    ...overrides,
  };
}

/** Builds a CycleState with N prior failed attempts, all sharing the given reason. */
export function makeCycleWithAttempts(
  attemptCount: number,
  reason: FailureReason,
  mandateOverrides: Partial<MandateRecord> = {},
): CycleState {
  const mandate = makeMandate(mandateOverrides);
  const attempts: AttemptRecord[] = [];
  for (let i = 1; i <= attemptCount; i++) {
    attempts.push(
      makeAttempt({
        attemptNumber: i,
        attemptedAt: new Date(2026, 7, i).toISOString(),
        failureReason: reason,
      }),
    );
  }
  return { mandate, attempts, status: "PENDING" };
}
