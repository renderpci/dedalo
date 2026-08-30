/**
 * THE ENV-FILE GRAMMAR — one parser, for the two programs that read the same bytes.
 *
 * A site-builder instance's environment file is written by `src/provision/render/env.ts`
 * and read by `src/config.ts`. Since `provision adopt` exists there is a THIRD party to the
 * same grammar: adoption reads the PRE-instance `.env` — the hand-edited file the retired
 * installer left behind — to learn what a museum's daemon was actually configured with.
 *
 * It reads it with this function, and not with a copy. The subsystem's recurring defect is
 * one fact derived in two places (see `scripts/lib/site_builder_census.ts` for the four that
 * were paid for), and "what does KEY=VALUE mean" is exactly such a fact: a second parser
 * that unquoted one escape differently would hand the adopter a SERVICE_TOKEN that is not
 * the one the daemon has been authenticating with, and the museum's engine would stop being
 * able to talk to its own site builder — with every file on the host looking correct.
 *
 * WHY IT IS ITS OWN MODULE rather than an export of `src/config.ts`: that module RESOLVES
 * the daemon's configuration at import time and calls `process.exit(1)` when it cannot. The
 * provisioner runs as root on a host where no instance may yet be configured at all, so
 * importing the daemon's config to borrow its parser would end the provisioning run before
 * `--help` could print. A parser is a pure function of a string; it belongs where both
 * callers can have it.
 *
 * THE GRAMMAR is the intersection of the three readers a rendered env file has: systemd's
 * `EnvironmentFile=`, a dotenv loader, and an operator's `set -a; . env`. `KEY=VALUE`,
 * optionally double- or single-quoted, `#` comments, blank lines — exactly what the
 * renderer emits, which is the point: the renderer quotes every value and escapes only `\`
 * and `"`, so that is all this has to undo.
 *
 * A LINE THAT IS NONE OF THOSE IS A REFUSAL naming the file and the line number. Skipping
 * it would mean a museum's daemon running with a value nobody could see was ignored — and,
 * on the adoption path, a credential silently left behind in a file about to be retired.
 */

/** `KEY=VALUE`, with an optional `export ` an operator's shell habit leaves behind. */
const ASSIGNMENT = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/;

/**
 * Parse an environment file's text into a plain record.
 *
 * THROWS on a line it cannot read, with a message that names the file and the line number
 * and quotes NEITHER the line nor any value: this parser is pointed at files that hold
 * credentials, and a refusal is printed in a terminal and pasted into a ticket. The caller
 * adds whatever trailer its own voice uses.
 */
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
