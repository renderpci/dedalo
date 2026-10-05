/**
 * MEDIA COPY PANEL STATUS (plan M6, spec §5.2 "unpublish is a verified deletion"):
 * the `media_copy` check is derived from the runtime record ONLY. A deletion still
 * unverified after one reconcile period is BLOCKED (red); an unparsable `since` counts
 * as overdue (fail loud). Blocked is decided BEFORE the n/a shortcut, so debt never
 * disappears from the panel. A non-copy verdict (nonCopyRuntime) becomes `n/a` only when
 * the host holds nothing; otherwise `failed` / copy_mode_withdrawn, debt kept.
 * Pure: no agent, no fs.
 */
import { describe, expect, test } from 'bun:test';
import type { HostPanelRow } from '../../src/core/publication_host/host_status.ts';
import {
	COPY_MODE_WITHDRAWN,
	liveMediaMode,
	MEDIA_COPY_PERIOD_MS,
	mediaCopyCheck,
	nonCopyRuntime,
	overdueDeletions,
	withMediaCopyCheck,
} from '../../src/core/publication_host/media_copy_status.ts';
import { defaultHostRuntime, type HostRuntime } from '../../src/core/publication_host/runtime.ts';

const NOW = Date.parse('2026-10-03T12:00:00.000Z');
const AT = new Date(NOW).toISOString();

function rt(over: Partial<HostRuntime['media_copy']> = {}): HostRuntime['media_copy'] {
	return {
		state: 'ok',
		desired: 12,
		present: 12,
		pending_puts: 0,
		pending_deletions: [],
		last_verified_at: '2026-10-03T11:55:00.000Z',
		error: null,
		...over,
	};
}

function host(media_copy: HostRuntime['media_copy']): HostRuntime {
	return { ...defaultHostRuntime(), media_copy };
}

const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe('media_copy check', () => {
	test('the period is the reconcile interval (10 min)', () => {
		expect(MEDIA_COPY_PERIOD_MS).toBe(600_000);
	});

	test('never reconciled → unknown; a clean n/a (not a copy host) → no row', () => {
		expect(mediaCopyCheck(undefined, NOW)).toEqual({
			id: 'media_copy',
			state: 'unknown',
			detail: 'not_reconciled',
		});
		expect(mediaCopyCheck(rt({ state: 'n/a', present: 0, desired: 0 }), NOW)).toBeNull();
		// the DEFAULT row another writer created (api_reconcile, the probe) is no answer
		// (media_copy_apply.ts explicitCopyState): not reconciled yet, never "not a copy host"
		expect(mediaCopyCheck(defaultHostRuntime().media_copy, NOW)).toMatchObject({
			state: 'unknown',
			detail: 'not_reconciled',
		});
	});

	test('in sync → ok, naming present/desired (a fact, never a sentence)', () => {
		const check = mediaCopyCheck(rt(), NOW);
		expect(check?.id).toBe('media_copy');
		expect(check?.state).toBe('ok');
		expect(check?.detail).toBe('12/12');
	});

	test('pending puts, a young pending deletion, or state pending → warn', () => {
		expect(mediaCopyCheck(rt({ pending_puts: 3, present: 9 }), NOW)).toMatchObject({
			state: 'warn',
			detail: 'puts:3 deletions:0',
		});
		expect(
			mediaCopyCheck(rt({ pending_deletions: [{ path: 'a', since: ago(60_000) }] }), NOW)?.state,
		).toBe('warn');
		expect(mediaCopyCheck(rt({ state: 'pending' }), NOW)?.state).toBe('warn');
		// a transient round failure (agent down) is pending + its code: named, still warn
		expect(
			mediaCopyCheck(rt({ state: 'pending', error: 'publication_host.unreachable' }), NOW),
		).toMatchObject({ state: 'warn', detail: 'publication_host.unreachable' });
	});

	test('a deletion unverified for more than one period → BLOCKED, whatever the state says', () => {
		const late = rt({
			state: 'ok',
			pending_deletions: [{ path: 'a', since: ago(MEDIA_COPY_PERIOD_MS + 1) }],
		});
		expect(overdueDeletions(late, NOW)).toBe(1);
		expect(mediaCopyCheck(late, NOW)).toEqual({
			id: 'media_copy',
			state: 'blocked',
			detail: 'unverified_deletions:1',
		});
		// exactly one period old is still young
		const edge = rt({ pending_deletions: [{ path: 'a', since: ago(MEDIA_COPY_PERIOD_MS) }] });
		expect(overdueDeletions(edge, NOW)).toBe(0);
	});

	test('blocked wins over n/a: an overdue deletion on an n/a record still shows red', () => {
		const legacy = rt({
			state: 'n/a',
			pending_deletions: [{ path: 'a', since: ago(MEDIA_COPY_PERIOD_MS + 1) }],
		});
		expect(mediaCopyCheck(legacy, NOW)?.state).toBe('blocked');
	});

	test('an n/a record still holding bytes or a young deletion is never a silent "no row"', () => {
		expect(mediaCopyCheck(rt({ state: 'n/a', present: 2 }), NOW)?.state).toBe('warn');
		expect(
			mediaCopyCheck(
				rt({ state: 'n/a', present: 0, pending_deletions: [{ path: 'a', since: ago(1) }] }),
				NOW,
			)?.state,
		).toBe('warn');
	});

	test('an unparsable since counts as overdue (fail loud, never silently young)', () => {
		const bad = rt({ pending_deletions: [{ path: 'a', since: 'garbage' }] });
		expect(overdueDeletions(bad, NOW)).toBe(1);
		expect(mediaCopyCheck(bad, NOW)?.state).toBe('blocked');
	});

	test('failed → blocked, naming the recorded error code', () => {
		const check = mediaCopyCheck(rt({ state: 'failed', error: 'publication_host.auth' }), NOW);
		expect(check).toEqual({ id: 'media_copy', state: 'blocked', detail: 'publication_host.auth' });
		expect(mediaCopyCheck(rt({ state: 'failed', error: null }), NOW)?.detail).toBe('failed');
	});
});

describe('nonCopyRuntime (a host the agent no longer declares copy)', () => {
	test('holding nothing → n/a, stamped (the agent said so), error cleared', () => {
		expect(
			nonCopyRuntime(rt({ present: 0, desired: 0, state: 'ok', error: 'x' }), AT),
		).toMatchObject({
			state: 'n/a',
			error: null,
			pending_deletions: [],
			last_verified_at: AT,
		});
	});

	test('bytes still on the host, or a pending deletion → failed / copy_mode_withdrawn, debt kept', () => {
		const withBytes = nonCopyRuntime(rt({ present: 3 }), AT);
		expect(withBytes).toMatchObject({ state: 'failed', error: COPY_MODE_WITHDRAWN, present: 3 });
		expect(mediaCopyCheck(withBytes, NOW)?.state).toBe('blocked');
		const pending = [{ path: 'a', since: ago(1000) }];
		const withDebt = nonCopyRuntime(rt({ present: 0, pending_deletions: pending }), AT);
		expect(withDebt).toMatchObject({ state: 'failed', error: COPY_MODE_WITHDRAWN });
		expect(withDebt.pending_deletions).toEqual(pending);
		// never stamped: last_verified_at keeps the last REAL verification
		expect(withDebt.last_verified_at).toBe('2026-10-03T11:55:00.000Z');
		expect(mediaCopyCheck(withDebt, NOW)).toEqual({
			id: 'media_copy',
			state: 'blocked',
			detail: COPY_MODE_WITHDRAWN,
		});
	});
});

describe('withMediaCopyCheck', () => {
	const row = { name: 'h1', checks: [{ id: 'reachable', state: 'ok' }] } as unknown as HostPanelRow;

	test('appends the media_copy check after the existing checks', () => {
		const out = withMediaCopyCheck(row, { h1: host(rt()) }, NOW);
		expect(out.checks.map((c) => c.id)).toEqual(['reachable', 'media_copy']);
		expect(row.checks.length).toBe(1); // the input row is not mutated
	});

	test('a clean n/a host keeps its row unchanged; a host absent from the runtime shows unknown', () => {
		const na = withMediaCopyCheck(
			row,
			{ h1: host(rt({ state: 'n/a', present: 0, desired: 0 })) },
			NOW,
		);
		expect(na).toBe(row);
		const absent = withMediaCopyCheck(row, {}, NOW);
		expect(absent.checks.at(-1)).toMatchObject({ id: 'media_copy', state: 'unknown' });
	});
});

describe("the agent's live media_mode decides at once (no wait for the next scheduled apply)", () => {
	const withMode = (state: string, detail: string) =>
		({
			name: 'h1',
			checks: [
				{ id: 'reachable', state: 'ok' },
				{ id: 'media_mode', state, detail },
			],
		}) as unknown as HostPanelRow;

	test('liveMediaMode: the trusted detail; unavailable or absent → null', () => {
		expect(liveMediaMode(withMode('ok', 'shared'))).toBe('shared');
		expect(liveMediaMode(withMode('warn', 'none'))).toBe('none');
		expect(liveMediaMode(withMode('unknown', 'unavailable'))).toBeNull();
		expect(liveMediaMode({ checks: [] } as unknown as HostPanelRow)).toBeNull();
	});

	test('shared / none, nothing held: no row — a shared or freshly paired host never shows the copy check', () => {
		for (const mode of ['shared', 'none']) {
			const row = withMode(mode === 'none' ? 'warn' : 'ok', mode);
			expect(withMediaCopyCheck(row, {}, NOW)).toBe(row);
			expect(withMediaCopyCheck(row, { h1: defaultHostRuntime() }, NOW)).toBe(row);
			expect(withMediaCopyCheck(row, { h1: host(rt({ present: 0, desired: 0 })) }, NOW)).toBe(row);
		}
	});

	test('shared while bytes or debt are held: blocked / copy_mode_withdrawn at once', () => {
		const row = withMode('ok', 'shared');
		expect(withMediaCopyCheck(row, { h1: host(rt()) }, NOW).checks.at(-1)).toEqual({
			id: 'media_copy',
			state: 'blocked',
			detail: COPY_MODE_WITHDRAWN,
		});
		const debt = rt({ present: 0, pending_deletions: [{ path: 'a', since: ago(60_000) }] });
		expect(mediaCopyCheck(debt, NOW, 'shared')).toEqual({
			id: 'media_copy',
			state: 'blocked',
			detail: COPY_MODE_WITHDRAWN,
		});
		// overdue deletions are still decided first
		const overdue = rt({
			pending_deletions: [{ path: 'a', since: ago(2 * MEDIA_COPY_PERIOD_MS) }],
		});
		expect(mediaCopyCheck(overdue, NOW, 'shared')?.detail).toBe('unverified_deletions:1');
	});

	test('copy, or the mode unavailable: the stored verdict stands (unknown when never reconciled)', () => {
		expect(mediaCopyCheck(undefined, NOW, 'copy')).toMatchObject({ state: 'unknown' });
		expect(
			withMediaCopyCheck(withMode('unknown', 'unavailable'), {}, NOW).checks.at(-1),
		).toMatchObject({
			id: 'media_copy',
			state: 'unknown',
		});
		expect(mediaCopyCheck(rt(), NOW, 'copy')).toMatchObject({ state: 'ok', detail: '12/12' });
	});
});
