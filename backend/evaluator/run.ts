// DORIS evaluator: grades ended drill sessions with a headless Claude Code session on an Aston seat.
// Runs as a Fargate task. Env: TABLE, BUCKET, TOKEN_SECRET; and either ENGINEER_ID+SESSION_ID (one
// session, launched by the API on /end) or SWEEP=1 (every ended-but-ungraded session, hourly).
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { updateSession, endedUnevaluated, openSessions, now } from "../lambda/shared/db.js";
import { evaluate } from "./evaluate.js";

const sm = new SecretsManagerClient({});
const IDLE_MINUTES = 30;

async function main() {
  const token = (await sm.send(new GetSecretValueCommand({ SecretId: process.env.TOKEN_SECRET }))).SecretString;
  if (!token || token === "UNSET") { console.error("Claude token secret is UNSET; nothing graded. Run `claude setup-token` on the Aston seat and store it."); process.exit(3); }
  process.env.CLAUDE_CODE_OAUTH_TOKEN = token;

  let targets: { engineerId: string; sessionId: string }[] = [];
  if (process.env.SWEEP) {
    const cutoff = Date.now() - IDLE_MINUTES * 60_000;
    for (const s of (await openSessions()).filter(s => Date.parse(s.lastActivityAt) < cutoff)) {
      await updateSession(s.engineerId, s.sessionId, { status: "ended", endedAt: now() });
    }
    targets = (await endedUnevaluated()).map(s => ({ engineerId: s.engineerId, sessionId: s.sessionId }));
  } else if (process.env.ENGINEER_ID && process.env.SESSION_ID) {
    targets = [{ engineerId: process.env.ENGINEER_ID, sessionId: process.env.SESSION_ID }];
  }
  console.log(`grading ${targets.length} session(s)`);
  let failed = 0;
  for (const t of targets) {
    try { console.log(t.sessionId, JSON.stringify(await evaluate(t.engineerId, t.sessionId))); }
    catch (e) { failed++; console.error(t.sessionId, e); }
  }
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
