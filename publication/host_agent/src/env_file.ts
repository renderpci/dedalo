/**
 * THE ENV-FILE GRAMMAR.
 *
 * COPIED from publication/site_builder/src/env_file.ts (2026-10-03). The two packages are
 * separate deployables and import nothing from each other (Global Constraints), so the
 * grammar is copied, not shared; a change to one is a change to both.
 *
 * Its own module, not an export of src/config.ts, because that module resolves the
 * daemon's configuration at import and exits when it cannot — the provisioner reads env
 * files on a host where no instance is configured yet.
 *
 * THE GRAMMAR is the intersection of systemd's `EnvironmentFile=`, a dotenv loader and an
 * operator's `set -a; . env`: `KEY=VALUE`, optionally double- or single-quoted, `#`
 * comments, blank lines. A line that is none of those is a refusal naming the file and the
 * line number, quoting neither the line nor any value (these files hold credentials).
 */

/** `KEY=VALUE`, with an optional `export ` an operator's shell habit leaves behind. */
const ASSIGNMENT = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/;

/** Parse an environment file's text into a plain record. THROWS on a line it cannot read. */
export function parseEnvFile(text: string, path: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = text.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = (lines[index] as string).trim();
    if (!line || line.startsWith('#')) continue;

    const match = ASSIGNMENT.exec(line);
    if (!match) {
      throw new Error(
        `The environment file '${path}' has a line this daemon cannot read (line ${index + 1}). ` +
          `Expected KEY=VALUE, a '#' comment, or a blank line.`,
      );
    }

    const key = match[1] as string;
    let value = (match[2] as string).trim();
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
      value = value.slice(1, -1).replace(/\\([\\"])/g, '$1');
    } else if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}
