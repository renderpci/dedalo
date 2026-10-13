/**
 * READ-4 (Leg W) — THE WIRE ITSELF BOUNDS EVERY CLIENT PAGE.
 *
 * Every HTTP body is parsed by `rqoSchema` (server.ts) before any handler runs.
 * Its `sqo.limit` admitted any number or short string and `sqo.offset` any
 * number, so a hostile window (`'all'`, `-1`, `1e21`, an offset past
 * Number.MAX_SAFE_INTEGER) reached whichever door forgot to clamp — the
 * relation doors and the indexation grid did (client_page_doors_native).
 * The doors now clamp themselves; this leg makes the WIRE a second, total
 * chokepoint so a future door cannot forget: whatever the action, a parsed RQO
 * either fails (`request.invalid_rqo`, as server.ts answers) or carries a page
 * that is already bounded — an integer limit in [1, CLIENT_MAX_LIMIT] and an
 * integer offset in [0, MAX_SAFE_INTEGER]. `null` / absent stay absent
 * (mergeSessionSqo and the read-mode defaults key on "absent").
 *
 * The action set is DERIVED (`listRegisteredActions`), so a new action is
 * covered without being listed.
 *
 * Lands with the integrator's `src/core/concepts/rqo.ts` hunk (`sqo:
 * wireSqoSchema.optional()`): red until then by construction.
 */

import { describe, expect, test } from 'bun:test';
import { listRegisteredActions } from '../../src/core/api/dispatch.ts';
import { rqoSchema } from '../../src/core/concepts/rqo.ts';
import * as sqoModule from '../../src/core/concepts/sqo.ts';
import { CLIENT_MAX_LIMIT } from '../../src/core/concepts/sqo.ts';

const ABSENT = Symbol('absent');
const HOSTILE_LIMITS: unknown[] = [
	ABSENT,
	null,
	0,
	-1,
	'all',
	'x',
	'5',
	1.5,
	1e9,
	1e21,
	CLIENT_MAX_LIMIT + 1,
];
const HOSTILE_OFFSETS: unknown[] = [ABSENT, null, -5, 2.5, 'x', 1e21, Number.MAX_SAFE_INTEGER];

const label = (value: unknown): string => (value === ABSENT ? 'absent' : JSON.stringify(value));

function isBoundedLimit(value: unknown): boolean {
	return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= CLIENT_MAX_LIMIT;
}

function isBoundedOffset(value: unknown): boolean {
	return Number.isSafeInteger(value) && (value as number) >= 0;
}

/**
 * The outcome for ONE sent value: absent stays absent (no key added), null
 * stays null, anything present comes out bounded.
 */
function windowViolation(
	key: 'limit' | 'offset',
	sent: unknown,
	out: Record<string, unknown>,
): string | null {
	const has = Object.hasOwn(out, key);
	if (sent === ABSENT) return has ? `${key} absent → key added (${label(out[key])})` : null;
	if (sent === null) return out[key] === null ? null : `${key} null → ${label(out[key])}`;
	const ok = key === 'limit' ? isBoundedLimit(out[key]) : isBoundedOffset(out[key]);
	return ok ? null : `${key} ${label(sent)} → ${has ? label(out[key]) : 'absent'}`;
}

type WireApi = { requestedPage?: (sqo: unknown) => { limit: unknown; offset: unknown } };

describe('READ-4 Leg W — the wire schema bounds every client page', () => {
	test('wireSqoSchema is exported from concepts/sqo.ts', () => {
		expect(typeof (sqoModule as Record<string, unknown>).wireSqoSchema).toBe('object');
	});

	test('every registered action: a parsed sqo window is bounded, or the body is refused', () => {
		const actions = listRegisteredActions();
		// Anti-vacuity: the derived census is the real registry.
		expect(actions.length).toBeGreaterThan(50);
		const unbounded: string[] = [];
		let parsedCount = 0;
		for (const { apiClass, action } of actions) {
			for (const limit of HOSTILE_LIMITS) {
				for (const offset of HOSTILE_OFFSETS) {
					const sqo: Record<string, unknown> = { section_tipo: ['test3'] };
					if (limit !== ABSENT) sqo.limit = limit;
					if (offset !== ABSENT) sqo.offset = offset;
					const parsed = rqoSchema.safeParse({ action, dd_api: apiClass, sqo });
					if (!parsed.success) continue;
					parsedCount++;
					const out = parsed.data.sqo as Record<string, unknown>;
					for (const violation of [
						windowViolation('limit', limit, out),
						windowViolation('offset', offset, out),
					]) {
						if (violation !== null) unbounded.push(`${apiClass}:${action} ${violation}`);
					}
				}
			}
		}
		// Anti-vacuity: most combinations parse (only non-numeric offsets may be refused).
		expect(parsedCount).toBeGreaterThan(actions.length * HOSTILE_LIMITS.length * 3);
		// One line per (window) is enough to read the failure — the action set
		// multiplies identical lines.
		const distinct = [...new Set(unbounded.map((line) => line.replace(/^\S+ /, '')))].sort();
		expect(distinct).toEqual([]);
		expect(unbounded.length).toBe(0);
	});

	test('a valid window is served as sent; the sent page stays readable, never serialized', () => {
		const parsed = rqoSchema.safeParse({
			action: 'read',
			dd_api: 'dd_core_api',
			sqo: { section_tipo: ['test3'], limit: '7', offset: 3 },
		});
		expect(parsed.success).toBe(true);
		const out = (parsed.success ? parsed.data.sqo : {}) as Record<string, unknown>;
		expect(out.limit).toBe(7);
		expect(out.offset).toBe(3);

		const hostile = rqoSchema.safeParse({
			action: 'read',
			dd_api: 'dd_core_api',
			sqo: { section_tipo: ['test3'], limit: 'all', offset: 1e21 },
		});
		expect(hostile.success).toBe(true);
		const bounded = (hostile.success ? hostile.data.sqo : {}) as Record<string, unknown>;
		expect(bounded.limit).toBe(CLIENT_MAX_LIMIT);
		// No key added, nothing extra serialized.
		expect(Object.keys(bounded).sort()).toEqual(['limit', 'offset', 'section_tipo']);
		expect(JSON.parse(JSON.stringify(bounded))).toEqual({
			section_tipo: ['test3'],
			limit: CLIENT_MAX_LIMIT,
			offset: bounded.offset,
		});
		// The door can still say what was asked (the notice's `requested`).
		const requestedPage = (sqoModule as unknown as WireApi).requestedPage;
		expect(typeof requestedPage).toBe('function');
		expect(requestedPage?.(bounded)).toEqual({ limit: 'all', offset: 1e21 });
	});
});
