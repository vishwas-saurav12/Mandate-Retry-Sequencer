/**
 * Core domain types for the Mandate Retry Sequencer.
 * A "mandate cycle" is one scheduled debit attempt for a recurring
 * UPI Autopay / e-NACH mandate, and everything that happens to it
 * until it's either recovered or terminally marked failed.
 */

export type FailureReason =
  | "INSUFFICIENT_FUNDS"
  | "BANK_TECHNICAL_ERROR"
  | "LIMIT_BREACH"
  | "PIN_REAUTH_REQUIRED"
  | "MANDATE_REVOKED"
  | "UNKNOWN";

export type CycleStatus =
  | "PENDING"          // not yet attempted this cycle
  | "IN_RETRY"         // has failed at least once, still within retry budget
  | "AWAITING_USER"     // needs user action (e.g. PIN re-auth) — agent can't silently retry
  | "RECOVERED"         // a retry succeeded
  | "FAILED_TERMINAL"   // exhausted retries / non-retryable, cycle closed
  | "ESCALATED";         // handed off to human / support queue

export type ActionType =
  | "SCHEDULE_RETRY"
  | "SEND_USER_REMINDER"
  | "SEND_GRACE_PERIOD_WARNING"
  | "ESCALATE_TO_HUMAN"
  | "CLOSE_CYCLE"
  | "NO_OP";

export interface MandateRecord {
  mandateId: string;
  customerId: string;
  amountInr: number;
  billingCycleId: string;
  originalDebitDate: string; // ISO timestamp of the scheduled (attempt #1) debit
  mandateCreatedAt: string;
}

/** A single debit attempt against a mandate, real or simulated. */
export interface AttemptRecord {
  attemptNumber: number; // 1 = original execution, 2-4 = retries
  attemptedAt: string;   // ISO timestamp
  succeeded: boolean;
  failureReason?: FailureReason;
}

/** Full state tracked for one mandate's current billing cycle. */
export interface CycleState {
  mandate: MandateRecord;
  attempts: AttemptRecord[];
  status: CycleStatus;
  nextEligibleRetryAt?: string; // ISO timestamp — null once exhausted
  recoveredAmountInr?: number;
}
