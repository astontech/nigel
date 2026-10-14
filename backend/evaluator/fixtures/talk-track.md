# Talk track — Claims event pipeline

Sam Rivera (synthetic) · senior backend engineer, contract · built 2026-10-01

## The opening

I'm a backend engineer with eight years in Java and Kafka. I used Kafka at a payments company to move settlement events between services, and I've run Postgres in production for most of my career.

Right now I'm on a claims platform for a regional insurer. The change under way is moving nightly batch claim feeds to an event stream. I built the intake adapter and the dedupe store. That's the work I know best, so I'm happy to go as deep as you'd like.

## The project in three depths

### Depth 1 — the one-liner
A claims platform for a regional insurer, moving from nightly batch files to a Kafka event stream.

### Depth 2 — the system walk
About 40,000 claim events a day arrive from partner clinics. They used to land as one nightly file, so adjusters saw claims a day late. Adjusters consume the stream through a work-queue UI. ⟪why this was prioritized over other work⟫ Intake validates each event, the dedupe store drops repeats, and the router publishes to the adjuster topic. Payments and fraud scoring are outside the boundary.

### Depth 3 — what I owned
I own the intake adapter end to end. It validates the schema, then calls the dedupe store. I chose a Postgres table keyed on partner id plus claim id plus event version, with a unique index, over Redis, because a dedupe record must survive a restart and the table was already backed up. Redis would have been faster but lost keys on failover. A teammate argued for Redis; his best point was latency at peak, about 300 events a second. I measured the table at 4 ms p99 on that load, so latency was not a problem.

## The fact sheet

| Fact | What to have ready |
|---|---|
| What the system is for | Gets claims to adjusters the same day instead of the next morning. |
| Why it was prioritized | ⟪why this was prioritized over other work⟫ |
| Who the customer is | Adjusters, through the work-queue UI. |
| Team and your slice | Six engineers, two contract. I own intake and dedupe. |
| Exactly what you built | Intake adapter and dedupe store, alone. The router was a teammate's. |
| Scale | 40,000 events a day, peak about 300 a second. |
| Alternatives rejected | Redis for dedupe (lost keys on failover). Batch micro-files every 15 minutes (still late for adjusters). |
| How you validated it | Shadow period of two weeks: stream output compared with the nightly file, zero unexplained differences by day nine. |
| What broke | A partner resent a month of events with version 1 on every record. The unique index rejected them, which was correct, but the alert was a page and woke me twice. I changed it to a daily digest for known partners. |
| What you'd change | I would have added the partner replay allowlist before launch. |

## Before you rehearse

1. Find out why this work was prioritized over other work.
