/**
 * R2 gate: tool_import_marc21. The ISO 2709 parser itself is covered by
 * marc21.test.ts / marc21_map.test.ts; this file gates the TOOL — its action
 * surface, the STAGED-FILE wire (PHP prepare_import_context :218 +
 * process_marc21_file :294) and the config-map read — plus one end-to-end write
 * drive against a scratch record in the test3 playground.
 *
 * Three defects this pins (all found by the 2026-07 tools audit):
 *  1. the module read the staged path from `files_data[].tmp_name` /
 *     `files_data[].key_dir`, which the service_dropzone descriptor NEVER
 *     carries — the real client posts `key_dir` ONCE at the top level and only
 *     `{name, size, …}` per file, so every import read a directory and failed;
 *  2. key_dir was interpolated UNSANITIZED into the staging path, so
 *     `key_dir:'../<other uid>'` stayed inside the shared staging root and let
 *     one user's import consume another user's staged upload;
 *  3. the field→component bindings were read from `config.main` instead of
 *     `config.map`, so extractMarcValues matched nothing and every import wrote
 *     zero components.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from '../../src/config/config.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { getLoadedTool } from '../../src/core/tools/loader.ts';
import type { ToolResponse } from '../../src/core/tools/module.ts';
import { readMarcMap, resolveStagedFile } from '../../tools/tool_import_marc21/server/index.ts';
import { mustGet } from '../helpers/assert.ts';

const FT = '\x1e'; // field terminator
const SD = '\x1f'; // subfield delimiter
const RT = '\x1d'; // record terminator

interface FieldSpec {
	tag: string;
	value?: string;
	ind1?: string;
	ind2?: string;
	subfields?: [string, string][];
}

/** Assemble a valid ISO 2709 record from field specs (twin of marc21.test.ts). */
function buildMarc(fields: FieldSpec[]): Uint8Array {
	const bodies = fields.map((f) => {
		if (f.value !== undefined) return `${f.value}${FT}`;
		const subs = (f.subfields ?? []).map(([code, val]) => `${SD}${code}${val}`).join('');
		return `${f.ind1 ?? ' '}${f.ind2 ?? ' '}${subs}${FT}`;
	});
	let directory = '';
	let start = 0;
	for (let i = 0; i < fields.length; i++) {
		const len = new TextEncoder().encode(bodies[i] as string).length;
		directory +=
			(fields[i] as FieldSpec).tag + String(len).padStart(4, '0') + String(start).padStart(5, '0');
		start += len;
	}
	directory += FT;
	const baseAddress = 24 + directory.length;
	const data = bodies.join('') + RT;
	const recordLength = baseAddress + new TextEncoder().encode(data).length;
	const leader = `${String(recordLength).padStart(5, '0')}nam a22${String(baseAddress).padStart(5, '0')}n a4500`;
	return new TextEncoder().encode(leader + directory + data);
}

describe('tool_import_marc21 module', () => {
	test('loads with import_files only, gated WRITE and backgroundRunnable', async () => {
		const loaded = await getLoadedTool('tool_import_marc21');
		expect(loaded).not.toBeNull();
		const actions = loaded!.module.apiActions;
		expect(Object.keys(actions)).toEqual(['import_files']);
		const spec = mustGet(actions.import_files, 'import_files');
		expect(spec.minLevel).toBe(2);
		expect(loaded!.module.backgroundRunnable).toEqual(['import_files']);
	});
});

describe('resolveStagedFile (the staged-name confinement)', () => {
	const dir = '/tmp/dedalo_staging_probe';

	test('reproduces the upload receivers name transform', () => {
		// receiveUpload wrote the file as stagedTmpName(client name): every
		// character outside [A-Za-z0-9_.-] became '_'. Reading it back with the
		// RAW client name would miss the file the client just uploaded.
		expect(resolveStagedFile(dir, 'records (1).mrc')).toBe(`${dir}/records__1_.mrc`);
		expect(resolveStagedFile(dir, 'plain.mrc')).toBe(`${dir}/plain.mrc`);
	});

	test('refuses a name that escapes the staging dir', () => {
		// '..' survives the receivers transform untouched — the confinement check
		// is what stops it, which is why it lives here and not in the transform.
		expect(resolveStagedFile(dir, '..')).toBeNull();
		// A traversal payload is reduced to its last segment (never escapes).
		expect(resolveStagedFile(dir, '../../etc/passwd.mrc')).toBe(`${dir}/passwd.mrc`);
	});
});

describe('import_files (scratch record in the test3 playground, cleaned up)', () => {
	const SCRATCH_USER = 987657;
	const SCRATCH_ID = 900301; // far outside the canonical test3 ids (1, 2, 27)
	const KEY_DIR = 'marc21_scratch';
	const MRC = 'scratch.mrc';
	const stagingRoot = resolve(
		config.media.rootPath ?? '',
		config.media.upload.tmpSubdir,
		String(SCRATCH_USER),
	);
	const stagedDir = resolve(stagingRoot, KEY_DIR);

	// The REAL authoring shape (tools/tool_import_marc21/sample_config.json):
	// bindings under `map` keyed by `tipo`; `field_to_section_id` under `main`.
	const toolConfig = {
		config: {
			main: [{ name: 'field_to_section_id', value: { field: '907', subfield: 'a' } }],
			map: [
				{ info: 'Title mention', field: '245', subfield: 'a', tipo: 'test52' },
				{ info: 'Not a binding (no field)', name: 'id', tipo: 'test162' },
			],
		},
	};

	const runImport = async (options: Record<string, unknown>): Promise<ToolResponse> => {
		const loaded = await getLoadedTool('tool_import_marc21');
		return mustGet(loaded!.module.apiActions.import_files, 'import_files').handler({
			principal: await resolvePrincipal(-1),
			userId: SCRATCH_USER,
			background: false,
			options,
		});
	};

	beforeAll(async () => {
		mkdirSync(stagedDir, { recursive: true });
		writeFileSync(
			resolve(stagedDir, MRC),
			buildMarc([
				{ tag: '907', subfields: [['a', String(SCRATCH_ID)]] },
				{ tag: '245', ind1: '1', ind2: '0', subfields: [['a', 'A MARC21 title']] },
			]),
		);
		await createSectionRecord('test3', SCRATCH_USER, new Date(), SCRATCH_ID, {
			conflictTolerant: true,
		});
	});

	afterAll(async () => {
		rmSync(stagingRoot, { recursive: true, force: true });
		await sql.unsafe(`DELETE FROM matrix_test WHERE section_tipo = 'test3' AND section_id = $1`, [
			SCRATCH_ID,
		]);
		await sql.unsafe(
			`DELETE FROM matrix_time_machine WHERE section_tipo = 'test3' AND section_id = $1`,
			[SCRATCH_ID],
		);
	});

	test('reads the TOP-LEVEL key_dir + files_data[].name and writes the mapped component', async () => {
		// The exact wire render_tool_import_marc21 posts.
		const res = await runImport({
			tipo: 'test52',
			section_tipo: 'test3',
			section_id: 1,
			tool_config: toolConfig,
			files_data: [{ name: MRC, size: 1 }],
			components_temp_data: [],
			key_dir: KEY_DIR,
		});
		expect(res.errors).toEqual([]);
		expect(res.result).toBe(true);
		// field_to_section_id (907$a) routed the record to the scratch id → UPDATE.
		expect(res.updated).toBe(1);
		expect(res.created).toBe(0);
		expect(res.failed).toEqual([]);

		const rows = (await sql.unsafe(
			`SELECT string -> 'test52' AS items
			   FROM matrix_test WHERE section_tipo = 'test3' AND section_id = $1`,
			[SCRATCH_ID],
		)) as { items: { value?: string }[] }[];
		// 245$a landed on the component the `map` entry names — the proof the
		// bindings are read from config.map, not config.main.
		expect((rows[0]?.items ?? []).map((item) => item.value)).toContain('A MARC21 title');
	});

	test('a batch with no .mrc entry imports nothing (PHP filter_marc21_files)', async () => {
		const res = await runImport({
			section_tipo: 'test3',
			tool_config: toolConfig,
			files_data: [{ name: 'notes.txt' }, { name: 'scan.pdf' }],
			key_dir: KEY_DIR,
		});
		expect(res.result).toBe(true);
		expect(res.errors).toEqual([]);
		expect(res.created).toBe(0);
		expect(res.updated).toBe(0);
	});

	test('a missing staged file is a per-file error, not a thrown batch', async () => {
		const res = await runImport({
			section_tipo: 'test3',
			tool_config: toolConfig,
			files_data: [{ name: 'absent.mrc' }],
			key_dir: KEY_DIR,
		});
		expect(res.result).toBe(true);
		expect(res.errors).toEqual(['absent.mrc: staged file not found']);
	});

	test('a traversing key_dir is REFUSED (never reaches another users staging dir)', async () => {
		// Before the fix this resolved to <staging root>/<other uid>/<file> and
		// still passed the root-prefix check, so the import consumed a file the
		// caller never uploaded.
		const res = await runImport({
			section_tipo: 'test3',
			tool_config: toolConfig,
			files_data: [{ name: MRC }],
			key_dir: `../${SCRATCH_USER}/${KEY_DIR}`,
		});
		expect(res.result).toBe(false);
		expect(res.msg).toContain('Unsafe path segment');
	});

	test('the config-map guard names config.map (an empty map refuses the batch)', async () => {
		const res = await runImport({
			section_tipo: 'test3',
			// The pre-fix shape: bindings under `main`. They are NOT bindings.
			tool_config: { config: { main: [{ name: 'code', tipo: 'test52' }] } },
			files_data: [{ name: MRC }],
			key_dir: KEY_DIR,
		});
		expect(res.result).toBe(false);
		expect(res.msg).toContain('tool_config.config.map');
	});
});

/**
 * REGRESSION GATE (2026-07-28): readMarcMap must read the shape getToolConfig
 * ACTUALLY emits.
 *
 * `{config:{main,map}}` is the AUTHORING shape in register.json /
 * sample_config.json. getToolConfig RESOLVES options flat, so a caller receives
 * `{map, info, main}` with NO `.config` wrapper (measured: getToolConfig(
 * 'tool_import_marc21') -> keys ["map","info","main"]). readMarcMap read only
 * `toolConfig.config.map`, so every real import found zero bindings and returned
 * "Missing marc21_map" — while the suite passed, because its fixture hand-built
 * the nested shape. Same class of bug as resolveTranscriberConfig /
 * resolveTranslatorConfig; same fix (flat first, nested tolerated as legacy).
 */
describe('readMarcMap reads the real getToolConfig shape', () => {
	const map = [{ info: 'Title', field: '245', subfield: 'a', tipo: 'test52' }];
	const main = [{ name: 'field_to_section_id', value: { field: '907', subfield: 'a' } }];

	test('the FLAT shape getToolConfig emits yields the bindings', () => {
		const { entries } = readMarcMap({ map, main });
		expect(entries).toHaveLength(1);
		expect(entries[0]?.component_tipo).toBe('test52');
		expect(entries[0]?.field).toBe('245');
	});

	test('the flat shape also yields the id spec from main', () => {
		const { idSpec } = readMarcMap({ map, main });
		expect(idSpec).toEqual({ field: '907', subfield: 'a' });
	});

	test('the legacy nested shape still yields the bindings (tolerated)', () => {
		expect(readMarcMap({ config: { map, main } }).entries).toHaveLength(1);
	});

	test('a config with no map at all yields no entries (fail-closed)', () => {
		expect(readMarcMap({ info: 'nothing here' }).entries).toHaveLength(0);
	});
});
