import { ActionType, CycleState, FailureReason } from "../types/mandate";
import {
  AUTO_RETRYABLE_REASONS,
  GRACE_PERIOD_DAYS,
  MAX_ATTEMPTS_PER_CYCLE,
  RETRY_SPACING_HOURS,
  USER_ACTION_REQUIRED_REASONS,
} from "./rules";

export interface Decision {
  action: ActionType;
  reasonCode: string;      // short machine-readable justification
  explanation: string;     // human-readable justification for the audit trail
  nextEligibleRetryAt?: string;
}

/**
 * The bounded decision function. This is the single place that decides
 * what the agent does next — everything here must respect the hard caps
 * in rules.ts. No caller can push it past MAX_ATTEMPTS_PER_CYCLE.
 */
export function decide(cycle: CycleState, diagnosis: FailureReason, now: Date): Decision {
  const attemptCount = cycle.attempts.length;

  // Non-retryable takes priority over the attempt-budget check: a revoked
  // mandate should always go to a human, never get the retry-oriented
  // "grace period" message, regardless of how many attempts it happens
  // to have accumulated.
  if (diagnosis === "MANDATE_REVOKED") {
    return {
      action: "ESCALATE_TO_HUMAN",
      reasonCode: "MANDATE_REVOKED",
      explanation: "Mandate was revoked by the customer or bank — no retry is valid. Escalating for manual follow-up (e.g. re-registration outreach).",
    };
  }

  // Hard stop: attempt budget exhausted.
  if (attemptCount >= MAX_ATTEMPTS_PER_CYCLE) {
    return {
      action: "SEND_GRACE_PERIOD_WARNING",
      reasonCode: "ATTEMPTS_EXHAUSTED",
      explanation:
        `Reached ${attemptCount}/${MAX_ATTEMPTS_PER_CYCLE} attempts (1 original + ` +
        `${MAX_ATTEMPTS_PER_CYCLE - 1} retries), the NPCI-allowed maximum. ` +
        `Issuing a ${GRACE_PERIOD_DAYS}-day grace period warning before closing the cycle.`,
    };
  }

  // User-action-required: silent retry would fail again for the same reason.
  if (USER_ACTION_REQUIRED_REASONS.has(diagnosis)) {
    return {
      action: "SEND_USER_REMINDER",
      reasonCode: diagnosis,
      explanation:
        "Failure requires user-side action (re-authentication) that the agent cannot perform on the user's behalf. " +
        "Sending a targeted reminder instead of a doomed automatic retry.",
    };
  }

  // Auto-retryable: schedule the next retry within the NPCI-respecting window.
  if (AUTO_RETRYABLE_REASONS.has(diagnosis)) {
    const retrySlot = attemptCount - 1; // attempts[0] = original execution
    const spacingHours = RETRY_SPACING_HOURS[Math.min(retrySlot, RETRY_SPACING_HOURS.length - 1)];
    const nextEligibleRetryAt = new Date(now.getTime() + spacingHours * 60 * 60 * 1000).toISOString();

    return {
      action: "SCHEDULE_RETRY",
      reasonCode: diagnosis,
      explanation:
        `Diagnosis (${diagnosis}) is auto-retryable. Scheduling retry #${attemptCount + 1} ` +
        `${spacingHours}h from now, per spaced retry policy (24h / 72h / 168h) — ` +
        `never firing retries back-to-back.`,
      nextEligibleRetryAt,
    };
  }

  // Fallback: unknown failure reason — don't guess, escalate instead of retrying blind.
  return {
    action: "ESCALATE_TO_HUMAN",
    reasonCode: "UNKNOWN_FAILURE",
    explanation: "Failure reason could not be classified. Escalating rather than retrying blind against an unknown cause.",
  };
}
