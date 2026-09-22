# N.I.G.E.L. — Never Impressed, Generally Evenhanded Listener

NIGEL is the interviewer Aston engineers rehearse against: a local shell around Claude Code. It starts your own `claude`
with the `interview-rehearsal` skill loaded, opens a browser tab, lets you answer by
voice, and records the session to Aston's readiness backend as you go.

The interviewer is Claude Code running under **your** login. The shell adds a UI, a
microphone, and the recording. Nothing about the model or the skill is different from
running the skill in a terminal.

## Before you start

1. **Claude Code installed and signed in.** Run `claude` once in a terminal and sign in
   with your Claude subscription.
2. **Node 20 or newer.** `node --version` to check.
3. **A token from your manager.** It identifies you to the backend. You paste it once.
4. **Chrome or Edge** for voice. Typing works in any browser.

## Run

```bash
npx github:astontech/nigel --token <your token>   # first time: saves the token
npx github:astontech/nigel                        # every time after
```

A tab opens. The skill decides the mode from what it finds in the session folder:

- **Build** — first time, or when you want a fresh talk track. Paste your notes or
  resume, answer three short batches of questions ("don't know" is a fine answer), and
  it writes `talk-track.md`: your spoken opening, the project in three depths, the fact
  sheet an interviewer actually digs for, three stories, the probes to expect, and a
  list of what to go find out.
- **Drill** — when a talk track exists. The skill plays a client interviewer: one
  question at a time, no coaching, pulling a thread until it runs out, then a debrief.

To drill from a talk track you built earlier, copy its `talk-track.md` into the new
session folder the shell prints at start, or paste it as your first message.

**Answering by voice:** press *Speak*, talk, watch the transcript fill the box, press
*Send* (or Enter). The timer under the box shows how long you've been answering; it
turns amber past ninety seconds, which is the point most answers should have stopped.

**Ending:** press *End session*. Closing the tab also works; the shell keeps running
until you Ctrl-C it, and everything was already recorded as it happened.

## What is recorded, and who sees it

Every turn of the conversation and every write of `talk-track.md` or `drill-log.md`
goes to DORIS, the backend in `backend/`, as it happens, under your token. When a drill
ends, DORIS grades it with a fresh headless Claude Code session on an Aston seat, one
fixed rubric for everyone, and keeps the result.

- **You own the raw material** — the talk track and the transcripts. Only you and the
  evaluator read them. They're kept while you're in the program and deleted on request
  or when you leave.
- **Aston owns the derived record** — open-slot counts, which threads held, category
  reads, the evaluator's summary. That's what your manager's dashboard shows.

`--no-record` runs the shell with nothing sent anywhere, for trying it out.

## Flags

```
--token <t>     save your token
--no-record     don't send anything to the backend
--no-open       don't open the browser (prints the URL)
--port <n>      fixed local port
--api <url>     backend override (defaults to Aston's)
```

Sessions live in `~/.interview-shell/sessions/<timestamp>/`. The token is in
`~/.config/interview-shell/config.json`.

## Layout

One repo, one system, two components on different machines:

- **NIGEL** — the shell, at the root, runs on the engineer's machine (`bin/`, `src/`, `ui/`).
- **DORIS** — `backend/`, the CDK stack on Aston AWS: artifact store, evaluator,
  readiness dashboard. Its own README covers deploying, tokens, and the seat token.
- `plugin/` — the `interview-rehearsal` skill both use, copied from
  [astontech/claude-plugins](https://github.com/astontech/claude-plugins).

Codenames follow the Lab's system-naming convention (Stark-style: a first name, an
understated sentence that is true about the system's stance). They are labels only:
the package is still `@astontech/interview-shell`, the skill is still
`interview-rehearsal`, and no identifier inside the code carries a codename.

## Development

`plugin/` is a copy of the `interview-rehearsal` skill from
[astontech/claude-plugins](https://github.com/astontech/claude-plugins); `npm run
sync-plugin` refreshes it from a sibling checkout. The shell is plain Node with one
dependency (`open`); the UI is a single HTML file served locally; Claude Code is driven
through `--print --input-format stream-json --output-format stream-json`.
