# Talk track — Shipment-event pipeline

Sam Rivera · data engineer · built 2026-09-20

The scripts are openers. The interviewer picks one line and pulls it ten minutes deep. Rehearse the fact sheet, not the script.

## The opening  (45–60 s)

I'm a data engineer. I move event streams between systems, mostly with Kafka for replay and Python for the stages in between.

Right now I'm on a shipment-event pipeline that turns three carriers' tracking events into one status per parcel. I built the carrier B adapter and the dedupe stage. That's the work I know best, so I'm happy to go as deep as you'd like.

*Stop. Let them pick the depth.*

## The project in three depths

### Depth 1 — the one-liner  (15 s)

It turns three carriers' tracking events into one parcel status that customer service can trust.

### Depth 2 — the system walk  (2 min)

Customer service spent forty minutes a call because the feeds disagreed. About two million events a day arrive from eleven depots. Each carrier has an adapter, the dedupe stage removes repeats, and the status rules produce one status per parcel.

*Stop. They will usually ask "what did you work on?"*

### Depth 3 — what I owned  (4–5 min)

The carrier B adapter I wrote alone. The dedupe stage I also wrote alone; its key is carrier id, parcel id and event time. The status rules were shared with Priya. ⟪which rules were yours⟫

*Stop. This is where the probing starts.*

## The fact sheet

| Fact | What to have ready |
|---|---|
| What the system is for | One parcel status from three carrier feeds, for customer service. |
| Why it was prioritized | Forty-minute calls answered by hand. |
| Exactly what you built | Alone: carrier B adapter, dedupe stage. Shared: status rules. |
| What broke | ⟪what it looked like from outside, how you found it, how long it took⟫ |

## Three stories  (60–90 s each)

### Story A — proudest work
⟪which piece, and why⟫

### Story B — a production problem you fixed
⟪Situation / Task / Action / Result⟫

### Story C — a disagreement
⟪who pushed back, and their best argument⟫

## How they will probe

- Ownership: which parts of the status rules were yours?
- Decisions: why Kafka instead of SQS?

## Client round

⟪the five contract questions⟫

## Before you rehearse

1. Which status rules were yours.
2. What broke, how you found it, how long it took.

Get someone to run the depth chain against you, or run the drill.
