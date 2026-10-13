# D.O.R.I.S. — Discreetly Observes Rehearsals, Informs Sparingly

DORIS is the backend half of [NIGEL](../README.md): a CDK stack (TypeScript,
`aston-dev` account, `us-east-2`) holding the artifact store, one fixed evaluator, and
the readiness dashboard. It reads every drill in full and shows the manager only the
derived record, which is what the name says.

## What it is

- **HTTP API** (API Gateway v2 → one Lambda). Bearer tokens, one per engineer, one per
  manager. Routes:
  - `POST /sessions` → `{sessionId}`
  - `PUT /sessions/{id}/artifacts/{talk-track.md|drill-log.md|transcript.jsonl}` — full
    content each time; the shell calls this on every turn and file write
  - `POST /sessions/{id}/end` — marks ended, invokes the evaluator asynchronously
  - `GET /me` — the engineer's own sessions and evaluation summaries
  - `GET /dashboard` (manager) — HTML; `GET /dashboard/data` — JSON;
    `GET /engineers/{id}/evaluations/{sessionId}` — the full evaluation
- **DynamoDB** `interview-rehearsal`: engineers, token hashes, sessions with their
  evaluation summary. **S3**: raw artifacts, transcripts, and `evaluation.json` per
  session, versioned, private.
- **Evaluator** (`evaluator/`): a Fargate task that runs a headless **Claude Code**
  session on an Aston seat. It reads a drill's transcript, talk track, and drill log,
  gives Claude the fixed rubric in `evaluator/rubric.ts` (which mirrors the skill's
  probe bank) as its whole system prompt with tools disabled, and stores the JSON plus a
  summary on the session. Build sessions get only a slot count. The API launches one
  task per `/end`; an hourly **sweep** task ends sessions idle more than thirty minutes
  (closed windows) and grades everything ended but ungraded. Public subnets, no NAT, so
  the only cost is task minutes: cents a month.

## Operate

```bash
cd backend
npm install
npm run deploy                                     # cdk deploy, profile aston-dev
npm run token -- --name "Jane Doe"                 # engineer token, printed once
npm run token -- --name "Taylor Thurman" --manager # manager token (dashboard)
```

The evaluator signs in as an Aston Claude seat with a long-lived token. Once, on a
machine where that seat is signed in:

```bash
claude setup-token          # browser flow; prints a token
aws secretsmanager put-secret-value --profile aston-dev --region us-east-2 \
  --secret-id interview-rehearsal/claude-token --secret-string '<token>'
```

Until it's set, drills are recorded but stay `ended`; the sweep grades them once the
token exists. Grading uses the seat's allowance, not an API bill. Dashboard:
`<ApiUrl>/dashboard?token=<manager token>` (the URL is in `cdk-outputs.json` after a
deploy). Grading logs: CloudWatch, log group prefixed `doris`.

## Decisions

- **Serverless, not a server.** A dozen engineers and a few drills each is within the
  free tier everywhere; the evaluator's Claude calls are the only real cost, cents per
  drill.
- **Tokens, not SSO.** Issued by the manager, revocable per person, one paste in the
  shell. SSO can replace this later without touching the shell.
- **Data ownership.** The engineer owns the raw material (talk track, transcripts):
  only they and the evaluator read it; it's kept while they're in the program and
  deleted on request or when they leave. Aston owns the derived record (slot counts,
  reads, summaries), which is all the dashboard shows. Raw artifacts also describe
  client systems, so they stay on Aston infrastructure under normal client
  confidentiality handling.
- **One evaluator, one rubric, a fresh session each time.** So every engineer is read
  the same way, and the interviewer's session never colors the grade. Reads are still a
  model's judgment: use them as prompts for a conversation, not as scores. The number
  that carries across sessions is open slots.
- **Headless Claude Code on an Aston seat, not an API key.** Same mechanism as running
  the skill on a laptop, signed in as a company seat; no separate vendor account or
  per-call bill. Grading counts against that seat's allowance, so the seat should be one
  Aston is happy to have the service tied to.
- **Records on every turn.** The shell posts the full transcript after each turn and
  each artifact on every write, so a closed window loses nothing.

## Evaluator regression cases

The rubric in `evaluator/rubric.ts` is the one thing every engineer is measured by, so
any edit to it, or a model change, should show its effect on known transcripts before it
reaches the dashboard. `evaluator/fixtures/` holds one synthetic talk track and four
drill transcripts (one that holds, one that runs out at the depth chain, one that
contradicts the talk track, one that barely starts). Each case is a folder with
`transcript.jsonl` and `expect.json`.

```bash
cd backend
npm install
npm run evaluator:eval                 # all cases
npm run evaluator:eval -- holds        # one case
MODEL=opus npm run evaluator:eval      # try another model
```

The runner grades each case with the same `claude -p` call the Fargate task uses
(`evaluator/grade.ts`), then asserts the JSON shape and the coarse reads in
`expect.json`: allowed `readiness` values, whether a thread ran out (`ranOutAt`
present or null), which categories read strong or weak, whether contradictions are
listed, and the open-slot count. It never asserts on evidence wording. It prints
PASS/FAIL per case and exits nonzero on any FAIL; each case's full grade is written to
`evaluator/eval-output/<case>.json` (git-ignored).

It runs under whatever Claude seat is signed in on the machine (`claude setup-token` or
an interactive login), never an API key; it refuses to start if `ANTHROPIC_API_KEY` is
set. A run is four model calls, about a minute. The model's reads are judgment, so a
rare case can flip on one run: re-run before treating a single FAIL as a regression, and
loosen an `expect.json` only when the rubric's intent, not its wording, allows both
reads. `npm test` covers the assertion logic offline.

## Deleting an engineer's data

Remove their `ENGINEER#` and `TOKEN#` items from the table and the
`sessions/<engineerId>/` prefix from the bucket (versioned: delete all versions).
