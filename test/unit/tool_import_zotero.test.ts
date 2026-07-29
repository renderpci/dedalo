/**
 * R2 gate: tool_import_zotero — the ACTION SURFACE and the staged-file
 * confinement only.
 *
 * (!) The module's IMPORT SEMANTICS are known-broken and ESCALATED by the
 * 2026-07 tools audit, so this file deliberately does NOT pin them: a Zotero
 * export is CSL-JSON (PHP `json_decode`), not RDF/XML, and the field-map lives
 * in `config.map` as `{name, ddo_map:[…]}` entries — not as the
 * `{predicate, component_tipo}` pairs the module reads out of `config.main`.
 * With any real tool configuration the action refuses the batch. Re-porting it
 * is a rewrite; asserting the current mapping shape here would only cement it.
 *
 * What IS gated: the wire it shares with tool_import_marc21 — `key_dir` arrives
 * ONCE at the TOP LEVEL and must be server-sanitized, because the pre-audit code
 * interpolated it raw, so `key_dir:'../<other uid>'` still satisfied the
 * staging-root prefix check and let one user's import consume another user's
 * staged upload.
 */

import { describe, expect, test } from 'bun:test';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { getLoadedTool } from '../../src/core/tools/loader.ts';
import type { ToolResponse } from '../../src/core/tools/module.ts';
import { mustGet } from '../helpers/assert.ts';

const SCRATCH_USER = 987663;

/** The map shape the module accepts TODAY (see the escalation note above). */
const CURRENT_MAP_SHAPE = {
	config: {
		main: [{ predicate: 'http://purl.org/dc/elements/1.1/title', component_tipo: 'test52' }],
	},
};

async function runImport(options: Record<string, unknown>): Promise<ToolResponse> {
	const loaded = await getLoadedTool('tool_import_zotero');
	return mustGet(loaded!.module.apiActions.import_files, 'import_files').handler({
		principal: await resolvePrincipal(-1),
		userId: SCRATCH_USER,
		background: false,
		options,
	});
}

describe('tool_import_zotero module', () => {
	test('loads with import_files only, gated WRITE and backgroundRunnable', async () => {
		const loaded = await getLoadedTool('tool_import_zotero');
		expect(loaded).not.toBeNull();
		const actions = loaded!.module.apiActions;
		expect(Object.keys(actions)).toEqual(['import_files']);
		expect(mustGet(actions.import_files, 'import_files').minLevel).toBe(2);
		expect(loaded!.module.backgroundRunnable).toEqual(['import_files']);
	});

	test('refuses a batch with no field-map (the guard every real config trips)', async () => {
		const res = await runImport({
			section_tipo: 'test3',
			tool_config: { config: { map: [{ name: 'title', ddo_map: [{ tipo: 'test52' }] }] } },
			files_data: [{ name: 'zotero.json' }],
			key_dir: 'zotero_scratch',
		});
		expect(res.result).toBe(false);
		expect(res.msg).toContain('Missing Zotero field-map');
	});

	test('a traversing key_dir is REFUSED (never reaches another users staging dir)', async () => {
		const res = await runImport({
			section_tipo: 'test3',
			tool_config: CURRENT_MAP_SHAPE,
			files_data: [{ name: 'zotero.json' }],
			key_dir: `../${SCRATCH_USER}/zotero_scratch`,
		});
		expect(res.result).toBe(false);
		expect(res.msg).toContain('Unsafe path segment');
	});

	test('non-.json entries are skipped and a missing export is a per-file error', async () => {
		const res = await runImport({
			section_tipo: 'test3',
			tool_config: CURRENT_MAP_SHAPE,
			// PHP filters the dropzone batch to .json; the .pdf is an attachment.
			files_data: [{ name: 'attachment.pdf' }, { name: 'absent.json' }],
			key_dir: 'zotero_scratch',
		});
		expect(res.result).toBe(true);
		expect(res.errors).toEqual(['absent.json: staged file not found']);
	});

	test('an empty batch is refused before any filesystem work', async () => {
		const res = await runImport({ section_tipo: 'test3', files_data: [] });
		expect(res.result).toBe(false);
		expect(res.msg).toContain('Missing section_tipo or files_data');
	});
});
