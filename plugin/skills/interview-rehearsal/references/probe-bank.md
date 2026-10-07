# Probe bank

The follow-up patterns interviewers use, over and over. Each has example questions, what a strong answer sounds like versus a weak one, and the fact-sheet rows it draws on. Generic questions are shown; the skill rewrites each one against the candidate's actual project (their services, their decisions, their numbers) before asking or listing it.

## Ownership

- "Which parts of ⟨component⟩ were yours, and which were the team's?"
- "If you'd been out that month, what wouldn't have shipped?"
- "Did anyone help with ⟨thing they own⟩?"

Strong: names specific decisions made or arguments won. Weak: team accomplishments restated in the singular, or a reflexive "we."
Rows: *Exactly what you built*, *What you didn't build*.

## Context

- "Why was ⟨the migration / the project⟩ happening? What was wrong before?"
- "Who consumes ⟨what the system produces⟩, and what do they do with it?"
- "Why was this a priority over other work?"

Strong: knows why it was prioritized and who benefited. Weak: works it out on the spot, or "the customer wanted it."
Rows: *Why it was prioritized*, *Who the customer is*.

## Decisions and trade-offs

- "Why ⟨technology or design chosen⟩ instead of ⟨obvious alternative⟩?"
- "Why ⟨structure⟩ rather than ⟨the simpler structure⟩?"
- "Who was against ⟨the choice⟩, and what was their best argument?"
- "With half the time, what would you have cut?"

Strong: names the alternatives considered and can state the objection as its author would. Weak: technology names without reasoning. The opposition question is the one that separates "I decided" from "I was told."
Rows: *Alternatives rejected*, *Who pushed back*.

## Depth chain

One thread, pulled until the candidate shows depth or runs out. Ask one question, wait, ask the next about whatever they just said. Three to five links.

Example against an event adapter:
1. "How does the adapter handle a duplicate event?"
2. "How do you detect that it's a duplicate?"
3. "What's the key? Where does it live?"
4. "What happens if the same event arrives a day later?"
5. "How did you test that?"

Strong: answers get clearer as the chain goes. Weak: answers get vaguer, or contradict something said earlier.
Rows: *Exactly what you built*, *How you validated it*.

## Validation

- "How did you know ⟨output⟩ was right?"
- "What did ⟨the consumer⟩ say when they started getting it?"
- "What are the actual numbers?"

Strong: has numbers and knows what they measured. Weak: a metric with no context, or none.
Rows: *How you validated it*, *Scale*.

## Scale and failure modes

- "What breaks first at ten times the volume?"
- "Where's the bottleneck in ⟨core component⟩?"
- "What happens when ⟨an input⟩ is late or malformed?"
- "How does ⟨component⟩ handle a retry, a partial failure, or an out-of-order message?"

Strong: names the specific weak point and what they'd do about it. Weak: "it scales."
Rows: *Scale*, *Exactly what you built*.

## Failure and regret

- "What went wrong? What was harder than you expected?"
- "What did it cost?"
- "What did you get wrong that you only saw later?"
- "What would you do differently?"

Strong: a failure that cost the business something, the mechanism, and a split between what they'd change and what they'd repeat. Weak: a safe failure with a tidy lesson, or blame.
Rows: *What broke*, *What it cost*, *What you'd change*.

## Client round (contract engagements)

- "How did your last engagement end?"
- "What would your first two days look like in our codebase?"
- "What do you need from us on Monday to be useful by Friday?"
- "What do you do when you disagree with how we want something built?"
- "You're a contractor. What does ownership mean for you?"

Strong: a concrete example from the current engagement for each. Weak: generalities.
Rows: *How the engagement is going*, *Exactly what you built*.

## Thread order for a drill

A drill thread starts from one claim in the candidate's *what I owned* block and runs the categories in this order, one question per turn, each question built on the previous answer:

1. Ownership (1 question)
2. Context (1)
3. Decisions and trade-offs (2, the second is the opposition question)
4. Depth chain (3–5 at L1; the level sets it, see Levels)
5. Validation (1)
6. Scale and failure modes (1)
7. Failure and regret (2, the second is "what would you change")

Then the next thread starts from a different claim. The client round runs once, after the threads, three questions.

## Levels

The opening message gives the level. It changes how you ask, never what is covered: the fact-sheet rows and these eight categories are the same at every level. Each level includes everything below it.

**L1 — the standard drill.** The thread order above, three to five links in the depth chain, a three-question client round.

**L2 — depth and pushback.**
- The depth chain runs five to seven links. Do not stop the chain at four; stop at five only when the answers have stopped getting vaguer, at seven at most.
- Pushback on every decision. Whenever an answer names a decision (a technology, a design or structure chosen, a cut, an approach taken), your next question argues the alternative they rejected, or the obvious one if they named none: "Why not ⟨alternative⟩? ⟨its best argument⟩." This applies in every category, not only Decisions. A pushback is an extra turn; it is not a link in the depth chain and does not replace the category's own next question.
- One pushback per decision. When they answer it, go back to the thread.

**L3 — L2 plus pressure.**
- Hypotheticals beyond what they built, after the depth chain and again in Scale: ten times the load, a region outage, a requirement that changes halfway through the build. Ask what they would change, not whether it would work.
- Plain-language demands. Once per thread, ask them to explain a component or a decision as they would to the client's non-engineer: "Say that again for a product manager, no component names."
- Interrupt rambling. When an answer wanders without answering the question you asked, begin your next message by cutting in ("Let me stop you there.") and re-ask the question in one sentence.
- A harder client round. The same three questions, each followed by one pressing follow-up that takes the answer to a concrete case: a named Monday-morning task, a named disagreement with a client lead, a named thing the contractor would own.
