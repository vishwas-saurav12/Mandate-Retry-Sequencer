/**
 * Shared retry success-probability model.
 *
 * Used by BOTH the real sequencer (runBatch.ts, via elapsed simulated
 * time) and the naive baseline (naiveBaseline.ts, always called with
 * elapsedHours = 0). Keeping this in one place means the baseline
 * comparison isolates exactly what we want it to: the value of
 * diagnosis + spacing, not a difference in the underlying outcome model.
 *
 * See each case for the real-world reasoning behind the curve — these
 * are stated assumptions, not numbers picked to hit a target result.
 */
export function successProbability(reason: string, elapsedHours: number): number {
  const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

  switch (reason) {
    case "INSUFFICIENT_FUNDS": {
      // Linear ramp from 0.12 at 24h to 0.62 at 168h (one week).
      const t = clamp01((elapsedHours - 24) / (168 - 24));
      return 0.12 + t * (0.62 - 0.12);
    }
    case "BANK_TECHNICAL_ERROR": {
      // Resolves quickly or not at all — flat-ish, mildly increasing.
      return elapsedHours >= 24 ? 0.58 : 0.3;
    }
    case "LIMIT_BREACH": {
      // Low before a reset window has plausibly occurred, high after.
      return elapsedHours >= 24 ? 0.72 : 0.08;
    }
    case "UNKNOWN":
    default:
      return 0.12;
  }
}
