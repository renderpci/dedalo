/**
 * TRIPWIRE — Dédalo NEVER writes to an external service, and never writes a
 * remote value into a matrix record or into dd_ontology. The only curated thing
 * that IS written is the CALLER's locator (2026-08-06,
 * WC-2026-08-06-external-write-refusal).
 *
 * WHY THIS IS A GATE AND NOT A COMMENT. The subsystem is one-directional by
 * DESIGN, not by accident of what has been built so far: an external record is
 * SOMEBODY ELSE'S. Every path that could turn it into a local write is cheap to
 * open and expensive to notice — an `importConform` facet added for symmetry, a
 * Time Machine restore that "puts the value back", a delete_data pass that
 * "empties" a column that never held anything, an adapter that gains a
 * `buildDeleteRequest`. None of those would fail a test today; all of them would
 * either fossilize a stale remote answer into a column the read path never
 * consults, or mutate a third party's catalogue from a cataloguing action.
 *
 * FIVE AXES, in the order a write would have to get through:
 *   1. IMPORT      — a derived model declares no `importConform`, and the cell
 *                    is refused per cell (the facet's absence is the refusal).
 *   2. SAVE        — `saveComponentData` throws `ExternalWriteRefused` for any
 *                    model whose emission is owned by the external hook.
 *   3. DELETE      — `component_external` stays in `EXCLUDED_EMPTY_MODELS`.
 *   4. SUBSYSTEM   — no module under `src/external/**` can reach the write
 *                    layer at all: no `matrix_write` / `json_codec` / `core/db`
 *                    import, no DML, no `matrix_*` or `dd_ontology` table name.
 *   5. OUTBOUND    — no adapter method can EXPRESS a remote mutation: the
 *                    descriptor has exactly two request builders, every
 *                    registered adapter builds a read verb, and the transport
 *                    refuses anything but GET/POST before it opens a socket.
 * Plus a POSITIVE CONTROL: the caller's own locator — `{section_tipo: <an
 * external section>, section_id: '001338683'}` — still writes, with the
 * zero-padded string id intact. A refusal that also broke the one legitimate
 * write would be a regression this file must not be able to hide.
 *
 * DELIBERATE DIVERGENCE FROM v6, ledgered in the WC entry: PHP's
 * `component_external` had a `# Tool Time machine case` branch calling
 * `parent::set_dato()`. The census that licenses removing it: `matrix_time_machine`
 * holds ZERO rows for any `component_external` tipo, and the one external
 * section (`zenon1`) has zero matrix rows in any table.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { allComponentModels, getComponentModel } from '../../src/core/components/registry.ts';
import { readMatrixRecord } from '../../src/core/db/matrix.ts';
import { EXCLUDED_EMPTY_MODELS } from '../../src/core/section/record/delete_record.ts';
import {
	ExternalWriteRefused,
	saveComponentData,
} from '../../src/core/section/record/save_component.ts';
import { conformImportData } from '../../src/core/tools/import_data.ts';
import type {
	ExternalRequestSpec,
	ExternalServiceModel,
} from '../../src/external/descriptor_types.ts';
import { ExternalServiceError } from '../../src/external/errors.ts';
import { listExternalServices } from '../../src/external/registry.ts';
import { overrideExternalSettingsForTests } from '../../src/external/settings.ts';
import { fetchExternalJson } from '../../src/external/transport.ts';
import {
	extractImportSpecifiers,
	listSourceFiles,
	stripComments,
} from '../helpers/no_write_scan.ts';
import { cleanScratchRecord, createScratchRecord } from '../helpers/test_data.ts';

const EXTERNAL_ROOT = join(import.meta.dir, '../../src/external');

/** The derived family, defined by the facet — never by a model-name list. */
function derivedModels(): readonly string[] {
	return allComponentModels()
		.filter((model) => model.emitHook === 'external')
		.map((model) => model.model);
}

// ---------------------------------------------------------------------------
// 1 — IMPORT
// ---------------------------------------------------------------------------

describe('an import can never write a derived value', () => {
	test('the derived family is non-empty and declares no importConform', () => {
		const models = derivedModels();
		// A gate over an empty set asserts nothing; the family must exist.
		expect(models).toContain('component_external');
		for (const model of models) {
			expect(
				getComponentModel(model)?.importConform,
				`${model} derives its value from a remote service — an import parser would give it a local slot`,
			).toBeUndefined();
		}
	});

	test('every cell shape is refused, and the refusal names the model', async () => {
		for (const model of derivedModels()) {
			// Flat, JSON and EMPTY — the three shapes a column map can produce.
			for (const cell of ['Casana, Jesse', '[{"value":"x"}]', '']) {
				const outcome = await conformImportData({
					model,
					importValue: cell,
					columnName: 'authors',
					sectionTipo: 'test3',
					sectionId: 1,
					componentTipo: 'test215',
				});
				expect(outcome.result, `${model} must not conform cell '${cell}'`).toBeNull();
				expect(outcome.errors.length).toBeGreaterThan(0);
				expect(outcome.errors[0]?.msg).toContain(model);
			}
		}
	});
});

// ---------------------------------------------------------------------------
// 2 — SAVE
// ---------------------------------------------------------------------------

describe('the save door refuses a derived component', () => {
	// test215 is the installation's second component_external node (section
	// test3, which carries properties.api_config) and it exists in the suite
	// database — the zenon* ontology does not.
	test('saveComponentData throws ExternalWriteRefused, naming the tipo', async () => {
		const attempt = saveComponentData({
			componentTipo: 'test215',
			sectionTipo: 'test3',
			sectionId: 1,
			lang: 'lg-nolan',
			changedData: [{ action: 'set_data', value: [{ id: 1, value: 'forged' }] }],
			userId: -1,
		});
		await expect(attempt).rejects.toThrow(ExternalWriteRefused);
		await attempt.catch((error: unknown) => {
			expect(error).toBeInstanceOf(ExternalWriteRefused);
			const refusal = error as ExternalWriteRefused;
			expect(refusal.componentTipo).toBe('test215');
			expect(refusal.model).toBe('component_external');
			// It THROWS rather than answering ok:false: there is no slot on disk,
			// which is a caller contract violation, not a read-only record.
			expect(refusal.message).toContain('DERIVED');
		});
	});

	test('the refusal wrote nothing — the record is untouched', async () => {
		const record = await readMatrixRecord('matrix', 'test3', 1);
		const relation = (record?.columns.relation ?? {}) as Record<string, unknown>;
		expect(Object.hasOwn(relation, 'test215')).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// 3 — DELETE
// ---------------------------------------------------------------------------

describe('delete_data never empties a derived component', () => {
	test('every derived model is in EXCLUDED_EMPTY_MODELS', () => {
		for (const model of derivedModels()) {
			expect(EXCLUDED_EMPTY_MODELS.has(model), `${model} must be excluded from delete_data`).toBe(
				true,
			);
		}
	});
});

// ---------------------------------------------------------------------------
// 4 — SUBSYSTEM CONFINEMENT
// ---------------------------------------------------------------------------

/** Import specifiers that would hand src/external a way to change stored state. */
const FORBIDDEN_SPECIFIERS: readonly string[] = [
	'matrix_write',
	'json_codec',
	'core/db/', // the whole write layer, not just its two hottest modules
	'section/record/',
	'relations/save',
	'ontology_write',
	'ontology_state',
];

/** Stored-state names and statements that would be a write with no telling import. */
const FORBIDDEN_SOURCE: readonly RegExp[] = [
	/\bmatrix(?:_[a-z_]+)?\b(?=[^a-zA-Z_])/i, // matrix, matrix_test, matrix_time_machine…
	/\bdd_ontology\b/i,
	/\bINSERT\s+INTO\b/i,
	/\bUPDATE\s+[a-z_]+\s+SET\b/i,
	/\bDELETE\s+FROM\b/i,
	/\bsql\b\s*[.`(]/, // any handle on the SQL client
	/\bwithTransaction\s*\(/,
];

describe('src/external cannot reach stored state', () => {
	const files = listSourceFiles(EXTERNAL_ROOT);

	test('the scan actually sees the subsystem', () => {
		expect(files.length).toBeGreaterThan(8);
		expect(files).toContain('transport.ts');
		expect(files).toContain('services/zenon.ts');
	});

	test('no module imports the write layer', () => {
		const violations: string[] = [];
		for (const relative of files) {
			const source = readFileSync(join(EXTERNAL_ROOT, relative), 'utf8');
			for (const specifier of extractImportSpecifiers(source)) {
				for (const forbidden of FORBIDDEN_SPECIFIERS) {
					if (specifier.includes(forbidden)) {
						violations.push(`src/external/${relative} imports '${specifier}'`);
					}
				}
			}
		}
		expect(violations).toEqual([]);
	});

	test('no module names a matrix_* / dd_ontology table, or holds any DML', () => {
		const violations: string[] = [];
		for (const relative of files) {
			// Comments are PROSE ABOUT the rule (this subsystem explains itself at
			// length, and cites matrix_time_machine while doing so); scan CODE only.
			const code = stripComments(readFileSync(join(EXTERNAL_ROOT, relative), 'utf8'));
			for (const pattern of FORBIDDEN_SOURCE) {
				const hit = pattern.exec(code);
				if (hit !== null) violations.push(`src/external/${relative}: '${hit[0].trim()}'`);
			}
		}
		expect(violations).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// 5 — OUTBOUND: no adapter method can express a mutation
// ---------------------------------------------------------------------------

describe('the adapter contract cannot express a remote mutation', () => {
	test('the descriptor declares exactly two request builders', () => {
		const source = stripComments(readFileSync(join(EXTERNAL_ROOT, 'descriptor_types.ts'), 'utf8'));
		const builders = [
			...source.matchAll(/^\s*(\w+)\??\s*\([^)]*\)\s*:\s*ExternalRequestSpec\s*;/gm),
		].map((match) => match[1]);
		expect(builders.sort()).toEqual(['buildRecordRequest', 'buildSearchRequest']);
		// And the spec's own method field admits only the two read verbs.
		expect(source).toContain("readonly method: 'GET' | 'POST';");
	});

	test('every registered adapter builds a read verb', () => {
		const services = listExternalServices();
		expect(services.length).toBeGreaterThan(0);
		for (const model of services) {
			const record = model.buildRecordRequest({
				apiUrl: 'https://zenon.dainst.org/api/v1/record',
				remoteId: '001338683',
				dataLang: 'lg-eng',
				remoteFields: ['id', 'title'],
			});
			expect(['GET', 'POST'], `${model.service} buildRecordRequest`).toContain(record.method);
			if (model.buildSearchRequest === undefined) continue;
			const search = model.buildSearchRequest({
				apiUrlSearch: 'https://zenon.dainst.org/api/v1/search',
				terms: ['casana'],
				dataLang: 'lg-eng',
				remoteFields: ['id'],
				limit: 10,
				offset: 0,
			});
			expect(['GET', 'POST'], `${model.service} buildSearchRequest`).toContain(search.method);
		}
	});

	test('the transport refuses a mutating verb BEFORE it opens a socket', async () => {
		const base = listExternalServices()[0];
		expect(base).toBeDefined();
		// A forged adapter: the TYPE says GET|POST, but a descriptor is data, so
		// the runtime guard is what actually holds. The cast IS the attack.
		const forged: ExternalServiceModel = {
			...(base as ExternalServiceModel),
			buildRecordRequest: () =>
				({
					url: 'https://zenon.dainst.org/api/v1/record?id=001338683',
					method: 'DELETE',
				}) as unknown as ExternalRequestSpec,
		};
		let sockets = 0;
		overrideExternalSettingsForTests({
			enabled: true,
			allowedHosts: ['zenon.dainst.org'],
			retryAttempts: 0,
		});
		try {
			const attempt = fetchExternalJson({
				model: forged,
				request: forged.buildRecordRequest({
					apiUrl: 'https://zenon.dainst.org/api/v1/record',
					remoteId: '001338683',
					dataLang: 'lg-eng',
					remoteFields: ['id'],
				}),
				sectionTipo: 'test3',
				remoteId: '001338683',
				deps: {
					fetchImpl: async () => {
						sockets++;
						return new Response('{}', { status: 200 });
					},
					assertPublicUrlImpl: async (uri: string) => ({
						url: new URL(uri),
						addresses: ['141.100.1.1'],
					}),
				},
			});
			await expect(attempt).rejects.toThrow(ExternalServiceError);
			await attempt.catch((error: unknown) => {
				expect((error as ExternalServiceError).kind).toBe('bad_config');
				// Disclosure rule: origin only, never the query string.
				expect((error as ExternalServiceError).message).not.toContain('001338683?');
			});
			expect(sockets, 'no socket may be opened for a mutating verb').toBe(0);
		} finally {
			overrideExternalSettingsForTests(null);
		}
	});
});

// ---------------------------------------------------------------------------
// POSITIVE CONTROL — the CALLER's locator still writes
// ---------------------------------------------------------------------------

describe('the one curated write still works', () => {
	// The rsc368 shape, on the playground: an ordinary relation component whose
	// locator points at an EXTERNAL section (test3 carries properties.api_config)
	// with a zero-padded remote id as its section_id.
	const SECTION_TIPO = 'test2';
	const SECTION_ID = 900042;
	const RELATION_TIPO = 'numisdata434';
	const REMOTE_ID = '001338683';

	const cleanup = (): Promise<void> => cleanScratchRecord(SECTION_TIPO, SECTION_ID);

	beforeAll(async () => {
		await cleanup();
		await createScratchRecord(SECTION_TIPO, SECTION_ID, { relation: { [RELATION_TIPO]: [] } });
	});
	afterAll(cleanup);

	test('a locator at an external section saves, id byte-identical', async () => {
		const saved = await saveComponentData({
			componentTipo: RELATION_TIPO,
			sectionTipo: SECTION_TIPO,
			sectionId: SECTION_ID,
			lang: 'lg-nolan',
			changedData: [
				{
					action: 'insert',
					value: {
						type: 'dd53',
						section_tipo: 'test3',
						section_id: REMOTE_ID,
						from_component_tipo: RELATION_TIPO,
					},
				},
			],
			userId: -1,
		});
		expect(saved.ok).toBe(true);

		const record = await readMatrixRecord('matrix_test', SECTION_TIPO, SECTION_ID);
		const items = (record?.columns.relation as Record<string, { section_id: unknown }[]>)?.[
			RELATION_TIPO
		];
		expect(items?.length).toBe(1);
		// Never Number()-ed: the leading zeros ARE the remote id.
		expect(items?.[0]?.section_id).toBe(REMOTE_ID);
	});
});
