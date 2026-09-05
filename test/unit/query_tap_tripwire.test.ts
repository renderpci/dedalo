/**
 * THE QUERY TAP CANNOT BE BYPASSED OR SILENTLY DEFEATED (OPS-13 durability).
 *
 * The behavioural half lives in `slow_query_scope_native`. This half pins the
 * three SOURCE facts that make the behavioural half possible, so the asymmetry
 * that was OPS-13 cannot grow back one branch at a time:
 *
 *  (a) NOTHING CHAINS A LAZY-QUERY METHOD on a `sql`-derived query. Bun's query
 *      object is lazy: `.simple()`, `.values()`, `.execute()` and `.raw()` are
 *      chained on it BEFORE the await. The tap awaits the query inside
 *      `observeStatement`, so such a chain would be applied to a Promise, not a
 *      query — a TypeError, not a silent wrong answer, but a break all the
 *      same. That absence is the exact assumption that makes timing the
 *      in-transaction and reserved lanes safe, and it is pinned here rather
 *      than trusted.
 *
 *  (b) EVERY BRANCH OF THE `sql` PROXY GOES THROUGH THE TAP. Each return of the
 *      `apply` and `get` traps that issues a statement — the pooled and
 *      in-transaction tagged-template calls, both `.unsafe` paths, and the
 *      wrapped reserved handle — must route through `observeStatement` (or
 *      `runOnPool`, which is the acquire gate wrapped around it). A branch that
 *      returns the executor's query directly is exactly the defect: before this
 *      change, the transaction branch and every reserved statement did, and the
 *      whole write path was unmeasured while DEDALO_SLOW_QUERY_MS reported as
 *      live. The slow-query line itself is emitted in ONE place.
 *
 *  (c) THE TAP READS ITS ARMING THROUGH readEnv, never `process.env` (S2-21),
 *      and names both armed postures.
 *
 * Each leg carries a POSITIVE CONTROL: the same detector, applied to a
 * synthetic offender, must fire.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/strip_comments.ts';
import {
	REPO_ROOT,
	WRITE_PATH_CORPUS_FLOOR,
	writePathSourceFiles,
} from '../helpers/write_path_corpus.ts';

const POSTGRES_SOURCE = readFileSync(join(REPO_ROOT, 'src/core/db/postgres.ts'), 'utf8');
const QUERY_TAP_SOURCE = readFileSync(join(REPO_ROOT, 'src/core/db/query_tap.ts'), 'utf8');

/** The lazy-query methods that must never be chained on a `sql` query. */
const LAZY_QUERY_METHODS = 'simple|values|execute|raw';

/**
 * Lazy-query chains in one file's source: a chain applied directly to a tagged
 * template (`sql`…`.values()`) or to an `.unsafe(…)` call. A `.values()` on a
 * Map or an object is preceded by an identifier, never by a backtick or an
 * `.unsafe(` call, so it is not matched.
 */
function lazyQueryChains(source: string): string[] {
	const found: string[] = [];
	const patterns = [
		new RegExp(`\`\\s*\\.(${LAZY_QUERY_METHODS})\\s*\\(`, 'g'),
		new RegExp(`\\.unsafe\\([^;\`]*\\)\\s*\\.(${LAZY_QUERY_METHODS})\\s*\\(`, 'g'),
	];
	for (const pattern of patterns) {
		for (const match of source.matchAll(pattern)) found.push(match[0]);
	}
	return found;
}

/** The brace-balanced body that starts at the first `{` after `marker`. */
function blockAfter(source: string, marker: string, what: string): string {
	const start = source.indexOf(marker);
	expect(start, `${what} was not found in postgres.ts`).toBeGreaterThan(-1);
	const bodyStart = source.indexOf('{', start);
	let depth = 0;
	for (let index = bodyStart; index < source.length; index++) {
		const char = source[index];
		if (char === '{') depth++;
		else if (char === '}') {
			depth--;
			if (depth === 0) return source.slice(bodyStart, index + 1);
		}
	}
	throw new Error(`unbalanced ${what} body in postgres.ts`);
}

/** The body of one `sql` proxy trap (`apply` / `get`). */
function trapBody(source: string, name: string): string {
	return blockAfter(source, `${name}(_target`, `the ${name} trap`);
}

/**
 * Return-expressions of a trap body that ISSUE A STATEMENT but do not route it
 * through the tap. A statement is issued by invoking the executor with a
 * tagged-template argument list, or by calling `.unsafe(`.
 */
function untappedReturns(body: string): string[] {
	const offenders: string[] = [];
	for (const chunk of body.split(/\breturn\b/).slice(1)) {
		const issuesStatement = /\(\.\.\.argumentsList\)|\.unsafe\(/.test(chunk);
		if (!issuesStatement) continue;
		if (/observeStatement\(|runOnPool\(/.test(chunk)) continue;
		offenders.push(chunk.replace(/\s+/g, ' ').slice(0, 160));
	}
	return offenders;
}

describe('(a) no lazy-query chain rides on a sql-derived query', () => {
	test('the write-path corpus is free of .simple()/.values()/.execute()/.raw() on a query', () => {
		const files = writePathSourceFiles();
		expect(
			files.length,
			'the write-path walk returned fewer files than the floor — a broken walk, not a smaller engine',
		).toBeGreaterThan(WRITE_PATH_CORPUS_FLOOR);

		const violations: string[] = [];
		for (const file of files) {
			const source = readFileSync(join(REPO_ROOT, file), 'utf8');
			for (const chain of lazyQueryChains(source)) violations.push(`${file}: ${chain}`);
		}
		expect(
			violations,
			'A lazy-query method is chained on a `sql` query. The query tap AWAITS the query inside ' +
				'observeStatement (that is what times the in-transaction and reserved lanes), so the ' +
				'chain would be applied to a Promise. Issue the statement plainly, or extend the tap ' +
				`to hand the query back unawaited: ${violations.join('; ')}`,
		).toEqual([]);
	});

	test('POSITIVE CONTROL: the detector fires on a planted chain', () => {
		expect(lazyQueryChains('const rows = await sql`SELECT 1`.values();').length).toBe(1);
		expect(lazyQueryChains("await sql.unsafe('SELECT 1', []).raw();").length).toBe(1);
		// And does NOT fire on the Map/object idiom the corpus is full of.
		expect(lazyQueryChains('for (const job of jobs.values()) {}').length).toBe(0);
	});
});

describe('(b) every proxy branch routes its statement through the tap', () => {
	test('no return of the apply/get traps issues an untapped statement', () => {
		const offenders = [
			...untappedReturns(trapBody(POSTGRES_SOURCE, 'apply')),
			...untappedReturns(trapBody(POSTGRES_SOURCE, 'get')),
		];
		expect(
			offenders,
			'A `sql` proxy branch returns the executor query WITHOUT observeStatement/runOnPool — ' +
				'that branch is unmeasured (OPS-13: it was the whole write path). Offending returns: ' +
				offenders.join(' | '),
		).toEqual([]);
	});

	test('the reserved handle is wrapped, and the reserve door refuses inside a transaction', () => {
		expect(POSTGRES_SOURCE).toContain("if (property === 'reserve') return reserveObserved;");
		expect(POSTGRES_SOURCE).toContain('function wrapReservedForTap');
		expect(
			untappedReturns(
				blockAfter(POSTGRES_SOURCE, 'function wrapReservedForTap', 'the reserved wrapper'),
			),
			'the reserved-handle wrapper issues an untapped statement',
		).toEqual([]);
		// The refusal, not a silent second connection.
		expect(POSTGRES_SOURCE).toContain('sql.reserve() was called inside an ambient transaction');
	});

	test('all three lanes are named at a call site, and the slow line is emitted ONCE', () => {
		for (const lane of ["'pooled'", "'transaction'", "'reserved'"]) {
			expect(
				POSTGRES_SOURCE.includes(`observeStatement(${lane}`) ||
					POSTGRES_SOURCE.includes(`runOnPool(`) ||
					QUERY_TAP_SOURCE.includes(lane),
				`lane ${lane} is not driven anywhere`,
			).toBe(true);
		}
		expect(POSTGRES_SOURCE).toContain("observeStatement('transaction'");
		expect(POSTGRES_SOURCE).toContain("observeStatement('reserved'");
		expect(POSTGRES_SOURCE).toContain("observeStatement('pooled'");

		const emitters = writePathSourceFiles().filter((file) =>
			readFileSync(join(REPO_ROOT, file), 'utf8').includes('[db] slow query'),
		);
		expect(
			emitters,
			'the slow-query line is emitted somewhere other than the one tap — two emitters means ' +
				'two thresholds and a lane that can drift',
		).toEqual(['src/core/db/query_tap.ts']);
	});

	test('POSITIVE CONTROL: the detector fires on a raw executor return', () => {
		const planted = `{
			const executor = activeExecutor();
			if (executor !== pool) {
				return (executor as unknown as (...args: unknown[]) => unknown)(...argumentsList);
			}
			return runOnPool(async () => pool(...argumentsList), describe);
		}`;
		expect(untappedReturns(planted).length).toBe(1);
		const plantedUnsafe = `{
			return (query: string, params?: unknown[]) => executor.unsafe(query, params as never);
		}`;
		expect(untappedReturns(plantedUnsafe).length).toBe(1);
	});
});

describe('(c) the tap reads its arming through readEnv only', () => {
	test('query_tap.ts uses readEnv and names both armed postures', () => {
		expect(QUERY_TAP_SOURCE).toContain("import { readEnv } from '../../config/env.ts';");
		expect(QUERY_TAP_SOURCE).toContain("readEnv('DEDALO_DEV_MODE')");
		expect(QUERY_TAP_SOURCE).toContain("readEnv('DEDALO_TEST_MEDIA_ROOT')");
		expect(
			/process\.env|Bun\.env|import\.meta\.env/.test(stripComments(QUERY_TAP_SOURCE)),
			'the tap reads the raw process environment — the documented precedence (process env > ' +
				'../private/.env) is exactly what readEnv exists to keep',
		).toBe(false);
	});

	test('the tap holds NO module-level mutable state (it is an ALS frame)', () => {
		// A module-level counter would bleed across concurrent requests and would
		// need a module_state_tripwire allowlist entry; the ALS frame needs none.
		const mutable = QUERY_TAP_SOURCE.split('\n').filter((line) => /^(let|var) /.test(line.trim()));
		expect(mutable, `module-level mutable state in query_tap.ts: ${mutable.join('; ')}`).toEqual(
			[],
		);
		expect(QUERY_TAP_SOURCE).toContain('new AsyncLocalStorage<QueryTapFrame>()');
	});
});
