import { generateDataset } from "./data/generateDataset";
import { runCycle, summarizeBatch, OutcomeSimulator } from "./core/sequencer";
import { AuditLog } from "./audit/auditLog";
import { AttemptRecord, CycleState } from "./types/mandate";
import { successProbability } from "./core/successModel";
import { runNaiveBaseline, summarizeNaiveBatch, NaiveResult } from "./baseline/naiveBaseline";
import * as fs from "fs";
import * as path from "path";

/** Small deterministic PRNG — same implementation used elsewhere in the project. */
function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeSmartSimulator(seed: number): OutcomeSimulator {
  const rand = mulberry32(seed);
  return (cycle: CycleState, simulatedAttemptTime: Date): AttemptRecord | undefined => {
    const nextAttemptNumber = cycle.attempts.length + 1;
    const lastReason = cycle.attempts[cycle.attempts.length - 1].failureReason;
    const firstAttemptedAt = new Date(cycle.attempts[0].attemptedAt).getTime();
    const elapsedHours = (simulatedAttemptTime.getTime() - firstAttemptedAt) / (1000 * 60 * 60);
    const p = successProbability(lastReason ?? "UNKNOWN", elapsedHours);
    const succeeds = rand() < p;
    return {
      attemptNumber: nextAttemptNumber,
      attemptedAt: simulatedAttemptTime.toISOString(),
      succeeded: succeeds,
      failureReason: succeeds ? undefined : lastReason,
    };
  };
}

function main() {
  const dataset = generateDataset(60, 42);
  const startTime = new Date("2026-08-31T06:00:00.000Z");

  // --- Run 1: the real sequencer (diagnosis + bounded decisions + spacing) ---
  const auditLog = new AuditLog();
  const smartSimulator = makeSmartSimulator(1337);
  const smartCycles: CycleState[] = dataset.map(({ mandate, firstFailure }) =>
    runCycle(mandate, firstFailure, smartSimulator, auditLog, startTime),
  );
  const smartSummary = summarizeBatch(smartCycles);

  // --- Run 2: the naive baseline (blind immediate retries, no diagnosis) ---
  // Separate seeded RNG stream — not paired draw-for-draw with the smart
  // run, but same dataset and same underlying probability model, which is
  // what matters for an honest aggregate comparison at this sample size.
  const naiveRand = mulberry32(1337);
  const naiveResults: NaiveResult[] = dataset.map(({ mandate, firstFailure }) =>
    runNaiveBaseline(mandate, firstFailure, naiveRand),
  );
  const naiveSummary = summarizeNaiveBatch(naiveResults);

  const upliftPct = Math.round((smartSummary.recoveryRatePct - naiveSummary.recoveryRatePct) * 10) / 10;
  const upliftAmountInr = smartSummary.recoveredAmountInr - naiveSummary.recoveredAmountInr;

  console.log("=== Baseline Comparison: Diagnosis+Spacing Sequencer vs Naive Blind Retry ===\n");
  console.log("                          Naive baseline   Smart sequencer");
  console.log(`Recovery rate:            ${String(naiveSummary.recoveryRatePct + "%").padEnd(16)} ${smartSummary.recoveryRatePct}%`);
  console.log(`Recovered amount (₹):     ${naiveSummary.recoveredAmountInr.toLocaleString("en-IN").padEnd(16)} ${smartSummary.recoveredAmountInr.toLocaleString("en-IN")}`);
  console.log(`\nUplift: +${upliftPct} percentage points, +₹${upliftAmountInr.toLocaleString("en-IN")} recovered`);
  console.log("\nNote: the naive baseline still respects the NPCI 4-attempt cap — the");
  console.log("comparison isolates the value of diagnosis + spacing specifically, not");
  console.log("attempt-count compliance (which both approaches must follow either way).");

  const outDir = path.join(__dirname, "..", "output");
  fs.mkdirSync(outDir, { recursive: true });
  const comparison = {
    naiveBaseline: naiveSummary,
    smartSequencer: {
      totalCycles: smartSummary.totalCycles,
      recovered: smartSummary.recovered,
      recoveryRatePct: smartSummary.recoveryRatePct,
      recoveredAmountInr: smartSummary.recoveredAmountInr,
      atRiskAmountInr: smartSummary.atRiskAmountInr,
    },
    upliftPct,
    upliftAmountInr,
  };
  fs.writeFileSync(path.join(outDir, "baseline_comparison.json"), JSON.stringify(comparison, null, 2));
  console.log(`\nWrote baseline_comparison.json -> ${outDir}`);
}

main();
