import { AttemptRecord, FailureReason, MandateRecord } from "../types/mandate";
import { PIN_REAUTH_THRESHOLD_INR } from "../core/rules";

export interface DatasetRecord {
  mandate: MandateRecord;
  firstFailure: AttemptRecord;
}

/**
 * Small deterministic PRNG (mulberry32) so the dataset is reproducible
 * across runs — important for judges re-running your batch and getting
 * the same recovery-rate number you reported.
 */
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Real-world-informed failure distribution (rough proportions):
 * insufficient funds is the most common failure mode, followed by
 * bank/technical errors, then limit breaches, then revocations.
 * PIN_REAUTH_REQUIRED is deliberately NOT generated directly here —
 * it emerges from diagnose.ts reclassifying BANK_TECHNICAL_ERROR on
 * high-value mandates, the same way it would from a real bank webhook.
 */
const FAILURE_WEIGHTS: { reason: FailureReason; weight: number }[] = [
  { reason: "INSUFFICIENT_FUNDS", weight: 0.5 },
  { reason: "BANK_TECHNICAL_ERROR", weight: 0.25 },
  { reason: "LIMIT_BREACH", weight: 0.13 },
  { reason: "MANDATE_REVOKED", weight: 0.07 },
  { reason: "UNKNOWN", weight: 0.05 },
];

function pickWeighted(rand: () => number): FailureReason {
  const r = rand();
  let cumulative = 0;
  for (const { reason, weight } of FAILURE_WEIGHTS) {
    cumulative += weight;
    if (r <= cumulative) return reason;
  }
  return "UNKNOWN";
}

/**
 * Amount distribution deliberately straddles PIN_REAUTH_THRESHOLD_INR
 * (₹15,000) so a meaningful fraction of BANK_TECHNICAL_ERROR cases get
 * reclassified to PIN_REAUTH_REQUIRED downstream — exercising that
 * branch instead of leaving it untested by construction.
 */
function generateAmount(rand: () => number): number {
  // 70% of mandates below the threshold (subscriptions, small recurring
  // payments), 30% above it (bigger EMIs / high-value subscriptions).
  if (rand() < 0.7) {
    return Math.round(99 + rand() * (PIN_REAUTH_THRESHOLD_INR - 99 - 500));
  }
  return Math.round(PIN_REAUTH_THRESHOLD_INR + 500 + rand() * 35_000);
}

function isoOffsetDays(base: Date, days: number): string {
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

export function generateDataset(count = 60, seed = 42): DatasetRecord[] {
  const rand = mulberry32(seed);
  const now = new Date("2026-08-31T06:00:00.000Z"); // fixed reference point for reproducibility
  const records: DatasetRecord[] = [];

  for (let i = 1; i <= count; i++) {
    const mandateId = `MID-${String(i).padStart(4, "0")}`;
    const customerId = `CUST-${String(1000 + i)}`;
    const amountInr = generateAmount(rand);
    const mandateAgeDays = Math.round(30 + rand() * 500);
    const failureReason = pickWeighted(rand);

    const mandate: MandateRecord = {
      mandateId,
      customerId,
      amountInr,
      billingCycleId: "CYC-2026-08",
      originalDebitDate: isoOffsetDays(now, -rand() * 2),
      mandateCreatedAt: isoOffsetDays(now, -mandateAgeDays),
    };

    const firstFailure: AttemptRecord = {
      attemptNumber: 1,
      attemptedAt: mandate.originalDebitDate,
      succeeded: false,
      failureReason,
    };

    records.push({ mandate, firstFailure });
  }

  return records;
}

/** CLI entry: writes the dataset to data/dataset.json for inspection. */
function main() {
  const fs = require("fs");
  const path = require("path");
  const dataset = generateDataset(60, 42);
  const outPath = path.join(__dirname, "dataset.json");
  fs.writeFileSync(outPath, JSON.stringify(dataset, null, 2));

  const counts: Record<string, number> = {};
  for (const r of dataset) {
    counts[r.firstFailure.failureReason!] = (counts[r.firstFailure.failureReason!] ?? 0) + 1;
  }
  console.log(`Generated ${dataset.length} records -> ${outPath}`);
  console.log("Failure reason distribution:", counts);
  const above = dataset.filter((r) => r.mandate.amountInr > PIN_REAUTH_THRESHOLD_INR).length;
  console.log(`Mandates above PIN re-auth threshold (₹${PIN_REAUTH_THRESHOLD_INR}): ${above}/${dataset.length}`);
}

if (require.main === module) {
  main();
}
