// Seed the adaptive-drilling demo (aston-dev only; all data synthetic, DEC-166):
//   npm run seed-demo                                        creates a demo engineer with a talk track and an L1 history, prints the token
//   npm run seed-demo -- --add-ready 2 --engineer <id>       adds graded drills that read ready to that demo engineer
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { computeLevel } from "../lambda/shared/level.js";

const STAGE = "aston-dev";
const REGION = "us-east-2";
const DEMO_PREFIX = "Demo ";

const args = process.argv.slice(2);
const flag = (name: string) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
const fail = (message: string, code = 2): never => { console.error(message); process.exit(code); };

// The stage guard runs before any AWS call, so a refusal writes nothing.
const stage = flag("--stage") ?? process.env.STAGE ?? STAGE;
if (stage !== STAGE) fail(`refusing to seed stage "${stage}": the demo seed runs against ${STAGE} only`, 1);
const profile = process.env.AWS_PROFILE ?? STAGE;
if (profile !== STAGE) fail(`refusing to seed with AWS profile "${profile}": the demo seed runs against ${STAGE} only`, 1);

const addReady = flag("--add-ready");
const engineerIdArg = flag("--engineer");
if (addReady !== undefined && (!/^[1-9]\d*$/.test(addReady) || !engineerIdArg)) fail("usage: npm run seed-demo -- --add-ready <count> --engineer <id>");
if (addReady === undefined && args.length) fail("usage: npm run seed-demo [-- --add-ready <count> --engineer <id>]");

const stackOutput = (key: string): string =>
  execFileSync("aws", ["cloudformation", "describe-stacks", "--stack-name", "InterviewRehearsal", "--profile", STAGE, "--region", REGION,
    "--query", `Stacks[0].Outputs[?OutputKey=='${key}'].OutputValue`, "--output", "text"], { encoding: "utf8" }).trim();

const TABLE = process.env.TABLE ?? "interview-rehearsal";
const BUCKET = process.env.BUCKET ?? stackOutput("BucketName");
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
const s3 = new S3Client({ region: REGION });

const put = (Item: Record<string, unknown>) => ddb.send(new PutCommand({ TableName: TABLE, Item }));
const artifact = (engineerId: string, sessionId: string, name: string, body: string) =>
  s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: `sessions/${engineerId}/${sessionId}/${name}`, Body: body, ContentType: name.endsWith(".json") ? "application/json" : "text/markdown" }));

const TALK_TRACK = `# Talk track — Northwind Claims Platform

Demo Engineer · Senior backend engineer · built 2026-10-07

The scripts are openers. The interviewer picks one line and pulls it ten minutes deep. Rehearse the fact sheet, not the script.

## Engagement 1 — Northwind Claims Platform (lead, full)

### Depth 1 — the one-liner
I moved an insurer's claims intake from a nightly batch to an event-driven pipeline.

### The fact sheet

| Fact | What to have ready |
|---|---|
| The system | Claims intake for a regional insurer; about forty thousand claims a month. |
| What was mine | The intake service and the retry policy for the downstream adjuster queue. |
| The hard decision | Queue-per-adjuster-team over one shared queue, because a slow team stalled everyone. |
| What broke | A poison message looped the adjuster queue; I added a dead-letter queue after two hours of backlog. |
| Who consumes it | Adjusters; ⟪what the adjusters do when a claim arrives late⟫ |

## Engagement 2 — Contoso Field Scheduling (light)

- **The system:** Technician scheduling for a utilities contractor.
- **What was mine:** The route-optimizer service.
- **A decision I can defend:** A greedy heuristic over a solver, because dispatchers needed an answer in under a second.
- **Technologies and how I used them:** Python for the optimizer, PostgreSQL for job state, Redis for the dispatch board.

## Before you rehearse

1. Go find out what adjusters do when a claim arrives late.
2. Run the drill against the Northwind claims intake.
`;

const evaluation = (overall: string, claim: string, ranOut: boolean) => ({
  readiness: overall,
  threads: [{ claim, categories: { decisions: { read: ranOut ? "weak" : "strong" }, failure: { read: ranOut ? "weak" : "strong" } }, ranOutAt: ranOut ? "what the retry policy did after the third failure" : null }],
  goFindOut: ranOut ? ["What the adjuster queue did after the third failed delivery"] : [],
});

/** Writes one graded drill session and its evaluation.json; `startedAt` is what orders the history. */
async function seedDrill(engineerId: string, startedAt: string, overall: string, claim: string, ranOut: boolean) {
  const sessionId = randomBytes(8).toString("hex");
  const openSlots = ranOut ? 1 : 0;
  await put({
    pk: `ENGINEER#${engineerId}`, sk: `SESSION#${sessionId}`, gsi: "SESSION", engineerId, sessionId, mode: "drill", project: "Northwind Claims Platform",
    startedAt, lastActivityAt: startedAt, endedAt: startedAt, status: "evaluated", turns: 12, openSlots,
    evaluation: { evaluatedAt: startedAt, model: "demo-seed", openSlots, threadsHeld: ranOut ? 0 : 1, threadsRanOut: ranOut ? 1 : 0, overall },
  });
  await artifact(engineerId, sessionId, "evaluation.json", JSON.stringify(evaluation(overall, claim, ranOut)));
  return sessionId;
}

if (addReady === undefined) {
  const engineerId = randomBytes(6).toString("hex");
  const token = randomBytes(32).toString("base64url");
  const createdAt = new Date().toISOString();
  const day = 86_400_000;
  await put({ pk: `ENGINEER#${engineerId}`, sk: "META", gsi: "ENGINEER", engineerId, name: `${DEMO_PREFIX}Engineer ${engineerId}`, role: "engineer", createdAt });
  await put({ pk: `TOKEN#${createHash("sha256").update(token).digest("hex")}`, sk: "META", engineerId, createdAt });

  const buildId = randomBytes(8).toString("hex");
  const builtAt = new Date(Date.now() - 3 * day).toISOString();
  await put({ pk: `ENGINEER#${engineerId}`, sk: `SESSION#${buildId}`, gsi: "SESSION", engineerId, sessionId: buildId, mode: "build", project: "Northwind Claims Platform",
    startedAt: builtAt, lastActivityAt: builtAt, endedAt: builtAt, status: "ended", turns: 20, openSlots: 1 });
  await artifact(engineerId, buildId, "talk-track.md", TALK_TRACK);

  // One graded drill, `close`, with one thread that ran out and one that held: the level stays L1.
  const drillAt = new Date(Date.now() - 2 * day).toISOString();
  const drillId = randomBytes(8).toString("hex");
  await put({
    pk: `ENGINEER#${engineerId}`, sk: `SESSION#${drillId}`, gsi: "SESSION", engineerId, sessionId: drillId, mode: "drill", project: "Northwind Claims Platform",
    startedAt: drillAt, lastActivityAt: drillAt, endedAt: drillAt, status: "evaluated", turns: 14, openSlots: 1,
    evaluation: { evaluatedAt: drillAt, model: "demo-seed", openSlots: 1, threadsHeld: 1, threadsRanOut: 1, overall: "close" },
  });
  await artifact(engineerId, drillId, "evaluation.json", JSON.stringify({
    readiness: "close",
    threads: [
      { claim: "Queue per adjuster team over one shared queue", categories: { decisions: { read: "strong" } }, ranOutAt: null },
      { claim: "Dead-letter queue after the poison message", categories: { failure: { read: "weak" } }, ranOutAt: "what the retry policy did after the third failure" },
    ],
    goFindOut: ["What the adjuster queue did after the third failed delivery"],
  }));

  console.log(`demo engineer ${engineerId} (${STAGE})\ntoken: ${token}\ntalk track: 2 engagements; history: 1 graded drill (close), 1 thread ran out, 1 held; level L1`);
} else {
  const engineerId = engineerIdArg!;
  const meta = (await ddb.send(new GetCommand({ TableName: TABLE, Key: { pk: `ENGINEER#${engineerId}`, sk: "META" } }))).Item;
  if (!meta) fail(`no engineer ${engineerId} in ${STAGE}`, 1);
  if (!String(meta!.name).startsWith(DEMO_PREFIX)) fail(`engineer ${engineerId} is not a demo engineer; refusing to add grades`, 1);
  const existing = (await ddb.send(new QueryCommand({ TableName: TABLE, KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
    ExpressionAttributeValues: { ":pk": `ENGINEER#${engineerId}`, ":sk": "SESSION#" } }))).Items ?? [];
  // New drills start after the newest session so they sort last in the history.
  let next = Math.max(Date.now(), ...existing.map(s => Date.parse(s.startedAt) + 1000));
  for (let i = 0; i < Number(addReady); i++, next += 1000) await seedDrill(engineerId, new Date(next).toISOString(), "ready", "Queue per adjuster team over one shared queue", false);
  const all = [...existing.filter(s => s.mode === "drill" && s.status === "evaluated" && s.evaluation?.overall)]
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt)).map(s => s.evaluation.overall as string);
  console.log(`added ${addReady} ready grade(s) to ${engineerId}; level ${computeLevel([...all, ...Array(Number(addReady)).fill("ready")])}`);
}
