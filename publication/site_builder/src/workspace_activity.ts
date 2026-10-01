/**
 * Workspace activity — the ONE synchronous authority on "is something running in this
 * workspace right now".
 *
 * Everything that mutates a site's working tree or runs agent-authored text in it holds a
 * RESERVATION for the whole of that work: an agent turn, a build, the repository
 * initialization of a new site (`createSite` → `initRepo`), the recovery commit of a turn a
 * dead daemon left behind (`sweepOnBoot`), and a git operation nobody else reserved for
 * (`sites/git.ts`). They must never overlap — with each other or with themselves — or they
 * race on the same files. And since LEAD-1b the reservation is ALSO the daemon-side half of
 * the site's identity lease: a confined run of site k is refused unless its slug is reserved
 * (`drivers/confinement.ts`), so a site's runs are sequential by construction and PID 1's
 * own per-site exclusion (door-target `Conflicts=`) only ever fires on a daemon bug.
 *
 * The rule is structural: reservation is a SINGLE SYNCHRONOUS call (`tryBegin`) that checks
 * and marks in one uninterruptible step — no `await` can be interleaved inside a synchronous
 * function, so under Bun's single-threaded JS there is no window. Callers reserve FIRST,
 * before any await, and release in their terminal path (`end`, idempotent).
 *
 * This module holds no other state and imports nothing, so every holder can use it without a
 * dependency cycle.
 */

/** What a reservation is for. One per slug at a time. */
export type ReservationKind = 'turn' | 'build' | 'init' | 'recovery' | 'git';

const held = new Map<string, ReservationKind>();

/** Why a reservation was refused — callers map this to their 409 reason code. */
export type BusyReason =
  | 'session_running'
  | 'build_running'
  | 'site_initializing'
  | 'site_recovering'
  | 'git_running'
  | null;

const REASON: Readonly<Record<ReservationKind, Exclude<BusyReason, null>>> = Object.freeze({
  turn: 'session_running',
  build: 'build_running',
  init: 'site_initializing',
  recovery: 'site_recovering',
  git: 'git_running',
});

/** The sentence a 409 carries for each reason (the reason itself is the machine code). */
export function busyDetail(reason: Exclude<BusyReason, null>, slug: string): string {
  switch (reason) {
    case 'session_running':
      return `A session is already running for '${slug}'`;
    case 'build_running':
      return `A build is running for '${slug}'`;
    case 'site_initializing':
      return `The site '${slug}' is still being initialized`;
    case 'site_recovering':
      return `The site '${slug}' is being recovered after a restart`;
    case 'git_running':
      return `A repository operation is running for '${slug}'`;
  }
}

/** What (if anything) currently occupies the workspace. */
export function busyReason(slug: string): BusyReason {
  const kind = held.get(slug);
  return kind ? REASON[kind] : null;
}

/** Does anything hold this site right now? The confinement asks before every run. */
export function holdsReservation(slug: string): boolean {
  return held.has(slug);
}

/** Reserve the site for `kind`. Check-and-mark in one synchronous step; false when held. */
export function tryBegin(slug: string, kind: ReservationKind): boolean {
  if (held.has(slug)) return false;
  held.set(slug, kind);
  return true;
}

/** Release a `kind` reservation. Idempotent, and never releases another kind's hold. */
export function end(slug: string, kind: ReservationKind): void {
  if (held.get(slug) === kind) held.delete(slug);
}

/** Reserve the workspace for an agent turn (a turn OR any other hold refuses it). */
export function tryBeginTurn(slug: string): boolean {
  return tryBegin(slug, 'turn');
}

/** Release a turn reservation. Idempotent — safe on every terminal path. */
export function endTurn(slug: string): void {
  end(slug, 'turn');
}

/** Reserve the workspace for a build. */
export function tryBeginBuild(slug: string): boolean {
  return tryBegin(slug, 'build');
}

/** Release a build reservation. Idempotent — safe on every terminal path. */
export function endBuild(slug: string): void {
  end(slug, 'build');
}
