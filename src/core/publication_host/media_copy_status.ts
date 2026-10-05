/**
 * MEDIA COPY — the panel status of one copy-mode publication host
 * (engineering/PUBLICATION_HOST_SPEC.md §5.2; plan M6).
 *
 * PURE. It reads the runtime record the copy worker and the `media_copy` reconcile write
 * (runtime.ts) and never talks to the agent: the panel must render even with every agent
 * down, and an unreachable host must still show its unverified deletions. `detail` is a
 * FACT (a count, a code), never a sentence — host_status.ts's vocabulary; the client owns
 * the wording.
 *
 * VERIFIED DELETION. Withdrawn consent must remove BYTES from the public host. A pending
 * deletion is debt until the agent manifest confirms it gone. Once it has been unverified
 * for longer than ONE reconcile period, the check is `blocked` (red), whatever the state
 * field says — decided BEFORE the n/a shortcut, so debt never vanishes from the panel. An
 * unparsable `since` is overdue: a malformed record must never look young.
 *
 * NO ROW only for a host the agent SAID is not a copy host (an `n/a` stamped with
 * `last_verified_at`, media_copy_apply.ts explicitCopyState) and that holds nothing. The
 * default row another writer created (unstamped `n/a`) is no answer: `unknown`.
 *
 * MODE WITHDRAWAL. When the agent stops declaring `copy`, `nonCopyRuntime` (the worker's
 * markNotCopy, media_copy_apply.ts) writes `n/a` ONLY if the host holds nothing (no
 * pending deletion, last manifest count 0). Otherwise `failed` / copy_mode_withdrawn:
 * the old copy root may still be mounted or served, and it was never verified clean. The
 * operator re-declares copy (the next round finishes the deletions) or empties the copy
 * root and removes the host's runtime entry (re-derived on the next run).
 *
 * The period is the `media_copy` reconcile's own: src/diffusion/api/reconcile.ts imports
 * it from here (diffusion → core, never the reverse).
 */

import type { HostCheck, HostPanelRow } from './host_status.ts';
import type { HostRuntime } from './runtime.ts';

/** The media_copy reconcile interval; a deletion unverified for longer is `blocked`. */
export const MEDIA_COPY_PERIOD_MS = 10 * 60_000;

/** The runtime error of a host withdrawn from copy mode while it still held bytes or debt. */
export const COPY_MODE_WITHDRAWN = 'copy_mode_withdrawn';

type MediaCopyRuntime = HostRuntime['media_copy'];

function check(state: HostCheck['state'], detail: string): HostCheck {
	return { id: 'media_copy', state, detail };
}

function holdsNothing(rt: MediaCopyRuntime): boolean {
	return rt.pending_deletions.length === 0 && rt.present === 0;
}

/**
 * A non-copy verdict at `at` (the instant the agent answered): `n/a`, stamped, only when
 * nothing is held; otherwise `failed` / copy_mode_withdrawn with the debt kept and
 * `last_verified_at` untouched (it names the last REAL verification).
 */
export function nonCopyRuntime(rt: MediaCopyRuntime, at: string): MediaCopyRuntime {
	if (holdsNothing(rt)) {
		return { ...rt, state: 'n/a', error: null, pending_deletions: [], last_verified_at: at };
	}
	return { ...rt, state: 'failed', error: COPY_MODE_WITHDRAWN };
}

/** Pending deletions not verified within one period (an unparsable `since` counts). */
export function overdueDeletions(rt: MediaCopyRuntime, nowMs: number): number {
	const limit = nowMs - MEDIA_COPY_PERIOD_MS;
	return rt.pending_deletions.filter((deletion) => !(Date.parse(deletion.since) >= limit)).length;
}

function blockedCheck(rt: MediaCopyRuntime, nowMs: number): HostCheck | null {
	const overdue = overdueDeletions(rt, nowMs);
	if (overdue > 0) return check('blocked', `unverified_deletions:${overdue}`);
	if (rt.state === 'failed') return check('blocked', rt.error ?? 'failed');
	return null;
}

function isPending(rt: MediaCopyRuntime): boolean {
	return rt.state !== 'ok' || rt.pending_puts > 0 || rt.pending_deletions.length > 0;
}

function progressCheck(rt: MediaCopyRuntime): HostCheck {
	if (!isPending(rt)) return check('ok', `${rt.present}/${rt.desired}`);
	return check(
		'warn',
		rt.error ?? `puts:${rt.pending_puts} deletions:${rt.pending_deletions.length}`,
	);
}

/** The `media_copy` check of one host; null only for a host the agent said is not copy, holding nothing. */
export function mediaCopyCheck(rt: MediaCopyRuntime | undefined, nowMs: number): HostCheck | null {
	if (rt === undefined) return check('unknown', 'not_reconciled');
	const blocked = blockedCheck(rt, nowMs);
	if (blocked !== null) return blocked;
	if (rt.state !== 'n/a' || !holdsNothing(rt)) return progressCheck(rt);
	return rt.last_verified_at === null ? check('unknown', 'not_reconciled') : null;
}

/** The panel row with its media_copy check appended (the input row is never mutated). */
export function withMediaCopyCheck<R extends Pick<HostPanelRow, 'name' | 'checks'>>(
	row: R,
	runtime: Readonly<Record<string, HostRuntime>>,
	nowMs: number,
): R {
	const media = mediaCopyCheck(runtime[row.name]?.media_copy, nowMs);
	return media === null ? row : { ...row, checks: [...row.checks, media] };
}
