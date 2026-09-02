import { FailureReason } from "../types/mandate";
import { Decision } from "../core/decide";

export interface AuditEntry {
  timestamp: string;
  mandateId: string;
  attemptNumber: number;
  diagnosis: FailureReason;
  decision: {
    action: string;
    reasonCode: string;
    explanation: string;
  };
  outcomeNote: string;
}

/**
 * Append-only audit log. This is what makes every money-adjacent action
 * explainable after the fact — "the bar" for this track explicitly asks
 * for an audit trail, not just a final aggregate number.
 */
export class AuditLog {
  private entries: AuditEntry[] = [];

  record(params: {
    mandateId: string;
    attemptNumber: number;
    diagnosis: FailureReason;
    decision: Decision;
    outcomeNote: string;
  }): void {
    this.entries.push({
      timestamp: new Date().toISOString(),
      mandateId: params.mandateId,
      attemptNumber: params.attemptNumber,
      diagnosis: params.diagnosis,
      decision: {
        action: params.decision.action,
        reasonCode: params.decision.reasonCode,
        explanation: params.decision.explanation,
      },
      outcomeNote: params.outcomeNote,
    });
  }

  all(): AuditEntry[] {
    return this.entries;
  }

  forMandate(mandateId: string): AuditEntry[] {
    return this.entries.filter((e) => e.mandateId === mandateId);
  }

  toJSON(): string {
    return JSON.stringify(this.entries, null, 2);
  }
}
