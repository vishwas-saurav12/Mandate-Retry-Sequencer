# Mandate Retry Sequencer — Track 03: AI Revenue Recovery

An agent that detects a failed UPI Autopay / e-mandate debit, diagnoses
*why* it failed, decides a bounded recovery action, executes it, and logs
every step to an audit trail — respecting NPCI's real retry constraints
instead of retrying blindly.

## Why these specific rules

- **4 attempts max per cycle** (1 original + 3 retries): NPCI's Aug 2025
  autopay retry rule.
- **24h / 72h / 168h retry spacing**: recommended spaced-retry pattern so
  retries don't fire back-to-back (which reads as spam and works against
  NPCI's intent).
- **₹15,000 PIN re-auth threshold**: debits above this amount require a
  fresh UPI PIN per cycle — a failure here is an auth gap, not a funds
  issue, so the agent sends a reminder instead of silently retrying.
- **3-day grace period** after attempts are exhausted, before the cycle is
  closed for good — proactive grace-period messaging is shown to recover
  a meaningful share of otherwise-lost cycles.

See `src/core/rules.ts` for where these are encoded as hard constraints.

## Project layout

```
src/
  types/mandate.ts     — core domain types (MandateRecord, CycleState, ...)
  core/rules.ts         — NPCI-derived constants (the domain-accuracy layer)
  core/diagnose.ts      — failure classification
  core/decide.ts        — bounded decision logic (the "agent" reasoning)
  core/execute.ts       — simulated action execution (retry/notify/escalate)
  core/sequencer.ts     — orchestrates one cycle end-to-end + batch summary
  audit/auditLog.ts     — append-only audit trail
  data/generateDataset.ts — synthetic batch generator (WIP — next step)
  index.ts               — smoke-test entry point
```

## Run it

```bash
npm install
npm run dev            # runs the 3-mandate smoke test
npm run generate-data  # regenerates src/data/dataset.json (60 records, seeded/reproducible)
npm run run-batch      # runs the full dataset through the sequencer, writes output/*.json
```

## Dataset

`src/data/generateDataset.ts` produces a seeded, reproducible batch of 60
mandate-failure records:
- Failure-reason mix weighted to reflect real-world frequency (insufficient
  funds most common, then bank/technical errors, limit breaches, revocations,
  and a small unknown-cause tail).
- Amounts deliberately straddle the ₹15,000 PIN re-auth threshold (~70%
  below, ~30% above) so the PIN_REAUTH_REQUIRED reclassification branch in
  `diagnose.ts` actually gets exercised, not left dead code.

## Latest measured batch result

```
Total cycles processed:     60
Recovered:                  45 (75%)
Escalated to human:         7
Awaiting user action:       8
Failed terminal:            0
At-risk amount (₹):         7,94,265
Recovered amount (₹):       5,53,478
```

Full per-cycle results and the complete audit trail are written to
`output/cycle_results.json` and `output/audit_trail.json` on every run —
nothing here is cherry-picked.

## How retry success is modeled

Retries fire at real simulated offsets (24h / 72h / 168h after the previous
failure, per `RETRY_SPACING_HOURS`), and success probability depends on how
much time has actually elapsed at that point — not a flat per-reason coin
flip repeated at every attempt. Each curve in
`runBatch.ts::successProbability` is grounded in a stated real-world reason:
insufficient-funds recovery climbs over the week (pay cycles / manual
top-ups), bank-technical errors resolve quickly or not at all, limit
breaches jump once a plausible reset window has passed, and unknown-cause
failures are held flat and low since the diagnosis gives no basis to expect
otherwise. This is what makes the recovery-rate number defensible if asked
"why would retry #3 succeed more often than retry #1?" — see
`src/core/sequencer.ts` for how simulated time is threaded through the loop.

## Tests

```bash
npm test
```

16 tests, zero dependencies (uses Node's built-in `assert`, no jest/mocha).
Covers the parts that matter most for "bounded and gated":
- `decide.ts` never schedules a retry past `MAX_ATTEMPTS_PER_CYCLE`
- a revoked mandate is *always* escalated to a human, never auto-retried,
  regardless of attempt count
- retries are always spaced per `RETRY_SPACING_HOURS`, never back-to-back
- `diagnose.ts`'s amount-based PIN re-auth reclassification fires exactly
  at the `₹15,000` boundary and nowhere else
- `runCycle` never exceeds the attempt cap even under an adversarial
  simulator that always fails

Writing these caught a real bug: `decide.ts` checked the attempt-budget
cap before checking for a revoked mandate, so a revoked mandate that
happened to have accumulated 4 attempts got a retry-oriented "grace
period" message instead of being escalated to a human. Fixed by
reordering the checks — see `src/core/decide.ts`.

## Baseline comparison

```bash
npm run compare-baseline
```

Runs the identical 60-mandate dataset through two approaches side by side:

- **Naive baseline**: blind immediate retries, no diagnosis, no spacing —
  what most first-pass retry logic actually looks like. Still respects the
  NPCI 4-attempt cap (ignoring that would be a compliance issue, not just
  "naive"), but treats every failure reason the same way and fires all
  retries back-to-back.
- **Smart sequencer**: the real pipeline — diagnosis, bounded/gated
  decisions, and the 24h/72h/168h spacing.

Both use the exact same underlying success-probability curves
(`src/core/successModel.ts`) — the only difference is diagnosis-based
routing and whether elapsed time is given a chance to matter. That keeps
the comparison honest: any gap is attributable to the agent's logic, not
a different outcome model.

**Latest result:**
```
                          Naive baseline   Smart sequencer
Recovery rate:            40%              75%
Recovered amount (₹):     3,56,249         5,53,478

Uplift: +35 percentage points, +₹1,97,229 recovered
```

## Audit trail CLI

```bash
npm run audit -- --list                       # all mandate IDs in the batch
npm run audit -- MID-0012                      # full decision history for one mandate
npm run audit -- --action ESCALATE_TO_HUMAN    # filter by action
npm run audit -- --reason MANDATE_REVOKED      # filter by reason code
```

Useful for live Q&A during a demo — look up any specific case in seconds
instead of scrolling through raw JSON.

## Status

- [x] Domain types
- [x] NPCI-derived rule constants
- [x] Diagnosis step
- [x] Decision step (bounded, capped, auditable)
- [x] Simulated executor
- [x] Audit trail
- [x] End-to-end wiring verified on a smoke test
- [x] Synthetic dataset (60 records, seeded/reproducible)
- [x] Batch run + measured recovery-rate report
- [x] Time-aware retry outcome modeling
- [x] Unit tests (16, zero-dependency harness)
- [x] Baseline comparison (naive blind retry vs diagnosis+spacing)
- [x] Audit trail query CLI
- [ ] CI (GitHub Actions) — parked for later
- [ ] Write-up / demo polish — **next step**
