import * as fs from "fs";
import * as path from "path";

interface AuditEntry {
  timestamp: string;
  mandateId: string;
  attemptNumber: number;
  diagnosis: string;
  decision: { action: string; reasonCode: string; explanation: string };
  outcomeNote: string;
}

/**
 * Query the audit trail from the terminal.
 *
 *   npm run audit -- MID-0031            look up a specific mandate
 *   npm run audit -- --action ESCALATE_TO_HUMAN     filter by action
 *   npm run audit -- --reason MANDATE_REVOKED        filter by reason code
 *   npm run audit -- --list                          list all mandate IDs seen
 *
 * Useful for a live demo: if a judge asks "why was this one escalated?",
 * you can answer from the terminal in seconds instead of scrolling JSON.
 */
function loadAuditTrail(): AuditEntry[] {
  const filePath = path.join(__dirname, "..", "output", "audit_trail.json");
  if (!fs.existsSync(filePath)) {
    console.error(`Missing ${filePath}. Run "npm run run-batch" first.`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function printEntry(e: AuditEntry): void {
  console.log(`\n${e.mandateId} — attempt #${e.attemptNumber} — ${e.timestamp}`);
  console.log(`  Diagnosis: ${e.diagnosis}`);
  console.log(`  Action:    ${e.decision.action} (${e.decision.reasonCode})`);
  console.log(`  Why:       ${e.decision.explanation}`);
  console.log(`  Outcome:   ${e.outcomeNote}`);
}

function main() {
  const args = process.argv.slice(2);
  const entries = loadAuditTrail();

  if (args.length === 0) {
    console.log("Usage:");
    console.log("  npm run audit -- <MANDATE_ID>              show full history for a mandate");
    console.log("  npm run audit -- --action <ACTION>          filter by action (e.g. ESCALATE_TO_HUMAN)");
    console.log("  npm run audit -- --reason <REASON_CODE>     filter by reason code (e.g. MANDATE_REVOKED)");
    console.log("  npm run audit -- --list                     list all mandate IDs in this batch");
    return;
  }

  if (args[0] === "--list") {
    const ids = Array.from(new Set(entries.map((e) => e.mandateId))).sort();
    console.log(`${ids.length} mandates in this batch:\n`);
    console.log(ids.join(", "));
    return;
  }

  if (args[0] === "--action" && args[1]) {
    const filtered = entries.filter((e) => e.decision.action === args[1]);
    if (filtered.length === 0) {
      console.log(`No audit entries found with action "${args[1]}".`);
      return;
    }
    console.log(`${filtered.length} entries with action "${args[1]}":`);
    filtered.forEach(printEntry);
    return;
  }

  if (args[0] === "--reason" && args[1]) {
    const filtered = entries.filter((e) => e.decision.reasonCode === args[1]);
    if (filtered.length === 0) {
      console.log(`No audit entries found with reason code "${args[1]}".`);
      return;
    }
    console.log(`${filtered.length} entries with reason code "${args[1]}":`);
    filtered.forEach(printEntry);
    return;
  }

  // Default: treat the argument as a mandate ID.
  const mandateId = args[0];
  const matches = entries.filter((e) => e.mandateId === mandateId);
  if (matches.length === 0) {
    console.log(`No audit entries found for mandate "${mandateId}". Try --list to see valid IDs.`);
    return;
  }
  console.log(`Full history for ${mandateId} (${matches.length} entries):`);
  matches.forEach(printEntry);
}

main();
