import { generateDataset } from "./data/generateDataset";
import { runCycle, summarizeBatch, OutcomeSimulator } from "./core/sequencer";
import { AuditLog } from "./audit/auditLog";
import { AttemptRecord, CycleState } from "./types/mandate";
import { successProbability } from "./core/successModel";
import * as fs from "fs";
import * as path from "path";

/**
 * Time-aware retry-outcome simulator. Success probability comes from the
 * shared successModel.ts curves — see that file for the reasoning behind
 * each one. Here they're evaluated against real simulated elapsed time
 * (see sequencer.ts), which is what the baseline comparison in
 * baseline/naiveBaseline.ts deliberately does NOT get to use.
 */
function makeSimulator(seed: number): OutcomeSimulator {
  let s = seed;
  const rand = () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

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
  const auditLog = new AuditLog();
  const simulateOutcome = makeSimulator(1337);
  const startTime = new Date("2026-08-31T06:00:00.000Z");

  const cycles: CycleState[] = dataset.map(({ mandate, firstFailure }) =>
    runCycle(mandate, firstFailure, simulateOutcome, auditLog, startTime),
  );

  const summary = summarizeBatch(cycles);

  console.log("=== Batch Summary (Mandate Retry Sequencer) ===");
  console.log(`Total cycles processed:     ${summary.totalCycles}`);
  console.log(`Recovered:                  ${summary.recovered} (${summary.recoveryRatePct}%)`);
  console.log(`Escalated to human:         ${summary.escalated}`);
  console.log(`Awaiting user action:       ${summary.awaitingUser}`);
  console.log(`Failed terminal:            ${summary.failedTerminal}`);
  console.log(`At-risk amount (₹):         ${summary.atRiskAmountInr.toLocaleString("en-IN")}`);
  console.log(`Recovered amount (₹):       ${summary.recoveredAmountInr.toLocaleString("en-IN")}`);

  const outDir = path.join(__dirname, "..", "output");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "batch_summary.json"), JSON.stringify(summary, null, 2));
  fs.writeFileSync(
    path.join(outDir, "cycle_results.json"),
    JSON.stringify(
      cycles.map((c) => ({
        mandateId: c.mandate.mandateId,
        amountInr: c.mandate.amountInr,
        status: c.status,
        attempts: c.attempts.length,
      })),
      null,
      2,
    ),
  );
  fs.writeFileSync(path.join(outDir, "audit_trail.json"), auditLog.toJSON());

  console.log(`\nWrote batch_summary.json, cycle_results.json, audit_trail.json -> ${outDir}`);
}

main();
