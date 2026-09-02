import { AttemptRecord, CycleState } from "../types/mandate";
import { Decision } from "./decide";
import type { OutcomeSimulator } from "./sequencer";

export interface ExecutionResult {
  cycle: CycleState;
  outcomeNote: string;
}

/**
 * Carries out a Decision against a CycleState.
 *
 * In this hackathon build, "execute" simulates the external call
 * (payment retry API, SMS/notification service) rather than making a
 * real one — but the structure is exactly where a real Razorpay retry
 * call or notification-service call would slot in, so the pipeline is
 * demo-real even though the last hop is mocked.
 *
 * `simulatedAttemptTime` is the logical point in time (after the
 * 24h/72h/168h spacing has elapsed) the retry fires at — passed straight
 * through to the outcome simulator so success probability can depend on
 * real elapsed time instead of firing every retry in the same instant.
 */
export function execute(
  cycle: CycleState,
  decision: Decision,
  simulateOutcome: OutcomeSimulator,
  simulatedAttemptTime: Date,
): ExecutionResult {
  switch (decision.action) {
    case "SCHEDULE_RETRY": {
      const attempt = simulateOutcome(cycle, simulatedAttemptTime);
      if (attempt) {
        cycle.attempts.push(attempt);
        cycle.nextEligibleRetryAt = decision.nextEligibleRetryAt;
        if (attempt.succeeded) {
          cycle.status = "RECOVERED";
          cycle.recoveredAmountInr = cycle.mandate.amountInr;
          return { cycle, outcomeNote: `Retry #${attempt.attemptNumber} succeeded — cycle recovered.` };
        }
        cycle.status = "IN_RETRY";
        return { cycle, outcomeNote: `Retry #${attempt.attemptNumber} failed (${attempt.failureReason}).` };
      }
      cycle.status = "IN_RETRY";
      return { cycle, outcomeNote: "Retry scheduled for a future time (outside this batch run)." };
    }

    case "SEND_USER_REMINDER": {
      cycle.status = "AWAITING_USER";
      return { cycle, outcomeNote: "User reminder sent (simulated) — awaiting user-side action." };
    }

    case "SEND_GRACE_PERIOD_WARNING": {
      cycle.status = "AWAITING_USER";
      return { cycle, outcomeNote: "Grace period warning sent (simulated) — cycle will close if no manual action." };
    }

    case "ESCALATE_TO_HUMAN": {
      cycle.status = "ESCALATED";
      return { cycle, outcomeNote: "Escalated to human support queue (simulated)." };
    }

    case "CLOSE_CYCLE": {
      cycle.status = "FAILED_TERMINAL";
      return { cycle, outcomeNote: "Cycle closed as terminally failed." };
    }

    default:
      return { cycle, outcomeNote: "No action taken." };
  }
}
