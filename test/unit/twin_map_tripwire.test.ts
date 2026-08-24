/**
 * THE DEC-14b TWIN MAP IS ENFORCED, not merely written down.
 *
 * WHY THIS GATE EXISTS. When a corpus-bound parity differential is retired for a
 * generic-`test`-TLD twin, the claim "this twin covers that contract" was recorded
 * ONLY as prose in `engineering/ORACLE_HARVEST.md` — across three tables with
 * three different column grammars, which NOTHING in the repo has ever read.
 * Measured 2026-08-24: the repo parses `TRIPWIRES.md`, `TOOLS_SPEC.md` and
 * `wire_contract/`, but never that map. So a twin could name a gate that no
 * longer exists, a retired gate could lose its twin, and the map would go on
 * asserting coverage that nobody was checking.
 *
 * WHAT IT ASSERTS (all of it derived from the tree, never from the prose):
 *  1. TOTALITY — a `test/unit/**` header naming a `test/parity/….test.ts` file
 *     must carry `@twin-of`, or sit in NOT_A_TWIN with a written reason. Keyed on
 *     the PATH, never the word "twin", which is overloaded here (`scratch twin`,
 *     `install twin`, `write twin`).
 *  2. STATUS HONESTY — `@twin-status` must equal what the tree says: `retired`
 *     (the gate is gone), `frozen-record` (it survives WITH frozen reds) or
 *     `supplement` (it survives GREEN). A header that claims otherwise is red.
 *  3. BACK-LINKS — a surviving gate must `@twinned-by` its twin, so the relation
 *     is discoverable from both ends.
 *  4. THE RATCHET — `unmapped_reds` (parity files with frozen reds and no twin)
 *     is SHRINK-ONLY, per file and per test count.
 *
 * NOT ASSERTED, deliberately: `@twin-covers` and `@twin-fixture`. They were
 * designed for the mutation-fidelity harness, nothing consumes them yet, and a
 * gate demanding a field nobody can populate correctly is how a map fills up with
 * decorative claims. They arrive with the harness that reads them.
 *
 * The measurement lives in ONE place — `scripts/lib/twin_census.ts` — shared with
 * `scripts/twin_map.ts`, so the generator and this gate cannot disagree.
 *
 * HERMETIC: filesystem reads of tracked test source + two engineering/*.json.
 */

import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
	derivedStatus,
	filesNamingAParityGate,
	parseBackLinks,
	parseTwins,
	REPO_ROOT,
	redFilesFromBaseline,
} from '../../scripts/lib/twin_census.ts';
import { buildMap, drift, loadMap, NOT_A_TWIN } from '../../scripts/twin_map.ts';

describe('twin map tripwire', () => {
	test('the frozen map agrees with the tree (no drift)', () => {
		expect(drift(buildMap(), loadMap())).toEqual([]);
	});

	test('every twin names a target, and a non-retired target still exists', () => {
		for (const t of parseTwins()) {
			expect(t.target, `${t.file}: empty @twin-of`).toMatch(/^test\/parity\/.+\.test\.ts$/);
			if (t.status === 'retired') continue;
			expect(
				existsSync(join(REPO_ROOT, t.target)),
				`${t.file} is @twin-status ${t.status} but ${t.target} does not exist — it is retired`,
			).toBe(true);
		}
	});

	test('@twin-status matches what the tree says, never what the header wishes', () => {
		const redSet = new Set(redFilesFromBaseline().keys());
		for (const t of parseTwins()) {
			expect(t.status, `${t.file} (${t.target})`).toBe(derivedStatus(t.target, redSet));
		}
	});

	test('TOTALITY: naming a parity gate means @twin-of or a NOT_A_TWIN reason', () => {
		const declared = new Set(parseTwins().map((t) => t.file));
		const uncovered = filesNamingAParityGate().filter(
			(f) => !declared.has(f) && !NOT_A_TWIN.has(f),
		);
		expect(
			uncovered,
			'a unit gate naming a parity gate is either its twin (add @twin-of) or is not ' +
				'(add it to NOT_A_TWIN with the reason)',
		).toEqual([]);

		// Stale allowlist entries are red in both directions.
		const population = filesNamingAParityGate();
		for (const f of NOT_A_TWIN.keys()) {
			expect(population.includes(f), `NOT_A_TWIN lists ${f}, which names no parity gate`).toBe(
				true,
			);
			expect(declared.has(f), `NOT_A_TWIN lists ${f}, which now declares @twin-of`).toBe(false);
		}
	});

	test('a surviving parity gate back-links its twin', () => {
		const links = parseBackLinks();
		for (const t of parseTwins()) {
			if (!existsSync(join(REPO_ROOT, t.target))) continue;
			expect(
				links.get(t.target) ?? [],
				`${t.target} survives and must carry @twinned-by ${t.file}`,
			).toContain(t.file);
		}
	});

	test('ANTI-VACUITY: the census actually parses a corpus', () => {
		const twins = parseTwins();
		// Measured 2026-08-24: 41 twins (26 retired / 7 frozen-record / 8 supplement),
		// 12 back-linked surviving gates, 23 unmapped red files / 54 tests.
		expect(twins.length).toBeGreaterThanOrEqual(35);
		expect(parseBackLinks().size).toBeGreaterThanOrEqual(10);
		expect(filesNamingAParityGate().length).toBeGreaterThanOrEqual(40);
		// All three statuses must be represented, or the derivation has collapsed
		// to a constant and rules 2 and 4 stop discriminating.
		for (const s of ['retired', 'frozen-record', 'supplement']) {
			expect(
				twins.some((t) => t.status === s),
				`no twin has status ${s}`,
			).toBe(true);
		}
	});
});
