import { watch, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ARTIFACTS = ["talk-track.md", "drill-log.md"];

/** Posts each artifact the skill writes, debounced, so a closed window never loses a write. */
export function watchArtifacts(dir, onArtifact) {
  const timers = new Map();
  const fire = (name) => {
    clearTimeout(timers.get(name));
    timers.set(name, setTimeout(() => {
      const p = join(dir, name);
      if (existsSync(p)) onArtifact(name, readFileSync(p, "utf8"));
    }, 400));
  };
  const w = watch(dir, (_, file) => { if (file && ARTIFACTS.includes(file)) fire(file); });
  return () => { w.close(); for (const t of timers.values()) clearTimeout(t); };
}
