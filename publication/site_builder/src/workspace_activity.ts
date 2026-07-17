/**
 * Workspace activity — the ONE synchronous authority on "is something running in this
 * workspace right now".
 *
 * Two kinds of work mutate a site's working tree: an agent turn and a build. They must
 * never overlap — with each other or with themselves — or they race on the same files
 * (the agent editing sources while the bundler reads them, two agents interleaving
 * edits). The manager and the builder each kept their own busy set, which left two holes
 * the review confirmed: no cross-exclusion (a build could start during a turn's
 * check-then-act window and vice versa), and each check had `await`s between the check
 * and the mark, so two concurrent starts could both pass.
 *
 * The fix is structural: reservation is a SINGLE SYNCHRONOUS call (`tryBeginTurn` /
 * `tryBeginBuild`) that checks BOTH sets and marks in one uninterruptible step — no
 * `await` can be interleaved inside a synchronous function, so under Bun's
 * single-threaded JS there is no window. Callers reserve FIRST, before any await, and
 * release in their terminal path (`endTurn` / `endBuild`, idempotent).
 *
 * This module holds no other state and imports nothing, so both sides (sessions/manager,
 * build/builder) can use it without a dependency cycle.
 */

const activeTurnSlugs = new Set<string>();
const activeBuildSlugs = new Set<string>();

/** Why a reservation was refused — callers map this to their 409 reason code. */
export type BusyReason = 'session_running' | 'build_running' | null;

/** What (if anything) currently occupies the workspace. */
export function busyReason(slug: string): BusyReason {
  if (activeTurnSlugs.has(slug)) return 'session_running';
  if (activeBuildSlugs.has(slug)) return 'build_running';
  return null;
}

/**
 * Reserve the workspace for an agent turn. Check-and-mark in one synchronous step;
 * returns false when a turn OR a build already holds it.
 */
export function tryBeginTurn(slug: string): boolean {
  if (activeTurnSlugs.has(slug) || activeBuildSlugs.has(slug)) return false;
  activeTurnSlugs.add(slug);
  return true;
}

/** Release a turn reservation. Idempotent — safe on every terminal path. */
export function endTurn(slug: string): void {
  activeTurnSlugs.delete(slug);
}

/**
 * Reserve the workspace for a build. Check-and-mark in one synchronous step;
 * returns false when a build OR an agent turn already holds it.
 */
export function tryBeginBuild(slug: string): boolean {
  if (activeBuildSlugs.has(slug) || activeTurnSlugs.has(slug)) return false;
  activeBuildSlugs.add(slug);
  return true;
}

/** Release a build reservation. Idempotent — safe on every terminal path. */
export function endBuild(slug: string): void {
  activeBuildSlugs.delete(slug);
}
