import * as assert from "assert";
import { test } from "../../testing/testHarness";
import { makeCycleWithAttempts } from "../../testing/fixtures";
import { diagnose } from "../diagnose";
import { PIN_REAUTH_THRESHOLD_INR } from "../rules";

test("diagnose: reclassifies BANK_TECHNICAL_ERROR to PIN_REAUTH_REQUIRED above the threshold", () => {
  const cycle = makeCycleWithAttempts(1, "BANK_TECHNICAL_ERROR", {
    amountInr: PIN_REAUTH_THRESHOLD_INR + 5000,
  });
  const latest = cycle.attempts[0];
  const diagnosis = diagnose(cycle, latest);
  assert.strictEqual(diagnosis, "PIN_REAUTH_REQUIRED");
});

test("diagnose: leaves BANK_TECHNICAL_ERROR unchanged at or below the threshold", () => {
  const atThreshold = makeCycleWithAttempts(1, "BANK_TECHNICAL_ERROR", {
    amountInr: PIN_REAUTH_THRESHOLD_INR,
  });
  assert.strictEqual(diagnose(atThreshold, atThreshold.attempts[0]), "BANK_TECHNICAL_ERROR");

  const belowThreshold = makeCycleWithAttempts(1, "BANK_TECHNICAL_ERROR", {
    amountInr: PIN_REAUTH_THRESHOLD_INR - 5000,
  });
  assert.strictEqual(diagnose(belowThreshold, belowThreshold.attempts[0]), "BANK_TECHNICAL_ERROR");
});

test("diagnose: INSUFFICIENT_FUNDS is not reclassified by amount, even above the threshold", () => {
  const cycle = makeCycleWithAttempts(1, "INSUFFICIENT_FUNDS", {
    amountInr: PIN_REAUTH_THRESHOLD_INR + 20000,
  });
  const diagnosis = diagnose(cycle, cycle.attempts[0]);
  assert.strictEqual(
    diagnosis,
    "INSUFFICIENT_FUNDS",
    "only BANK_TECHNICAL_ERROR should be eligible for PIN re-auth reclassification",
  );
});

test("diagnose: throws if called on a succeeded attempt (defensive contract)", () => {
  const cycle = makeCycleWithAttempts(1, "INSUFFICIENT_FUNDS");
  const succeededAttempt = { ...cycle.attempts[0], succeeded: true, failureReason: undefined };
  assert.throws(() => diagnose(cycle, succeededAttempt));
});
