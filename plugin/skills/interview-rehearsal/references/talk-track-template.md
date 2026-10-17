# Talk track — output format

The file the build mode writes: `talk-track.md` in the working directory, or returned in the reply when there is no filesystem. One file holds every engagement the candidate has had. Each is **full** or **light**, and one is the **lead** for the coming interview. Spoken register throughout the script sections: first person, short sentences, contractions, one idea per sentence, no lists of technology names, no quoted phrases the candidate could not explain for two more minutes. Every sentence traces to something the candidate said. A fact they did not give is a slot: `⟪prompt for what goes here⟫`, never a guess.

Time cues are targets. Over is worse than under.

````
# Talk track — ⟨candidate name, or role if no name⟩

⟨role⟩ · built ⟨date⟩

Lead: ⟨engagement name, exactly as in its heading below⟩

The scripts are openers. The interviewer picks one line and pulls it ten minutes deep. Rehearse the fact sheet, not the script.

## Engagement: ⟨name⟩ (full)

⟨Client or employer, role, dates. One line.⟩

### The opening  (45–60 s)

⟨Paragraph 1: who they are as an engineer. Years, the stack they are strongest in, with each skill tied to something they did with it. No bare lists.⟩

⟨Paragraph 2: the engagement in three or four sentences. What the system is, the change under way, the two or three things they personally built or own. Ends with an invitation: "That's the work I know best, so I'm happy to go as deep as you'd like."⟩

*Stop. Let them pick the depth.*

### The project in three depths

#### Depth 1 — the one-liner  (15 s)

⟨What the system is, for whom, the change under way. One breath.⟩

#### Depth 2 — the system walk  (2 min)

⟨Domain and scale in the first paragraph, including why it was prioritized and who consumes the output — slots if unknown. Then what flows in, what the core does, what comes out. Then what is deliberately outside the boundary. Then the team and the platform, one sentence each.⟩

*Stop. They will usually ask "what did you work on?"*

#### Depth 3 — what I owned  (4–5 min)

⟨One paragraph per component they touched, in the order they touched them. Each: what it does, what their part was, what was hard, what they did about it. Anything they own end to end is fully written; anything they can't yet explain gets a slot for the hard part.⟩

*Stop. This is where the probing starts.*

### The fact sheet

| Fact | What to have ready |
|---|---|
⟨One row per fact-sheet row, filled from the interview or a slot.⟩

### Three stories  (60–90 s each)

Situation and task in two sentences, action in "I" statements, result on something concrete. Pick work you drove. The failure should have cost something real.

#### Story A — proudest work
⟨Candidate from the interview, if one emerged, in a one-line note. Then Situation / Task / Action / Result, filled where they gave it, slots where not.⟩

#### Story B — a production problem you fixed
⟨Same shape. If *What broke* is a slot, the whole story is slots with the prompts from the probe bank's failure category.⟩

#### Story C — a disagreement
⟨Same shape. If *Who pushed back* is a slot, note: do not dress up agreement as a disagreement; find a real one.⟩

### How they will probe

⟨For each probe-bank category: two or three questions rewritten against this engagement, naming their components and choices. Then the strong/weak line from the bank.⟩

⟨A worked depth chain of five questions against the component they own most.⟩

### Client round

⟨The five contract questions, each with a one-line answer from what they said, or a slot.⟩

## Engagement: ⟨name⟩ (light)

⟨Client or employer, role, dates. One line.⟩

- **The system:** ⟨what it is and who it serves, one sentence a non-engineer would follow⟩
- **What was mine:** ⟨the parts they built or owned, "I" for alone, "we" for shared⟩
- **A decision I can defend:** ⟨the choice, the alternative it beat, the reason⟩
- **Technologies and how I used them:** ⟨each technology tied to something they did with it, never a bare list⟩

## Before you rehearse

⟨Numbered list: every slot in the file, across all engagements and led by the lead's, stated as a thing to go find out, most-asked first (why prioritized, who the customer is, exactly what you built). Then: "Get someone to run the depth chain against you, or run the drill."⟩
````

## Rules for engagements

- **Order.** Most recent first. Changing the lead never moves a section.
- **Headings.** `## Engagement: ⟨name⟩ (full)` or `(light)`, nothing else on the line. The lead is named once, on the `Lead:` line, and never in a heading, so changing the lead rewrites that line and no engagement section.
- **The lead is always full.** A light engagement becomes full only by running the build questions for it (SKILL.md, *Changing the lead*). A full engagement that stops being the lead stays full.
- **A light entry has exactly four parts**, in the order shown. A part they did not give is a slot.
- **Nothing is discarded.** Turning a light entry full keeps every fact it held, in the full engagement's matching section.
- **Shipped format.** A talk track from the shipped skill has no `## Engagement:` headings and no `Lead:` line; it opens `## The opening` and `## The project in three depths` at the top level. Read it as one full engagement that is the lead, and name it from the title (`# Talk track — ⟨project⟩`). Do not rewrite it, and its format is never a reason to rebuild.
