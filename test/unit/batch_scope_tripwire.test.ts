/**
 * TRIPWIRE — a batch action takes its scope from the REQUEST, or refuses
 * (P2-21; the rule TOOLS_SPEC calls its heaviest heritage-integrity rule).
 *
 * "An absent scope parameter must never widen into 'every record of the
 * section'." That default has produced two runaways:
 *   - `tool_update_cache` swept a 438k-record section the client displayed as
 *     "Records: 1" (2026-07-19, WC-043);
 *   - `tool_ontology::set_records_in_dd_ontology` rewrote whole sections —
 *     12,172 records across the audited install — where PHP had failed CLOSED
 *     (2026-07-28, WC-058).
 *
 * The rule held in every handler at the time of the audit and was enforced by
 * two per-tool behavioural tests, one for each tool that had ALREADY caused an
 * incident, neither a registered tripwire. So the rule was protected exactly
 * where it had already been broken and nowhere else — which is not a rule, it
 * is two scars.
 *
 * CENSUS: TOTAL over tool server modules that read an SQO off the request,
 * derived from the tree, with ENUMERATED exemptions.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Glob } from 'bun';

const REPO_ROOT = join(import.meta.dir, '..', '..');

/** Reading a scope off the incoming request — the shape the rule is about. */
const READS_REQUEST_SQO = /(?:ctx|context|request|payload)\.options\.sqo\b|\boptions\.sqo\b/;

/**
 * A refusal: the handler rejects an absent/malformed scope instead of falling
 * back to the whole section. Matched on the GUARD, not on its wording — the two
 * fixed handlers phrase their messages quite differently.
 */
const REFUSES_ABSENT_SCOPE = [
	// A GUARD EXPRESSION, never the error MESSAGE. Matching the message text let a
	// disabled guard pass: neutering `if (sqoRaw === null || …)` to `if (false)`
	// leaves the string 'sqo is required' sitting in the throw, and the gate went
	// green over a handler that had just lost its refusal. Measured.
	/sqoRaw\s*==\s*null/,
	/sqoRaw\s*===\s*(?:null|undefined)/,
	/typeof\s+sqoRaw\s*!==\s*'object'/,
	/sqoRaw\s*===\s*undefined\s*\|\|/,
];

/**
 * Handlers that read a request SQO but are NOT batch writers. Each says why —
 * a bare allowlist is what "never silently narrow scope" forbids.
 */
const EXEMPT: Record<string, string> = {
	'tools/tool_export/server/tool_export.ts':
		'A READ. It reads sqo.section_tipo only to ASSERT level >= 1 on every section the ' +
		'export would touch — the scope is the permission question here, not a write target. ' +
		'Widening it cannot corrupt a record; it is gated by export_gate_b_native.',
	'tools/tool_export/server/index.ts':
		'Same tool, same read path — the module names options.sqo in its header prose ' +
		'describing the permission assertion above, and performs no batch write of its own.',
	'tools/tool_identify/server/index.ts':
		'A READ (clustering). An absent sqo DOES widen to the named sections in ' +
		'src/core/identify/record_pool.ts, but the pool is bounded by an explicit cap ' +
		'(DEFAULT_CLUSTER_POOL_CAP, clamped to MAX_CAP) and the run writes nothing back to ' +
		"the records it reads. The scope that matters there is the CALLER's sectionTipos, " +
		'which record_pool re-stamps onto the sanitized SQO so a client cannot widen it.',
};

function handlerFiles(): { file: string; body: string }[] {
	const found: { file: string; body: string }[] = [];
	for (const match of new Glob('*/server/**/*.ts').scanSync({ cwd: join(REPO_ROOT, 'tools') })) {
		const file = `tools/${match}`;
		if (file.includes('.test.')) continue;
		const body = readFileSync(join(REPO_ROOT, file), 'utf8');
		if (READS_REQUEST_SQO.test(body)) found.push({ file, body });
	}
	return found.sort((a, b) => a.file.localeCompare(b.file));
}

describe('a batch action takes its scope from the request, or refuses', () => {
	const handlers = handlerFiles();

	test('the census finds the handlers (anti-vacuity)', () => {
		// Derived from the tree: a glob that matched nothing would make the rule
		// below pass while policing zero handlers.
		expect(handlers.length).toBeGreaterThanOrEqual(5);
		// The two tools whose runaways wrote this rule must be IN the census.
		const files = handlers.map((entry) => entry.file);
		expect(files).toContain('tools/tool_update_cache/server/index.ts');
		expect(files).toContain('tools/tool_ontology/server/tool_ontology.ts');
	});

	test('every batch-write handler refuses an absent scope', () => {
		const offenders = handlers
			.filter((entry) => EXEMPT[entry.file] === undefined)
			.filter((entry) => !REFUSES_ABSENT_SCOPE.some((pattern) => pattern.test(entry.body)))
			.map((entry) => entry.file);
		expect(
			offenders,
			'A handler that reads a request SQO must REFUSE when it is absent or malformed — ' +
				'never fall back to every record of the section. That default swept a 438k-record ' +
				'section the client showed as "Records: 1". Add the guard, or add the file to ' +
				`EXEMPT with the reason it is not a batch write.\n  ${offenders.join('\n  ')}`,
		).toEqual([]);
	});

	test('every exemption is still earned', () => {
		for (const [file, reason] of Object.entries(EXEMPT)) {
			expect(reason.length, `${file}: an exemption needs a real reason`).toBeGreaterThan(120);
			const body = readFileSync(join(REPO_ROOT, file), 'utf8');
			expect(
				READS_REQUEST_SQO.test(body),
				`${file} no longer reads a request SQO — DELETE its exemption`,
			).toBe(true);
			// An exempt READ that grows a write verb is no longer a read.
			expect(
				/\b(saveComponentData|updateMatrixKeyData|recordTimeMachine)\s*\(/.test(body),
				`${file} is exempt as a READ but now calls a write verb — re-judge the exemption`,
			).toBe(false);
		}
	});

	test('the internal full-section rebuild is opt-in and greppable', () => {
		// The one legitimate way to mean "the whole section": an INTERNAL caller
		// declares it. A request that merely omits a parameter must never reach it.
		const write = readFileSync(join(REPO_ROOT, 'src/core/ontology/ontology_write.ts'), 'utf8');
		expect(write).toContain('wholeSection');
		expect(write, 'the no-scope path must throw, not default to the whole section').toMatch(
			/no scope[\s\S]{0,200}/,
		);
	});

	test('anti-vacuity: the guard matchers fire, and a bare handler does not pass', () => {
		const guarded =
			"const sqoRaw = ctx.options.sqo;\nif (sqoRaw == null) throw invalidRequest('x');";
		expect(REFUSES_ABSENT_SCOPE.some((p) => p.test(guarded))).toBe(true);
		// The runaway shape: reads the sqo, no guard, straight to the search.
		const bare = 'const sqoRaw = ctx.options.sqo;\nconst sqo = sanitizeClientSqo(sqoRaw ?? {});';
		expect(REFUSES_ABSENT_SCOPE.some((p) => p.test(bare))).toBe(false);
		expect(READS_REQUEST_SQO.test(bare)).toBe(true);
	});
});
