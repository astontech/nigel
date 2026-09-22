import type { DashboardRow } from "./handler.js";
import type { Session } from "../shared/db.js";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const day = (iso?: string) => iso ? iso.slice(0, 10) : "";

export function dashboardHtml(data: { generatedAt: string; rows: DashboardRow[] }, token: string): string {
  const rows = data.rows.map(r => {
    const drills = r.sessions.filter(s => s.mode === "drill");
    const builds = r.sessions.filter(s => s.mode === "build");
    const last = r.sessions.at(-1);
    const slotSeries = r.sessions.map(s => s.evaluation?.openSlots ?? s.openSlots).filter((n): n is number => typeof n === "number");
    const latestEval = [...drills].reverse().find(s => s.evaluation)?.evaluation;
    const cats = latestEval?.categories ? Object.entries(latestEval.categories).map(([k, v]) => `<span class="pill ${v}">${esc(k)}</span>`).join(" ") : '<span class="muted">no evaluated drill yet</span>';
    return `<tr>
      <td class="name">${esc(r.engineer.name)}</td>
      <td class="num">${drills.length}</td>
      <td class="num">${builds.length}</td>
      <td>${esc(day(last?.lastActivityAt))}${last && last.status === "open" ? ' <span class="pill open">open</span>' : ""}</td>
      <td class="num">${slotSeries.length ? `${slotSeries.at(-1)} <span class="muted">(${slotSeries.join(" → ")})</span>` : '<span class="muted">—</span>'}</td>
      <td>${latestEval ? `${latestEval.threadsHeld ?? 0} held · ${latestEval.threadsRanOut ?? 0} ran out` : '<span class="muted">—</span>'}</td>
      <td>${cats}</td>
      <td>${sessionsList(r.engineer.engineerId, r.sessions, token)}</td>
    </tr>`;
  }).join("\n");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Interview readiness</title>
<style>
:root{--bg:#F3F5F6;--fg:#1A222B;--muted:#5F6C78;--line:#D6DDE2;--surface:#fff;--strong:#1F6F4A;--weak:#8A2E2E;--mixed:#A86A1C;--open:#245C8A}
@media(prefers-color-scheme:dark){:root{--bg:#12181E;--fg:#E6EBEF;--muted:#97A3AE;--line:#2C3741;--surface:#1B232B;--strong:#6FCF97;--weak:#E08A8A;--mixed:#E0A95B;--open:#7FB3E0}}
body{margin:0;padding:24px 16px;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,sans-serif}
h1{font-size:22px;margin:0 0 4px}.sub{color:var(--muted);font-size:13px;margin:0 0 18px}
.wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;background:var(--surface);font-variant-numeric:tabular-nums}
th,td{padding:10px 12px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top;font-size:14px}
th{font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:500}
td.num{text-align:right}td.name{font-weight:600;white-space:nowrap}.muted{color:var(--muted)}
.pill{display:inline-block;padding:1px 8px;border-radius:10px;font-size:12px;border:1px solid currentColor;margin:1px 2px 1px 0}
.pill.strong{color:var(--strong)}.pill.weak{color:var(--weak)}.pill.mixed{color:var(--mixed)}.pill.open{color:var(--open)}
details{font-size:13px}summary{cursor:pointer;color:var(--muted)}details ul{margin:6px 0 0;padding-left:16px}
p.legend{color:var(--muted);font-size:13px;max-width:70ch}
</style></head><body>
<h1>Interview readiness</h1>
<p class="sub">Generated ${esc(data.generatedAt)} · ${data.rows.length} engineer${data.rows.length === 1 ? "" : "s"}</p>
<div class="wrap"><table>
<thead><tr><th>Engineer</th><th>Drills</th><th>Builds</th><th>Last activity</th><th>Open slots</th><th>Threads, latest drill</th><th>Category reads, latest drill</th><th>Sessions</th></tr></thead>
<tbody>${rows || '<tr><td colspan="8" class="muted">No engineers yet. Issue a token with <code>npm run token -- --name "Name"</code>.</td></tr>'}</tbody>
</table></div>
<p class="legend">Open slots are fact-sheet rows still unfilled; the series in brackets is per session, oldest first, and should fall. Reads are the evaluator's judgment of the latest drill against the probe bank: strong, weak, or mixed. Raw transcripts and talk tracks are the engineer's; this page shows only the derived record.</p>
</body></html>`;
}

function sessionsList(engineerId: string, sessions: Session[], token: string): string {
  if (!sessions.length) return '<span class="muted">—</span>';
  const items = [...sessions].reverse().slice(0, 8).map(s =>
    `<li>${esc(day(s.startedAt))} · ${esc(s.mode)} · ${esc(s.status)}${s.evaluation?.overall ? ` · ${esc(s.evaluation.overall)}` : ""}${s.status === "evaluated" ? ` · <a href="/engineers/${esc(engineerId)}/evaluations/${esc(s.sessionId)}?token=${encodeURIComponent(token)}">evaluation</a>` : ""}</li>`).join("");
  return `<details><summary>${sessions.length} session${sessions.length === 1 ? "" : "s"}</summary><ul>${items}</ul></details>`;
}
