/**
 * The `diffusion_langs` coherence row of the check_config maintenance widget —
 * the PURE half of it (DIFFUSION_SPEC §4.3, 2026-08-23).
 *
 * WHY THIS FILE EXISTS: `computeCheckConfig` is a fail-soft I/O probe shell
 * (COVERAGE-EXEMPT, registered in engineering/crap_coverage_exempt.json), and
 * the audit itself needs a live MariaDB publication target no gate may assume.
 * So the two decisions that are NOT I/O — how the subsystem's nested report
 * flattens into the status row, and when the dashboard card turns red — are
 * extracted into pure functions and asserted here (extract-AND-rewire, the CRAP
 * program's law: the extraction is only honest if the extracted half is gated).
 *
 * HERMETIC: no DB, no MariaDB, no ontology, no install TLD — the input is a
 * literal report built in the test.
 */

import { describe, expect, test } from 'bun:test';
import {
	type DiffusionLangCoherence,
	flattenLangCoherence,
	phantomLangCardErrors,
} from '../../src/core/area_maintenance/widgets/check_config.ts';

/** The shape the diffusion facade returns; only the walked parts matter here. */
function report(overrides: Partial<Parameters<typeof flattenLangCoherence>[0]> = {}) {
	return {
		applicable: true,
		reason: null,
		policy: ['spa', 'eng'],
		databases: [],
		phantom_langs: [],
		phantom_rows: 0,
		complete: true,
		unmarked_tables: 0,
		errors: [],
		...overrides,
	};
}

function database(...tables: { published: { lang: string }[] }[]) {
	return { tables };
}

describe('check_config diffusion_langs — flattenLangCoherence', () => {
	test('the "no MariaDB target" answer survives verbatim: applicable:false + a reason', () => {
		const row = flattenLangCoherence(
			report({ applicable: false, reason: 'no MariaDB publication target is configured' }),
		);
		expect(row.applicable).toBe(false);
		expect(row.reason).toBe('no MariaDB publication target is configured');
		expect(row.published).toEqual([]);
		expect(row.phantom).toEqual([]);
	});

	test('published langs are the union across every database and table, de-duplicated', () => {
		const row = flattenLangCoherence(
			report({
				databases: [
					database(
						{ published: [{ lang: 'lg-spa' }, { lang: 'lg-eng' }] },
						{ published: [{ lang: 'lg-spa' }] },
					),
					database({ published: [{ lang: 'lg-cat' }, { lang: 'lg-eng' }] }),
				],
			}),
		);
		expect(row.published).toEqual(['lg-spa', 'lg-eng', 'lg-cat']);
	});

	test('first-seen order is preserved — the operator reads the scan order', () => {
		const row = flattenLangCoherence(
			report({
				databases: [database({ published: [{ lang: 'b' }, { lang: 'a' }, { lang: 'b' }] })],
			}),
		);
		expect(row.published).toEqual(['b', 'a']);
	});

	test("policy / phantom / errors are COPIED, never the subsystem's own arrays", () => {
		const source = report({
			policy: ['spa'],
			phantom_langs: ['["lg-cat"'],
			errors: ['probe failed'],
		});
		const row = flattenLangCoherence(source);
		row.policy.push('mutated');
		row.phantom.push('mutated');
		row.errors.push('mutated');
		expect(source.policy).toEqual(['spa']);
		expect(source.phantom_langs).toEqual(['["lg-cat"']);
		expect(source.errors).toEqual(['probe failed']);
	});

	test('the counters the operator acts on are carried, including the deliberate narrowing', () => {
		const row = flattenLangCoherence(
			report({ phantom_langs: ['lg-xxx'], phantom_rows: 42, complete: false, unmarked_tables: 3 }),
		);
		expect(row.phantom).toEqual(['lg-xxx']);
		expect(row.phantom_rows).toBe(42);
		// complete:false ⇒ budget exhausted; unmarked_tables ⇒ tables the audit
		// refused to touch. Both must reach the row or the narrowing is silent.
		expect(row.complete).toBe(false);
		expect(row.unmarked_tables).toBe(3);
	});
});

describe('check_config diffusion_langs — phantomLangCardErrors', () => {
	const clean: DiffusionLangCoherence = {
		applicable: true,
		reason: null,
		policy: ['lg-spa'],
		published: ['lg-spa'],
		phantom: [],
		phantom_rows: 0,
		complete: true,
		unmarked_tables: 0,
		errors: [],
	};

	test('a coherent install adds NO card error', () => {
		expect(phantomLangCardErrors(clean)).toEqual([]);
	});

	test('a phantom lang colours the card and names both the langs and the row count', () => {
		const lines = phantomLangCardErrors({
			...clean,
			phantom: ['["lg-cat"', 'lg-xxx'],
			phantom_rows: 17,
		});
		// Two CAUSES => two lines: debris (`["lg-cat"`) and drift (`lg-xxx`).
		expect(lines).toHaveLength(2);
		const all = lines.join('\n');
		expect(all).toContain('["lg-cat"');
		expect(all).toContain('lg-xxx');
		expect(all).toContain('17 phantom row(s)');
	});

	// THE DATA-LOSS TRAP THIS PINS. A well-formed code is very likely a LOST
	// policy (unset DEDALO_DIFFUSION_LANGS derives a narrower set), so the rows
	// are real translations. Advising the destructive sweep there deletes them.
	test('a WELL-FORMED phantom lang never advises the destructive sweep', () => {
		const lines = phantomLangCardErrors({ ...clean, phantom: ['lg-cat'], phantom_rows: 9 });
		expect(lines).toHaveLength(1);
		expect(lines[0]).not.toContain('sweep_published_langs');
		// It must point at the POLICY instead.
		expect(lines[0]).toContain('DEDALO_DIFFUSION_LANGS');
	});

	test('MALFORMED debris does advise the sweep — nothing legitimate is stored there', () => {
		const lines = phantomLangCardErrors({ ...clean, phantom: ['["lg-cat"'], phantom_rows: 3 });
		expect(lines).toHaveLength(1);
		expect(lines[0]).toContain('sweep_published_langs');
	});

	test('the advice names a REGISTERED action — a widget never points at a missing door', async () => {
		const [line] = phantomLangCardErrors({ ...clean, phantom: ['["lg-xxx'], phantom_rows: 1 });
		expect(line).toContain('sweep_published_langs');
		// Not a string match against a doc: the handler map itself must hold it.
		const handlers = await import('../../src/core/api/handlers/dd_diffusion_api.ts');
		const registered = Object.keys(handlers.diffusionApiActions);
		expect(registered).toContain('sweep_published_langs');
	});
});
