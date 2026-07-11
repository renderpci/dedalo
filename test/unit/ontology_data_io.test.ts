/**
 * ONTOLOGY DATA IO unit gate (PHP class.ontology_data_io.php +
 * tool_ontology_parser::export_ontologies :301-409).
 *
 * Covers, WITHOUT any live psql/matrix write (the PHP export mutates the
 * shared oracle — export_ontologies is deliberately NOT in the parity suite):
 *   - COMP-06 input validation: safe_tld regex, section_tipo bare-identifier
 *     regex, and the exportToFile early reject (no side effects on bad tld);
 *   - the versioned IO dir resolution/creation (setOntologyIoPath);
 *   - the export pipeline's STRICT ordering and abort/continue semantics
 *     (stubbed five IO fns: call order, hard aborts on steps 1-2, per-TLD
 *     fail-and-continue on step 3, thrown-step full abort — PHP outer catch);
 *   - the LLM-map shape on a small injected fixture (per-section
 *     catch-and-continue skip collection).
 */

import { describe, expect, test } from 'bun:test';
import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildLlmMap } from '../../src/ai/mcp/tools/llm_map.ts';
import {
	type OntologyIoResponse,
	exportToFile,
	isSafeSectionTipo,
	safeTld,
	setOntologyIoPath,
} from '../../src/core/ontology/data_io.ts';
import type { OntologySubtreeNode } from '../../src/core/ontology/resolver.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import type { ToolActionContext } from '../../src/core/tools/module.ts';
import {
	type OntologyExportIo,
	runExportOntologies,
} from '../../tools/tool_ontology_parser/server/tool_ontology_parser.ts';

function makeContext(options: Record<string, unknown>, isDeveloper = true): ToolActionContext {
	return {
		principal: { isDeveloper } as unknown as Principal,
		userId: 77,
		options,
		background: false,
	};
}

const ok = (msg: string): OntologyIoResponse => ({ result: true, msg, errors: [] });
const fail = (msg: string, errors: string[]): OntologyIoResponse => ({
	result: false,
	msg,
	errors,
});

/** A recording stub of the five IO calls; per-call behavior overridable. */
function makeIo(calls: string[], overrides: Partial<OntologyExportIo> = {}): OntologyExportIo {
	return {
		updateOntologyInfo: async (userId) => {
			calls.push(`update_ontology_info:${userId}`);
			return true;
		},
		exportOntologyInfo: async () => {
			calls.push('export_ontology_info');
			return ok('OK. Request done');
		},
		exportToFile: async (tld) => {
			calls.push(`export_to_file:${tld}`);
			return ok(`OK. Request done: ${tld}0`);
		},
		exportPrivateListsToFile: async () => {
			calls.push('export_private_lists_to_file');
			return ok('OK. Request done');
		},
		exportLlmMap: async () => {
			calls.push('export_llm_map');
			return ok('OK. LLM map exported: 2 sections');
		},
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// COMP-06 validation
// ---------------------------------------------------------------------------

describe('COMP-06 identifier validation', () => {
	test('safeTld accepts only 2+ lowercase ascii letters', () => {
		for (const good of ['dd', 'oh', 'ontology', 'rsc']) {
			expect(safeTld(good)).toBe(true);
		}
		for (const bad of ['', 'd', 'DD', 'dd0', 'dd-x', 'dd x', "dd'", 'dd;rm -rf /', 'dd\\']) {
			expect(safeTld(bad)).toBe(false);
		}
	});

	test('isSafeSectionTipo accepts only bare identifiers', () => {
		expect(isSafeSectionTipo('dd0')).toBe(true);
		expect(isSafeSectionTipo('rsc170')).toBe(true);
		for (const bad of ["dd0'", 'dd0;--', 'dd 0', '', "dd0' TO PROGRAM"]) {
			expect(isSafeSectionTipo(bad)).toBe(false);
		}
	});

	test('exportToFile soft-rejects an invalid tld before any IO', async () => {
		for (const bad of ['DD', 'dd0', "dd'; rm -rf /", '']) {
			const response = await exportToFile(bad);
			expect(response.result).toBe(false);
			expect(response.msg).toBe(`Error. Invalid tld: ${bad}`);
			expect(response.errors).toEqual([`Invalid tld: ${bad}`]);
		}
	});
});

// ---------------------------------------------------------------------------
// setOntologyIoPath
// ---------------------------------------------------------------------------

describe('setOntologyIoPath', () => {
	test('creates and returns the versioned <base>/<major>.<minor> dir', () => {
		const base = join(tmpdir(), `dd_ontology_io_test_${process.pid}_${Date.now()}`);
		try {
			const ioPath = setOntologyIoPath(base);
			expect(ioPath).toBe(join(base, '7.0'));
			expect(existsSync(ioPath as string)).toBe(true);
			// idempotent (mkdir recursive on an existing dir)
			expect(setOntologyIoPath(base)).toBe(join(base, '7.0'));
		} finally {
			rmSync(base, { recursive: true, force: true });
		}
	});
});

// ---------------------------------------------------------------------------
// export_ontologies pipeline: ordering + abort/continue semantics
// ---------------------------------------------------------------------------

describe('runExportOntologies ordering/abort semantics (PHP :301-409)', () => {
	test('non-developer callers are refused before any IO', async () => {
		const calls: string[] = [];
		const response = await runExportOntologies(
			makeContext({ selected_ontologies: ['dd'] }, false),
			makeIo(calls),
		);
		expect(response.result).toBe(false);
		expect(response.errors).toEqual(['unauthorized']);
		expect(calls).toEqual([]);
	});

	test('empty or non-array selected_ontologies is rejected before any IO', async () => {
		const calls: string[] = [];
		for (const bad of [undefined, null, [], 'dd', 42]) {
			const response = await runExportOntologies(
				makeContext({ selected_ontologies: bad }),
				makeIo(calls),
			);
			expect(response.result).toBe(false);
			expect(response.msg).toBe('Error. Invalid or empty selected_ontologies parameter');
			expect(response.errors).toEqual(['selected_ontologies must be a non-empty array']);
		}
		expect(calls).toEqual([]);
	});

	test('happy path runs the five steps in PHP order and counts done', async () => {
		const calls: string[] = [];
		const response = await runExportOntologies(
			makeContext({ selected_ontologies: ['aa', 'bb'] }),
			makeIo(calls),
		);
		expect(calls).toEqual([
			'update_ontology_info:77',
			'export_ontology_info',
			'export_to_file:aa',
			'export_to_file:bb',
			'export_private_lists_to_file',
			'export_llm_map',
		]);
		expect(response.result).toBe(true);
		expect(response.msg).toBe('OK. Export of ontologies completed successfully. Done: 2');
		expect(response.errors).toEqual([]);
		// ar_msg: one line per TLD + private lists + llm map
		expect(response.ar_msg).toEqual([
			'OK. Request done: aa0',
			'OK. Request done: bb0',
			'OK. Request done',
			'OK. LLM map exported: 2 sections',
		]);
	});

	test('updateOntologyInfo failure HARD-aborts before any file is written', async () => {
		const calls: string[] = [];
		const response = await runExportOntologies(
			makeContext({ selected_ontologies: ['dd'] }),
			makeIo(calls, {
				updateOntologyInfo: async (userId) => {
					calls.push(`update_ontology_info:${userId}`);
					return false;
				},
			}),
		);
		expect(calls).toEqual(['update_ontology_info:77']);
		expect(response.result).toBe(false);
		expect(response.msg).toBe('Unable to update ontology information in dd1 (ontology40_1)');
		expect(response.errors).toEqual(['unable to update_ontology_info']);
	});

	test('exportOntologyInfo failure HARD-aborts before the per-TLD loop', async () => {
		const calls: string[] = [];
		const response = await runExportOntologies(
			makeContext({ selected_ontologies: ['dd'] }),
			makeIo(calls, {
				exportOntologyInfo: async () => {
					calls.push('export_ontology_info');
					return fail('Error. Request failed', ['disk full']);
				},
			}),
		);
		expect(calls).toEqual(['update_ontology_info:77', 'export_ontology_info']);
		expect(response.result).toBe(false);
		expect(response.msg).toBe('Unable to export the ontology information JSON file');
		expect(response.errors).toEqual(['unable to export ontology info JSON file']);
	});

	test('a per-TLD SOFT failure continues the loop; private lists + LLM map still run', async () => {
		const calls: string[] = [];
		const response = await runExportOntologies(
			makeContext({ selected_ontologies: ['aa', 'bb', 'cc'] }),
			makeIo(calls, {
				exportToFile: async (tld) => {
					calls.push(`export_to_file:${tld}`);
					return tld === 'bb'
						? fail(`Error. Request failed: ${tld}`, [`Invalid tld: ${tld}`])
						: ok(`OK. Request done: ${tld}0`);
				},
			}),
		);
		expect(calls).toEqual([
			'update_ontology_info:77',
			'export_ontology_info',
			'export_to_file:aa',
			'export_to_file:bb',
			'export_to_file:cc',
			'export_private_lists_to_file',
			'export_llm_map',
		]);
		expect(response.result).toBe(false);
		expect(response.msg).toBe('Errors found. Export Ontologies request failed.');
		expect(response.errors).toEqual(['Invalid tld: bb']);
		expect(response.ar_msg).toEqual([
			'OK. Request done: aa0',
			'Error. Request failed: bb',
			'OK. Request done: cc0',
			'OK. Request done',
			'OK. LLM map exported: 2 sections',
		]);
	});

	test('a THROWN step (COPY file not created) aborts everything — PHP outer catch', async () => {
		const calls: string[] = [];
		const response = await runExportOntologies(
			makeContext({ selected_ontologies: ['aa', 'bb'] }),
			makeIo(calls, {
				exportToFile: async (tld) => {
					calls.push(`export_to_file:${tld}`);
					throw new Error(`Error Processing Request. File /io/${tld}.copy.gz not created!`);
				},
			}),
		);
		// The first throw stops the loop AND the remaining steps.
		expect(calls).toEqual(['update_ontology_info:77', 'export_ontology_info', 'export_to_file:aa']);
		expect(response.result).toBe(false);
		expect(response.msg).toBe('Error. Error Processing Request. File /io/aa.copy.gz not created!');
		expect(response.errors).toEqual(['Error Processing Request. File /io/aa.copy.gz not created!']);
	});

	test('private-lists and LLM-map failures are merged but never abort', async () => {
		const calls: string[] = [];
		const response = await runExportOntologies(
			makeContext({ selected_ontologies: ['aa'] }),
			makeIo(calls, {
				exportPrivateListsToFile: async () => {
					calls.push('export_private_lists_to_file');
					return fail('Error. Request failed', ['private lists failed']);
				},
				exportLlmMap: async () => {
					calls.push('export_llm_map');
					return fail('Error. Request failed', ['llm map failed']);
				},
			}),
		);
		expect(calls).toEqual([
			'update_ontology_info:77',
			'export_ontology_info',
			'export_to_file:aa',
			'export_private_lists_to_file',
			'export_llm_map',
		]);
		expect(response.result).toBe(false);
		expect(response.errors).toEqual(['private lists failed', 'llm map failed']);
	});
});

// ---------------------------------------------------------------------------
// LLM-map shape (fixture-injected deps — no DB)
// ---------------------------------------------------------------------------

function fieldNode(tipo: string, model: string, term: Record<string, string>): OntologySubtreeNode {
	return {
		tipo,
		parent: 'zz1',
		model,
		term,
		properties: null,
		relations: null,
		orderNumber: 1,
	};
}

describe('buildLlmMap shape (PHP export_llm_map)', () => {
	test('emits {tipo,label,fields:[{tipo,label,type,target?}]} per section', async () => {
		const { map, skipped } = await buildLlmMap({
			listSectionNodes: async () => [
				{ tipo: 'zz1', term: { 'lg-eng': 'Things', 'lg-spa': 'Cosas' } },
			],
			sectionFieldNodes: async () => [
				fieldNode('zz4', 'component_input_text', { 'lg-eng': 'Title' }),
				fieldNode('zz5', 'component_portal', { 'lg-eng': 'Informant' }),
				fieldNode('zz6', 'component_date', { 'lg-eng': 'Date' }),
			],
			linkTargetSections: async (componentTipo) =>
				componentTipo === 'zz5' ? ['rsc197', 'rsc176'] : [],
		});
		expect(skipped).toEqual([]);
		expect(map).toEqual([
			{
				tipo: 'zz1',
				label: { 'lg-eng': 'Things', 'lg-spa': 'Cosas' },
				fields: [
					{ tipo: 'zz4', label: { 'lg-eng': 'Title' }, type: 'text' },
					// link field: simplified type 'link' + best-effort SINGLE target
					{ tipo: 'zz5', label: { 'lg-eng': 'Informant' }, type: 'link', target: 'rsc197' },
					{ tipo: 'zz6', label: { 'lg-eng': 'Date' }, type: 'date' },
				],
			},
		]);
		// scalar fields must NOT carry a target key at all (PHP omits it)
		expect(Object.hasOwn((map[0] as { fields: object[] }).fields[0] as object, 'target')).toBe(
			false,
		);
	});

	test('a failing section is skipped and collected; the rest still build', async () => {
		const { map, skipped } = await buildLlmMap({
			listSectionNodes: async () => [
				{ tipo: 'zz1', term: { 'lg-eng': 'Good' } },
				{ tipo: 'zz9', term: { 'lg-eng': 'Broken' } },
				{ tipo: 'zz2', term: null },
			],
			sectionFieldNodes: async (sectionTipo) => {
				if (sectionTipo === 'zz9') throw new Error('broken subtree');
				return [];
			},
			linkTargetSections: async () => [],
		});
		expect(skipped).toEqual(['zz9']);
		expect(map).toEqual([
			{ tipo: 'zz1', label: { 'lg-eng': 'Good' }, fields: [] },
			// null term → empty label object (PHP `?? new stdClass()`)
			{ tipo: 'zz2', label: {}, fields: [] },
		]);
	});

	test('unknown models fall back to type "text"', async () => {
		const { map } = await buildLlmMap({
			listSectionNodes: async () => [{ tipo: 'zz1', term: {} }],
			sectionFieldNodes: async () => [
				fieldNode('zz7', 'component_totally_new', { 'lg-eng': 'Mystery' }),
			],
			linkTargetSections: async () => [],
		});
		expect((map[0] as { fields: { type: string }[] }).fields[0]?.type).toBe('text');
	});
});
