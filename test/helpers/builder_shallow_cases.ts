/**
 * The SHALLOW builder case table — every operator shape of every search
 * builder family, rendered to its raw BuilderResult (sentence + tokenValues,
 * compounds kept structural) or its thrown error.
 *
 * Consumed by `test/unit/builder_shallow_snapshot.test.ts`, which pins the
 * output against `test/fixtures/builder_shallow_snapshot.json` — the snapshot
 * captured from the builders BEFORE the deep-search classifiers landed
 * (2026-09-24). A shallow leaf's SQL is byte-identical across that change for
 * every operator EXCEPT number '!=' (WC-2026-09-29-number-not-equal), which is
 * the one named exemption in the gate.
 *
 * Contexts use the generic `test` TLD. The relation_children/relation_index
 * builders read the ontology (paired parent) and the relation-index coverage,
 * so the table is rendered on the suite database; nothing is written.
 */

import { buildDateFragment } from '../../src/core/search/builders/builder_date.ts';
import { buildIriFragment } from '../../src/core/search/builders/builder_iri.ts';
import { buildJsonFragment } from '../../src/core/search/builders/builder_json.ts';
import { buildNumberFragment } from '../../src/core/search/builders/builder_number.ts';
import {
	buildRelationFragment,
	buildRelationSearchAncestorFragment,
} from '../../src/core/search/builders/builder_relation.ts';
import { buildRelationChildrenFragment } from '../../src/core/search/builders/builder_relation_children.ts';
import { buildRelationIndexFragment } from '../../src/core/search/builders/builder_relation_index.ts';
import { buildSectionIdFragment } from '../../src/core/search/builders/builder_section_id.ts';
import { buildStringFragment } from '../../src/core/search/builders/builder_string.ts';
import type { BuilderContext, BuilderResult } from '../../src/core/search/builders/types.ts';
import { asSqlTipo } from '../../src/core/search/identifier_gate.ts';

type Rendered = { result: BuilderResult } | { error: string };

function base(overrides: Partial<BuilderContext>): BuilderContext {
	return {
		alias: 'te3',
		column: 'string',
		tipo: asSqlTipo('test52', 'test context'),
		sectionTipo: 'test3',
		table: 'matrix_test',
		lang: 'lg-spa',
		translatable: true,
		model: 'component_input_text',
		...overrides,
	};
}

async function capture(run: () => BuilderResult | Promise<BuilderResult>): Promise<Rendered> {
	try {
		return { result: await run() };
	} catch (error) {
		const code = (error as { code?: unknown }).code;
		return { error: `${String(code ?? '')}|${(error as Error).message}` };
	}
}

const TEXT_QS = [
	'',
	'NIF',
	'!*',
	'*',
	'!!',
	'!=NIF',
	'!=NIF*',
	'!=*NIF',
	'!=*NIF*',
	'==NIF',
	'=NIF',
	'=',
	'-NIF',
	"'NIF'",
	'NIF*',
	'*NIF',
	'*NIF*',
	'a+b=c',
	'ab',
	'ana lopez',
	'-ana lopez',
	'!=ana lopez',
];
const TEXT_OPS: (string | null)[] = [null, '!*', '*', '!=', '==', '-', '!!', '='];

const NUMBER_QS = [
	'',
	'5',
	'=5',
	'!=5',
	'!*',
	'*',
	'1...9',
	'>=5',
	'<=5',
	'>5',
	'<5',
	'abc',
	'5,5',
	'-3',
	'+7',
];
const NUMBER_OPS: (string | null)[] = [null, '!*', '*', '!=', '>', '='];

const SECTION_ID_QS: unknown[] = [
	'',
	'5',
	'!=5',
	'>=5',
	'<=5',
	'>5',
	'<5',
	'1...9',
	'1,2,3',
	'abc',
	'!=',
	{ section_id: '7' },
];
const SECTION_ID_OPS: (string | null)[] = [null, '!=', '>', '='];

const DATE_QS: unknown[] = [
	null,
	'2020',
	'2020-05-03',
	'>2020',
	'<=2020-05',
	'=2020',
	'garbage',
	{ start: { year: 2020, month: 5, day: 3 } },
	{ start: { year: 2020 }, end: { year: 2021 } },
	{ period: { year: 3, month: 2 } },
	{ start: { hour: 10, minute: 5 } },
];
const DATE_OPS: (string | null)[] = [null, '!*', '*', '=', '<', '>', '<=', '>=', '!='];
const DATE_MODES = [undefined, 'date', 'range', 'period', 'time', 'date_time', 'bogus'];

const LOCATOR = {
	section_tipo: 'test3',
	section_id: '5',
	from_component_tipo: 'test80',
	type: 'dd151',
};
const RELATION_QS: unknown[] = [
	null,
	'',
	'only_operator',
	LOCATOR,
	[LOCATOR],
	[LOCATOR, { section_tipo: 'test3', section_id: 6 }],
	JSON.stringify(LOCATOR),
	'!*',
	{ ...LOCATOR, id: 9 },
];
const RELATION_OPS: (string | null)[] = [null, '', '!*', '*', '!=', '!==', '=='];

/** Every case, keyed by a stable, human-readable id. */
export async function renderShallowBuilderCases(): Promise<Record<string, Rendered>> {
	const out: Record<string, Rendered> = {};
	const put = async (key: string, run: () => BuilderResult | Promise<BuilderResult>) => {
		if (key in out) throw new Error(`duplicate builder case ${key}`);
		out[key] = await capture(run);
	};

	const stringContexts: Record<string, BuilderContext> = {
		spa: base({}),
		all: base({ lang: 'all' }),
		nolan_nontr: base({ lang: 'lg-spa', translatable: false }),
		all_store: base({ lang: 'all', searchStoreCovered: true }),
		spa_store: base({ searchStoreCovered: true }),
	};
	for (const [ctxName, ctx] of Object.entries(stringContexts)) {
		for (const op of TEXT_OPS) {
			for (const q of TEXT_QS) {
				for (const split of [false, true]) {
					await put(`string|${ctxName}|${op}|${q}|${split}`, () =>
						buildStringFragment(q, op, split, ctx),
					);
				}
			}
		}
		await put(`string|${ctxName}|array-q`, () =>
			buildStringFragment([{ value: 'NIF' }], null, false, ctx),
		);
	}

	for (const [ctxName, ctx] of Object.entries({
		spa: base({ column: 'iri', model: 'component_iri' }),
		all: base({ column: 'iri', model: 'component_iri', lang: 'all' }),
	})) {
		for (const op of TEXT_OPS) {
			for (const q of TEXT_QS) {
				await put(`iri|${ctxName}|${op}|${q}`, () => buildIriFragment(q, op, ctx));
			}
		}
	}

	const jsonCtx = base({
		column: 'misc',
		model: 'component_json',
		lang: 'lg-nolan',
		translatable: false,
	});
	for (const op of TEXT_OPS) {
		for (const q of TEXT_QS) {
			await put(`json|${op}|${q}`, () => buildJsonFragment(q, op, jsonCtx));
		}
	}

	const numberCtx = base({
		column: 'number',
		model: 'component_number',
		lang: 'lg-nolan',
		translatable: false,
	});
	for (const op of NUMBER_OPS) {
		for (const q of NUMBER_QS) {
			await put(`number|${op}|${q}`, () => buildNumberFragment(q, op, numberCtx));
		}
	}

	const sectionIdCtx = base({
		column: 'section_id',
		model: 'component_section_id',
		lang: 'lg-nolan',
	});
	for (const op of SECTION_ID_OPS) {
		for (const q of SECTION_ID_QS) {
			await put(`section_id|${op}|${JSON.stringify(q)}`, () =>
				buildSectionIdFragment(q, op, sectionIdCtx),
			);
		}
	}

	for (const mode of DATE_MODES) {
		for (const table of ['matrix_test', 'matrix_time_machine']) {
			const ctx = base({
				column: 'date',
				model: 'component_date',
				lang: 'lg-nolan',
				dateMode: mode,
				table,
			});
			for (const op of DATE_OPS) {
				for (const q of DATE_QS) {
					await put(`date|${mode}|${table}|${op}|${JSON.stringify(q)}`, () =>
						buildDateFragment(q, op, ctx),
					);
				}
			}
		}
	}

	const relationContexts: Record<string, BuilderContext> = {
		plain: base({
			column: 'relation',
			tipo: asSqlTipo('test80', 'test context'),
			model: 'component_portal',
			lang: 'lg-nolan',
		}),
		tm: base({
			column: 'relation',
			tipo: asSqlTipo('dd578', 'test context'),
			sectionTipo: 'dd15',
			table: 'matrix_time_machine',
			model: 'component_portal',
			lang: 'lg-nolan',
		}),
		activity: base({
			alias: 'ma',
			column: 'relation',
			tipo: asSqlTipo('dd543', 'test context'),
			sectionTipo: 'dd542',
			table: 'matrix_activity',
			model: 'component_portal',
			lang: 'lg-nolan',
		}),
	};
	for (const [ctxName, ctx] of Object.entries(relationContexts)) {
		for (const op of RELATION_OPS) {
			for (const q of RELATION_QS) {
				await put(`relation|${ctxName}|${op}|${JSON.stringify(q)}`, () =>
					buildRelationFragment(q, op, ctx),
				);
				if (ctxName === 'plain') {
					await put(`relation_ancestor|${op}|${JSON.stringify(q)}`, () =>
						buildRelationSearchAncestorFragment(q, op, {
							...ctx,
							model: 'component_autocomplete_hi',
						}),
					);
				}
			}
		}
	}

	const childrenCtx = base({
		column: 'relation',
		tipo: asSqlTipo('test201', 'test context'),
		model: 'component_relation_children',
		lang: 'lg-nolan',
	});
	for (const op of RELATION_OPS) {
		for (const q of RELATION_QS) {
			await put(`relation_children|${op}|${JSON.stringify(q)}`, () =>
				buildRelationChildrenFragment(q, op, childrenCtx),
			);
		}
	}
	await put('relation_children|tm', () =>
		buildRelationChildrenFragment(null, '*', { ...childrenCtx, table: 'matrix_time_machine' }),
	);

	const indexCtx = base({
		column: 'relation',
		tipo: asSqlTipo('test25', 'test context'),
		model: 'component_relation_index',
		lang: 'lg-nolan',
	});
	for (const op of RELATION_OPS) {
		await put(`relation_index|${op}`, () => buildRelationIndexFragment(null, op, indexCtx));
	}
	await put('relation_index|nosection', () =>
		buildRelationIndexFragment(null, '*', { ...indexCtx, sectionTipo: '' }),
	);
	await put('relation_index|tm', () =>
		buildRelationIndexFragment(null, '*', { ...indexCtx, table: 'matrix_time_machine' }),
	);

	return out;
}

/** The ONE shallow change the deep-search rebuild makes (WC-2026-09-29-number-not-equal). */
export function isNumberNotEqualCase(key: string): boolean {
	if (!key.startsWith('number|')) return false;
	const [, op, q] = key.split('|');
	const effective = (op === 'null' ? '' : (op ?? '')) + (q ?? '');
	return effective.startsWith('!=');
}
