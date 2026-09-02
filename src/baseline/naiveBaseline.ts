import { AttemptRecord, CycleState, MandateRecord } from "../types/mandate";
import { MAX_ATTEMPTS_PER_CYCLE } from "../core/rules";
import { successProbability } from "../core/successModel";

export interface NaiveResult {
  mandate: MandateRecord;
  attempts: AttemptRecord[];
  recovered: boolean;
  recoveredAmountInr?: number;
}

/**
 * The "naive" comparison point: what most first-pass retry logic actually
 * looks like — fire up to MAX_ATTEMPTS_PER_CYCLE retries back-to-back,
 * immediately, with no diagnosis step and no regard for *why* the debit
 * failed (so it can't route revoked mandates to escalation or high-value
 * PIN failures to a reminder — it just blindly retries everyone the same
 * way). It still respects the NPCI attempt cap, because ignoring that
 * outright would be a compliance violation, not just "naive" — this
 * baseline is meant to isolate the value of diagnosis + spacing
 * specifically, not attempt-count discipline.
 *
 * Uses the SAME successProbability() curves as the real sequencer, always
 * called with elapsedHours = 0, since every retry fires immediately with
 * no time for the customer to act — this keeps the comparison apples-to-
 * apples: identical outcome model, the only difference is timing/targeting.
 */
export function runNaiveBaseline(
  mandate: MandateRecord,
  firstFailure: AttemptRecord,
  rand: () => number,
): NaiveResult {
  const attempts: AttemptRecord[] = [firstFailure];

  while (attempts.length < MAX_ATTEMPTS_PER_CYCLE) {
    const last = attempts[attempts.length - 1];
    if (last.succeeded) break;

    // Blind: no diagnosis-based routing, so revoked/PIN-reauth mandates
    // get retried exactly the same way as an insufficient-funds failure.
    const p = successProbability(last.failureReason ?? "UNKNOWN", 0);
    const succeeds = rand() < p;

    attempts.push({
      attemptNumber: attempts.length + 1,
      attemptedAt: last.attemptedAt, // fired immediately — no spacing
      succeeded: succeeds,
      failureReason: succeeds ? undefined : last.failureReason,
    });

    if (succeeds) break;
  }

  const lastAttempt = attempts[attempts.length - 1];
  const recovered = lastAttempt.succeeded;

  return {
    mandate,
    attempts,
    recovered,
    recoveredAmountInr: recovered ? mandate.amountInr : undefined,
  };
}

export interface NaiveBatchSummary {
  totalCycles: number;
  recovered: number;
  recoveryRatePct: number;
  recoveredAmountInr: number;
  atRiskAmountInr: number;
}

export function summarizeNaiveBatch(results: NaiveResult[]): NaiveBatchSummary {
  let recovered = 0;
  let recoveredAmountInr = 0;
  let atRiskAmountInr = 0;

  for (const r of results) {
    atRiskAmountInr += r.mandate.amountInr;
    if (r.recovered) {
      recovered += 1;
      recoveredAmountInr += r.recoveredAmountInr ?? r.mandate.amountInr;
    }
  }

  return {
    totalCycles: results.length,
    recovered,
    recoveryRatePct: results.length ? Math.round((recovered / results.length) * 1000) / 10 : 0,
    recoveredAmountInr,
    atRiskAmountInr,
  };
}
