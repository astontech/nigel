// DORIS rubric regression runner: grades each fixture with the same `claude -p` call the Fargate task uses.
// Usage: npm run evaluator:eval [-- <case> ...]. Runs under whatever Claude seat is signed in locally
// (`claude setup-token` or an interactive login); never an API key. Reports land in evaluator/eval-output/ (git-ignored).
import { readFileSync, readdirSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gradeDrill, parseTranscript, countOpenSlots } from "./grade.js";
import { shapeProblems, readProblems, type Expectation } from "./assertions.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "fixtures");
const output = join(here, "eval-output");

if (process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is set. The evaluator runs on an Aston seat, never an API key; unset it and sign in with `claude setup-token` or an interactive login.");
  process.exit(2);
}

const talkTrack = readFileSync(join(fixtures, "talk-track.md"), "utf8");
const all = readdirSync(fixtures, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort();
const wanted = process.argv.slice(2).filter(a => a !== "--");
const unknown = wanted.filter(w => !all.includes(w));
if (unknown.length) { console.error(`unknown case(s): ${unknown.join(", ")}; available: ${all.join(", ")}`); process.exit(2); }
const cases = wanted.length ? wanted : all;

mkdirSync(output, { recursive: true });
let failed = 0;
for (const name of cases) {
  const dir = join(fixtures, name);
  const expect: Expectation = JSON.parse(readFileSync(join(dir, "expect.json"), "utf8"));
  const turns = parseTranscript(readFileSync(join(dir, "transcript.jsonl"), "utf8"));
  const caseTalkTrack = existsSync(join(dir, "talk-track.md")) ? readFileSync(join(dir, "talk-track.md"), "utf8") : talkTrack;
  let problems: string[];
  try {
    const { parsed, result, model } = await gradeDrill({ talkTrack: caseTalkTrack, turns });
    writeFileSync(join(output, `${name}.json`), JSON.stringify({ model, expect, localOpenSlots: countOpenSlots(caseTalkTrack), grade: parsed, usage: result.usage, cost_usd: result.total_cost_usd }, null, 2));
    problems = [...shapeProblems(parsed), ...readProblems(parsed, expect)];
  } catch (e) {
    problems = [`grading failed: ${e instanceof Error ? e.message.split("\n")[0] : e}`];
  }
  if (problems.length) failed++;
  console.log(`${problems.length ? "FAIL" : "PASS"}  ${name}`);
  for (const p of problems) console.log(`      - ${p}`);
}
console.log(`\n${cases.length - failed}/${cases.length} passed`);
process.exit(failed ? 1 : 0);
