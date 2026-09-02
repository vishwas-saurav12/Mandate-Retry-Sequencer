import { AttemptRecord, CycleState, FailureReason } from "../types/mandate";
import { PIN_REAUTH_THRESHOLD_INR } from "./rules";

/**
 * Given the latest failed attempt and the mandate context, decide the
 * failure classification the rest of the pipeline should act on.
 *
 * This is intentionally separate from decide.ts: diagnosis answers
 * "what happened", decision answers "what do we do about it". Keeping
 * them apart makes both independently testable and auditable.
 */
export function diagnose(cycle: CycleState, latestAttempt: AttemptRecord): FailureReason {
  if (latestAttempt.succeeded) {
    throw new Error("diagnose() should only be called on a failed attempt");
  }

  // If the record already carries a reason (e.g. from a bank webhook /
  // synthetic dataset), trust it — this is the common real-world path.
  if (latestAttempt.failureReason) {
    return refineForAmount(cycle, latestAttempt.failureReason);
  }

  return "UNKNOWN";
}

/**
 * High-value mandates (> PIN_REAUTH_THRESHOLD_INR) require fresh UPI PIN
 * authentication per debit. A generic failure on such a mandate is more
 * likely an auth gap than a pure funds issue — reclassify so downstream
 * decision logic routes it to a user-facing reminder instead of a silent
 * retry that would fail again for the same reason.
 */
function refineForAmount(cycle: CycleState, reason: FailureReason): FailureReason {
  if (
    reason === "BANK_TECHNICAL_ERROR" &&
    cycle.mandate.amountInr > PIN_REAUTH_THRESHOLD_INR
  ) {
    return "PIN_REAUTH_REQUIRED";
  }
  return reason;
}
