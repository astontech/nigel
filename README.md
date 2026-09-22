# interview-rehearsal-backend

CDK stack (TypeScript, `aston-dev` account, `us-east-2`) behind
[interview-shell](https://github.com/astontech/interview-shell): artifact store, one
fixed evaluator, and the readiness dashboard.

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
- **Evaluator Lambda**: reads a drill's transcript, talk track, and drill log; asks
  Claude (`claude-sonnet-5`, temperature 0) to read each probe category strong or weak
  against the fixed rubric in `lambda/evaluator/rubric.ts`, which mirrors the skill's
  probe bank; stores the JSON and a summary on the session. Build sessions get only a
  slot count. An hourly **sweep** ends and evaluates sessions left open more than
  thirty minutes (closed windows).

## Operate

```bash
npm install
npm run deploy                                     # cdk deploy, profile aston-dev
npm run token -- --name "Jane Doe"                 # engineer token, printed once
npm run token -- --name "Taylor Thurman" --manager # manager token (dashboard)
```

The evaluator needs an Anthropic API key, stored once:

```bash
aws secretsmanager put-secret-value --profile aston-dev --region us-east-2 \
  --secret-id interview-rehearsal/anthropic-api-key --secret-string 'sk-ant-...'
```

Until it's set, drills are recorded but stay `ended`; the sweep evaluates them once the
key exists. Dashboard: `<ApiUrl>/dashboard?token=<manager token>` (the URL is in
`cdk-outputs.json` after a deploy).

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
- **One evaluator, one rubric, temperature 0.** So every engineer is read the same
  way. Reads are still a model's judgment: use them as prompts for a conversation, not
  as scores. The number that carries across sessions is open slots.
- **Records on every turn.** The shell posts the full transcript after each turn and
  each artifact on every write, so a closed window loses nothing.

## Deleting an engineer's data

Remove their `ENGINEER#` and `TOKEN#` items from the table and the
`sessions/<engineerId>/` prefix from the bucket (versioned: delete all versions).
