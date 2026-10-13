/**
 * THE SITE'S BRIEF — `<workspace>/AGENTS.md`, read by the DAEMON for every driver that hands its
 * agent the brief (claude_code on its argv, opencode as the one instruction file the daemon writes
 * into `.builder/`). One reader, so the shape refusals below hold for every driver.
 */

import { join } from 'node:path';
import { config } from '../config';
import { ValidationError } from '../errors';
import { readFileSharedBounded, relativeUnderRoot } from '../util/shared_tree';
import { MAX_BRIEF_BYTES } from './claude_argv';

export { MAX_BRIEF_BYTES } from './claude_argv';

/**
 * THE SITE'S BRIEF, read by the daemon: `<workspace>/AGENTS.md` through the link- and
 * hard-link-refusing reader (the workspace is agent-writable; a planted link to a daemon file
 * would otherwise be read into the prompt — it is THROWN, never folded into "no brief").
 * Absent = no brief. Over `MAX_BRIEF_BYTES` = cut, and the cut is said.
 *
 * AND THE FILE IS THE AGENT'S, SO ITS SHAPE IS TOO. A build's `postinstall` can replace it
 * with a FIFO (an open that blocks a daemon thread, and this turn's setup, forever), a sparse
 * multi-GB file (read whole into the daemon before any cut), or a body with a NUL (an argv
 * cannot carry one: the unit's spawn throws and every later turn fails with no exit frame, so
 * no turn could ever repair it). So: opened non-blocking and refused unless REGULAR, never
 * more than `MAX_BRIEF_BYTES + 1` bytes read, and a NUL refused here — typed, named, before
 * anything is written or connected.
 */
export async function readBrief(workspace: string): Promise<string | undefined> {
  const relative = relativeUnderRoot(config.SITES_ROOT, workspace);
  const file = join(relative, 'AGENTS.md');
  const read = await readFileSharedBounded(config.SITES_ROOT, file, MAX_BRIEF_BYTES + 1);
  if (read === null || read.size === 0) return undefined;
  if (read.bytes.includes(0)) {
    throw new ValidationError(
      `${file} contains a NUL byte, which no argv can carry; the brief is refused and nothing was started. ` +
        `Remove the NUL from AGENTS.md (a person can edit it; the agent's next turn cannot run until it is fixed).`,
    );
  }
  if (read.size <= MAX_BRIEF_BYTES) return read.bytes.toString('utf8');
  console.warn(`[brief] ${file} is ${read.size} bytes; the brief is cut at ${MAX_BRIEF_BYTES}.`);
  const cut = read.bytes.subarray(0, MAX_BRIEF_BYTES).toString('utf8').replace(/\uFFFD+$/, '');
  return `${cut}\n\n[The site brief (AGENTS.md, ${read.size} bytes) was cut at ${MAX_BRIEF_BYTES} bytes.]`;
}

