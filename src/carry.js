import { copyFileSync, existsSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

export const CARRIED = ["talk-track.md", "resume.md"];

/**
 * Copies each carried file from the most recent earlier session folder that holds it into the new
 * session folder. Folder names are ISO timestamps, so name order is time order. A file found in no
 * folder is not created. Local copy only; nothing is sent anywhere.
 */
export function carryForward(sessionsDir, sessionDir) {
  const current = basename(sessionDir);
  const earlier = existsSync(sessionsDir)
    ? readdirSync(sessionsDir, { withFileTypes: true }).filter((e) => e.isDirectory() && e.name !== current).map((e) => e.name).sort().reverse()
    : [];
  const carried = [];
  for (const file of CARRIED) {
    const source = earlier.find((name) => existsSync(join(sessionsDir, name, file)));
    if (!source) continue;
    copyFileSync(join(sessionsDir, source, file), join(sessionDir, file));
    carried.push({ file, from: source });
  }
  return carried;
}
