import { AttemptRecord, CycleState, MandateRecord } from "./types/mandate";
import { runCycle, summarizeBatch, OutcomeSimulator } from "./core/sequencer";
import { AuditLog } from "./audit/auditLog";

/**
 * Smoke test: three hand-written mandates covering the three main
 * decision branches (auto-retryable, user-action-required, escalate).
 * The real synthetic batch (50+ records) will replace this in index.ts
 * once the dataset generator is built.
 */
function sampleMandates(): { mandate: MandateRecord; firstFailure: AttemptRecord }[] {
  const now = new Date();
  return [
    {
      mandate: {
        mandateId: "MID-001",
        customerId: "CUST-001",
        amountInr: 499,
        billingCycleId: "CYC-2026-08",
        originalDebitDate: now.toISOString(),
        mandateCreatedAt: "2026-01-01T00:00:00.000Z",
      },
      firstFailure: {
        attemptNumber: 1,
        attemptedAt: now.toISOString(),
        succeeded: false,
        failureReason: "INSUFFICIENT_FUNDS",
      },
    },
    {
      mandate: {
        mandateId: "MID-002",
        customerId: "CUST-002",
        amountInr: 25000,
        billingCycleId: "CYC-2026-08",
        originalDebitDate: now.toISOString(),
        mandateCreatedAt: "2026-02-01T00:00:00.000Z",
      },
      firstFailure: {
        attemptNumber: 1,
        attemptedAt: now.toISOString(),
        succeeded: false,
        failureReason: "BANK_TECHNICAL_ERROR", // will be reclassified to PIN_REAUTH_REQUIRED (amount > 15,000)
      },
    },
    {
      mandate: {
        mandateId: "MID-003",
        customerId: "CUST-003",
        amountInr: 999,
        billingCycleId: "CYC-2026-08",
        originalDebitDate: now.toISOString(),
        mandateCreatedAt: "2026-03-01T00:00:00.000Z",
      },
      firstFailure: {
        attemptNumber: 1,
        attemptedAt: now.toISOString(),
        succeeded: false,
        failureReason: "MANDATE_REVOKED",
      },
    },
  ];
}

function main() {
  const auditLog = new AuditLog();
  const cycles: CycleState[] = [];

  // Deterministic fake retry outcome for the smoke test: funds issues
  // succeed on the 2nd attempt, everything else keeps failing.
  const simulateOutcome: OutcomeSimulator = (cycle, simulatedAttemptTime) => {
    const nextAttemptNumber = cycle.attempts.length + 1;
    const lastReason = cycle.attempts[cycle.attempts.length - 1].failureReason;
    const succeeds = lastReason === "INSUFFICIENT_FUNDS" && nextAttemptNumber === 2;
    return {
      attemptNumber: nextAttemptNumber,
      attemptedAt: simulatedAttemptTime.toISOString(),
      succeeded: succeeds,
      failureReason: succeeds ? undefined : lastReason,
    };
  };

  for (const { mandate, firstFailure } of sampleMandates()) {
    cycles.push(runCycle(mandate, firstFailure, simulateOutcome, auditLog));
  }

  console.log("=== Cycle outcomes ===");
  for (const c of cycles) {
    console.log(`${c.mandate.mandateId}: ${c.status} (${c.attempts.length} attempt(s))`);
  }

  console.log("\n=== Batch summary ===");
  console.log(summarizeBatch(cycles));

  console.log("\n=== Audit trail ===");
  console.log(auditLog.toJSON());
}

main();
