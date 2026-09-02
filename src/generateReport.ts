import * as fs from "fs";
import * as path from "path";

/**
 * Builds a single self-contained HTML report from the three output JSON
 * files (batch_summary, cycle_results, audit_trail). No external JS/CSS
 * dependencies and no fetch() calls — all data is embedded inline at
 * generation time, so the file opens correctly straight from disk
 * (double-click, no local server needed) and works offline for a demo.
 */

interface BatchSummary {
  totalCycles: number;
  recovered: number;
  escalated: number;
  awaitingUser: number;
  failedTerminal: number;
  recoveredAmountInr: number;
  atRiskAmountInr: number;
  recoveryRatePct: number;
}

interface CycleResult {
  mandateId: string;
  amountInr: number;
  status: string;
  attempts: number;
}

interface AuditEntry {
  timestamp: string;
  mandateId: string;
  attemptNumber: number;
  diagnosis: string;
  decision: { action: string; reasonCode: string; explanation: string };
  outcomeNote: string;
}

function loadJSON<T>(filePath: string): T {
  if (!fs.existsSync(filePath)) {
    console.error(`Missing ${filePath}. Run "npm run run-batch" first.`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function inr(n: number): string {
  return "\u20B9" + n.toLocaleString("en-IN");
}

const STATUS_COLORS: Record<string, string> = {
  RECOVERED: "#5fbf8f",
  ESCALATED: "#e0a458",
  AWAITING_USER: "#e0c458",
  FAILED_TERMINAL: "#e07a5f",
};

function buildStatusChart(summary: BatchSummary): string {
  const bars = [
    { label: "Recovered", value: summary.recovered, color: STATUS_COLORS.RECOVERED },
    { label: "Escalated", value: summary.escalated, color: STATUS_COLORS.ESCALATED },
    { label: "Awaiting user", value: summary.awaitingUser, color: STATUS_COLORS.AWAITING_USER },
    { label: "Failed terminal", value: summary.failedTerminal, color: STATUS_COLORS.FAILED_TERMINAL },
  ];
  const max = Math.max(...bars.map((b) => b.value), 1);
  const barHeight = 28;
  const gap = 14;
  const chartWidth = 420;
  const labelWidth = 120;

  const rows = bars
    .map((b, i) => {
      const y = i * (barHeight + gap);
      const w = Math.round((b.value / max) * (chartWidth - labelWidth - 40));
      return `
        <text x="0" y="${y + barHeight / 2 + 5}" fill="#cfc9bd" font-size="13" font-family="ui-monospace,monospace">${b.label}</text>
        <rect x="${labelWidth}" y="${y}" width="${w}" height="${barHeight}" rx="4" fill="${b.color}"></rect>
        <text x="${labelWidth + w + 10}" y="${y + barHeight / 2 + 5}" fill="#f2ede2" font-size="13" font-family="ui-monospace,monospace">${b.value}</text>
      `;
    })
    .join("");

  const totalHeight = bars.length * (barHeight + gap);
  return `<svg viewBox="0 0 ${chartWidth} ${totalHeight}" width="100%" height="${totalHeight}">${rows}</svg>`;
}

function buildAuditRows(audit: AuditEntry[]): string {
  return audit
    .map(
      (e) => `
      <tr data-action="${e.decision.action}" data-mandate="${e.mandateId}">
        <td>${e.mandateId}</td>
        <td>${e.attemptNumber}</td>
        <td>${e.diagnosis}</td>
        <td><span class="pill pill-${e.decision.action}">${e.decision.action}</span></td>
        <td class="explanation">${e.decision.explanation}</td>
        <td>${e.outcomeNote}</td>
      </tr>`,
    )
    .join("");
}

function buildCycleRows(cycles: CycleResult[]): string {
  return cycles
    .map(
      (c) => `
      <tr data-status="${c.status}">
        <td>${c.mandateId}</td>
        <td>${inr(c.amountInr)}</td>
        <td><span class="pill pill-${c.status}">${c.status}</span></td>
        <td>${c.attempts}</td>
      </tr>`,
    )
    .join("");
}

function main() {
  const outDir = path.join(__dirname, "..", "output");
  const summary = loadJSON<BatchSummary>(path.join(outDir, "batch_summary.json"));
  const cycles = loadJSON<CycleResult[]>(path.join(outDir, "cycle_results.json"));
  const audit = loadJSON<AuditEntry[]>(path.join(outDir, "audit_trail.json"));

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Mandate Retry Sequencer — Batch Report</title>
<style>
  :root {
    --bg: #17140f;
    --panel: #211d16;
    --border: #3a3327;
    --text: #f2ede2;
    --muted: #9c9384;
    --accent: #e0a458;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    padding: 40px 24px 80px;
  }
  .wrap { max-width: 980px; margin: 0 auto; }
  .eyebrow { color: var(--accent); font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; font-weight: 600; }
  h1 { font-size: 32px; margin: 6px 0 6px; }
  .subtitle { color: var(--muted); margin-bottom: 32px; }
  .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 32px; }
  .card { background: var(--panel); border: 1px solid var(--border); border-radius: 10px; padding: 16px 18px; }
  .card .label { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 8px; }
  .card .value { font-size: 24px; font-weight: 600; }
  .card .value.good { color: var(--accent); }
  section { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 24px; margin-bottom: 24px; }
  section h2 { font-size: 16px; margin: 0 0 16px; color: var(--text); }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; color: var(--muted); font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; padding: 8px 10px; border-bottom: 1px solid var(--border); }
  td { padding: 9px 10px; border-bottom: 1px solid #2a251c; vertical-align: top; }
  tr:hover td { background: #241f16; }
  .explanation { color: var(--muted); max-width: 360px; }
  .pill { display: inline-block; padding: 3px 9px; border-radius: 999px; font-size: 11px; font-weight: 600; letter-spacing: 0.03em; }
  .pill-RECOVERED, .pill-SCHEDULE_RETRY { background: rgba(95,191,143,0.15); color: #5fbf8f; }
  .pill-ESCALATED, .pill-ESCALATE_TO_HUMAN { background: rgba(224,164,88,0.18); color: #e0a458; }
  .pill-AWAITING_USER, .pill-SEND_USER_REMINDER, .pill-SEND_GRACE_PERIOD_WARNING { background: rgba(224,196,88,0.18); color: #e0c458; }
  .pill-FAILED_TERMINAL { background: rgba(224,122,95,0.18); color: #e07a5f; }
  .filters { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
  .filters button {
    background: transparent; border: 1px solid var(--border); color: var(--muted);
    padding: 6px 12px; border-radius: 999px; font-size: 12px; cursor: pointer;
  }
  .filters button.active { border-color: var(--accent); color: var(--accent); }
  .rules-note { color: var(--muted); font-size: 12px; margin-top: 8px; }
  footer { color: var(--muted); font-size: 12px; text-align: center; margin-top: 40px; }
</style>
</head>
<body>
<div class="wrap">
  <div class="eyebrow">Track 03 — AI Revenue Recovery</div>
  <h1>Mandate Retry Sequencer</h1>
  <div class="subtitle">Batch report — ${summary.totalCycles} synthetic mandate cycles, seeded &amp; reproducible</div>

  <div class="cards">
    <div class="card">
      <div class="label">Recovery rate</div>
      <div class="value good">${summary.recoveryRatePct}%</div>
    </div>
    <div class="card">
      <div class="label">Recovered amount</div>
      <div class="value">${inr(summary.recoveredAmountInr)}</div>
    </div>
    <div class="card">
      <div class="label">At-risk amount</div>
      <div class="value">${inr(summary.atRiskAmountInr)}</div>
    </div>
    <div class="card">
      <div class="label">Total cycles</div>
      <div class="value">${summary.totalCycles}</div>
    </div>
  </div>

  <section>
    <h2>Outcome breakdown</h2>
    ${buildStatusChart(summary)}
  </section>

  <section>
    <h2>Cycle results (${cycles.length})</h2>
    <div class="filters" id="cycleFilters">
      <button class="active" data-filter="ALL">All</button>
      <button data-filter="RECOVERED">Recovered</button>
      <button data-filter="ESCALATED">Escalated</button>
      <button data-filter="AWAITING_USER">Awaiting user</button>
      <button data-filter="FAILED_TERMINAL">Failed terminal</button>
    </div>
    <table id="cycleTable">
      <thead><tr><th>Mandate</th><th>Amount</th><th>Status</th><th>Attempts</th></tr></thead>
      <tbody>${buildCycleRows(cycles)}</tbody>
    </table>
  </section>

  <section>
    <h2>Audit trail (${audit.length} entries)</h2>
    <div class="filters" id="auditFilters">
      <button class="active" data-filter="ALL">All actions</button>
      <button data-filter="SCHEDULE_RETRY">Retry scheduled</button>
      <button data-filter="SEND_USER_REMINDER">User reminder</button>
      <button data-filter="ESCALATE_TO_HUMAN">Escalated</button>
      <button data-filter="SEND_GRACE_PERIOD_WARNING">Grace warning</button>
    </div>
    <table id="auditTable">
      <thead><tr><th>Mandate</th><th>Attempt</th><th>Diagnosis</th><th>Action</th><th>Explanation</th><th>Outcome</th></tr></thead>
      <tbody>${buildAuditRows(audit)}</tbody>
    </table>
    <div class="rules-note">Every row here is generated by the decision engine, not hand-written — this is the full record of what the agent did and why for every mandate in the batch.</div>
  </section>

  <footer>Generated locally by generateReport.ts — no external requests, all data embedded at generation time.</footer>
</div>

<script>
  function wireFilters(filterContainerId, tableId, dataAttr) {
    var container = document.getElementById(filterContainerId);
    var table = document.getElementById(tableId);
    if (!container || !table) return;
    var buttons = container.querySelectorAll("button");
    var rows = table.querySelectorAll("tbody tr");
    buttons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        buttons.forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
        var filter = btn.getAttribute("data-filter");
        rows.forEach(function (row) {
          var val = row.getAttribute(dataAttr);
          row.style.display = filter === "ALL" || val === filter ? "" : "none";
        });
      });
    });
  }
  wireFilters("cycleFilters", "cycleTable", "data-status");
  wireFilters("auditFilters", "auditTable", "data-action");
</script>
</body>
</html>`;

  const outPath = path.join(outDir, "report.html");
  fs.writeFileSync(outPath, html);
  console.log(`Wrote dashboard -> ${outPath}`);
  console.log("Open it directly in a browser (double-click, no server needed).");
}

main();
