# Talk track — Sam Rivera

Senior data engineer · built 2026-10-16

Lead: Harbor Freight Logistics

The scripts are openers. The interviewer picks one line and pulls it ten minutes deep. Rehearse the fact sheet, not the script.

## Engagement: Harbor Freight Logistics (full)

Harbor Freight Logistics, data engineer (contract through Aston), March 2024 to now.

### The opening  (45–60 s)

I'm a data engineer. I've spent the last few years moving event streams between systems, mostly with Kafka for replay and Python for the stages in between.

Right now I'm on a shipment-event pipeline. It turns tracking events from three carriers into one status per parcel, so customer service stops answering "where is my parcel" by hand. I built the carrier B adapter and the dedupe stage. That's the work I know best, so I'm happy to go as deep as you'd like.

*Stop. Let them pick the depth.*

### The project in three depths

#### Depth 1 — the one-liner  (15 s)

It turns three carriers' tracking events into one parcel status that customer service can trust.

#### Depth 2 — the system walk  (2 min)

Customer service was spending forty minutes a call because the three carrier feeds disagreed. About two million events a day arrive from eleven depots. Each carrier has an adapter, the dedupe stage removes repeats, and the status rules produce one status per parcel. The customer-service UI is outside what I built. The team is five, three internal and two contract.

*Stop. They will usually ask "what did you work on?"*

#### Depth 3 — what I owned  (4–5 min)

The carrier B adapter I wrote alone. It reads their feed and maps it to our event shape. The hard part was their resends, which is why we chose replay.

The dedupe stage I also wrote alone. The key is carrier id, parcel id and event time. In August a carrier changed its timestamp format and the stage dropped three percent of events for two days.

The status rules were shared with Priya. ⟪which rules were yours, and which were hers⟫

*Stop. This is where the probing starts.*

### The fact sheet

| Fact | What to have ready |
|---|---|
| What the system is for | One parcel status from three carrier feeds, for customer service. About two million events a day. |
| Why it was prioritized | Forty-minute calls answered by hand because the feeds disagreed. |
| Who the customer is | The customer-service team. |
| Timeline | Joined March 2024; in production since June 2024. |
| Team and your slice | Five: three internal, two contract; I'm one of the contract. |
| Exactly what you built | Alone: carrier B adapter, dedupe stage. Shared with Priya: status rules. |
| What you didn't build | The carrier A adapter (Priya's); the customer-service UI. |
| Scale | About 2 million events a day across 11 depots. |
| Alternatives rejected | Kafka over SQS, for replay when a carrier resends a day of events. |
| Who pushed back | The team lead wanted SQS: nobody on the team had run Kafka. |
| How you validated it | Old and new side by side for six weeks. |
| What broke | August: a carrier changed its timestamp format; dedupe dropped 3% of events for two days; customer service found it. |
| What it cost | Two days of wrong statuses. |
| What you'd change | Schema checks at the adapter edge. |
| How the engagement is going | Well; they have asked me to stay. |

### Three stories  (60–90 s each)

#### Story A — proudest work
⟪which piece, and why⟫

#### Story B — a production problem you fixed
In August a carrier changed its timestamp format. My dedupe stage dropped three percent of events for two days. Customer service found it, not us. ⟪how you fixed it and how long it took⟫

#### Story C — a disagreement
The team lead wanted SQS because nobody had run Kafka. ⟪his best argument as he'd state it, and how it ended⟫

### How they will probe

- Ownership: which parts of the status rules were yours, and which were Priya's?
- Decisions: why Kafka instead of SQS, and what would have made you pick SQS?
- Depth chain on the dedupe stage: how does it handle a duplicate? What is the key? What happens when the timestamp format changes? How did you find out? What would you check now?

### Client round

⟪the five contract questions, each answered from what they said⟫

## Engagement: Brightwell Insurance (light)

Brightwell Insurance, claims intake portal, January 2021 to February 2024.

- **The system:** A claims intake portal so adjusters stop re-keying paper forms.
- **What was mine:** I owned the document-upload service and the form-validation rules.
- **A decision I can defend:** Uploads went to S3 with metadata in Postgres, not files in the database, because files ran up to 80 MB and backups were already slow.
- **Technologies and how I used them:** Python and FastAPI for the upload service; S3 presigned URLs so the browser uploaded directly; Postgres for the metadata; Terraform for the buckets and roles.

## Engagement: Cobalt Retail (light)

Cobalt Retail, inventory sync, June 2018 to December 2020.

- **The system:** Inventory sync between stores and the web shop.
- **What was mine:** I wrote the nightly reconciliation job.
- **A decision I can defend:** A nightly batch instead of streaming, because stores had unreliable connections and the business only needed next-morning accuracy.
- **Technologies and how I used them:** Java and Spring Batch for the reconciliation job; MySQL for the store tables; Jenkins for the nightly schedule.

## Before you rehearse

1. Which status rules were yours and which were Priya's (Harbor Freight Logistics).
2. How you fixed the August dedupe drop and how long it took.
3. Why this was your proudest work, and which piece.
4. The team lead's best argument for SQS, as he'd state it, and how it ended.
5. The five client-round answers.

Get someone to run the depth chain against you, or run the drill.
