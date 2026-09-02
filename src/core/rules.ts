/**
 * Retry-governing constants, sourced from public NPCI / UPI AutoPay
 * documentation (see README.md for sources). These are treated as
 * hard constraints, not tunables — the sequencer must not be able
 * to exceed them regardless of what a caller passes in.
 */

/** One original execution + up to 3 retries = 4 total attempts max per cycle. */
export const MAX_ATTEMPTS_PER_CYCLE = 4;

/**
 * Suggested retry spacing, in hours, counted from the *previous* failed
 * attempt. Three retry slots map to attempt numbers 2, 3, 4.
 * Spacing gives the customer a real chance to fix the underlying issue
 * (top up balance, re-authenticate) instead of hammering immediately.
 */
export const RETRY_SPACING_HOURS: readonly number[] = [24, 72, 168];

/** Debits at or below this amount don't require a fresh UPI PIN per cycle. */
export const PIN_REAUTH_THRESHOLD_INR = 15_000;

/**
 * Autopay executions should avoid peak hours to reduce systemic load.
 * Kept intentionally simple — a 24h clock window, not a full calendar.
 */
export const NON_PEAK_WINDOW = { startHour: 1, endHour: 5 } as const;

/** Grace period after final failed attempt before the cycle is closed for good. */
export const GRACE_PERIOD_DAYS = 3;

/** Failure reasons for which auto-retry is appropriate at all. */
export const AUTO_RETRYABLE_REASONS = new Set<string>([
  "INSUFFICIENT_FUNDS",
  "BANK_TECHNICAL_ERROR",
  "LIMIT_BREACH",
]);

/**
 * Failure reasons that require user action and should NOT be silently
 * retried by the agent — a reminder/notification is the correct action
 * instead, per NPCI's PIN re-authentication rule for higher-value debits.
 */
export const USER_ACTION_REQUIRED_REASONS = new Set<string>([
  "PIN_REAUTH_REQUIRED",
  "MANDATE_REVOKED",
]);
