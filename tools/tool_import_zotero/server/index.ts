/**
 * tool_import_zotero server module (PHP tool_import_zotero). import_files reads
 * each staged Zotero export, applies the field-map, and imports the mapped
 * records through the shared executor (the same write path the CSV/MARC21
 * imports scratch-twin-verify).
 *
 * STAGED-FILE WIRE (PHP :167-193): the client posts `key_dir` ONCE at the TOP
 * LEVEL of options and each `files_data[]` entry carries only the
 * service_dropzone descriptor `{name, size, …}`. The staged path is therefore
 * rebuilt as `<staging root>/<ctx.userId>/<sanitized key_dir>/<staged name>` —
 * never from a client-supplied directory — and re-confined under the user's
 * staging dir (PHP sanitize_key_dir + safe_upload_target). PHP filters the
 * batch to `.json` files; other uploads (PDF attachments) are handled inline.
 *
 * (!) NOT FUNCTIONAL — ESCALATED (see the tools audit report). A Zotero export
 * is CSL-JSON (PHP: `json_decode(file_get_contents(...))`), not RDF/XML, and
 * the field-map lives in `config.map` as `{name, ddo_map:[{tipo, section_tipo}]}`
 * entries — NOT as the `{predicate, component_tipo}` pairs read below out of
 * `config.main`. With any real tool configuration `readFieldMap` returns an
 * empty map and the action refuses the batch. Re-porting the parser + the map
 * + PHP's three-priority record resolution is a rewrite, not a patch; only the
 * path-confinement half is repaired here.
 */

import { existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { stagingDir } from '../../../src/core/media/ingest/add_file.ts';
import { stagedTmpName } from '../../../src/core/media/ingest/upload.ts';
import { type MappedRecord, importMappedRecords } from '../../../src/core/tools/import_execute.ts';
import type {
	ToolActionContext,
	ToolResponse,
	ToolServerModule,
} from '../../../src/core/tools/module.ts';
import { type RdfMapEntry, applyRdfMap, parseRdfXml } from '../../../src/core/tools/rdf_xml.ts';

function fail(message: string): ToolResponse {
	return { result: false, msg: `Error. ${message}`, errors: [message] };
}

/** Read the predicate→component field-map from tool_config.config.main. */
function readFieldMap(toolConfig: unknown): RdfMapEntry[] {
	const main = (toolConfig as { config?: { main?: unknown[] } })?.config?.main;
	if (!Array.isArray(main)) return [];
	return main
		.filter((e): e is RdfMapEntry => {
			const m = e as { predicate?: unknown; component_tipo?: unknown };
			return typeof m.predicate === 'string' && typeof m.component_tipo === 'string';
		})
		.map((e) => ({ predicate: e.predicate, component_tipo: e.component_tipo }));
}

async function importFiles(ctx: ToolActionContext): Promise<ToolResponse> {
	try {
		const o = ctx.options;
		const sectionTipo = String(o.section_tipo ?? '');
		const filesData = (o.files_data ?? []) as { name?: string }[];
		if (sectionTipo === '' || filesData.length === 0)
			return fail('Missing section_tipo or files_data');
		const map = readFieldMap(o.tool_config);
		if (map.length === 0) return fail('Missing Zotero field-map (tool_config.config.main)');

		// key_dir is TOP-LEVEL and server-sanitized; the dir is rebuilt from the
		// CURRENT user id, so no payload can reach another user's staged uploads.
		const dir = stagingDir(ctx.userId, String(o.key_dir ?? ''));

		const errors: string[] = [];
		const mapped: MappedRecord[] = [];
		for (const file of filesData) {
			const name = String(file.name ?? '');
			// PHP: the batch is filtered to .json (the Zotero export) — the other
			// dropzone entries are attachments, not records.
			if (!name.toLowerCase().endsWith('.json')) continue;
			// The name goes through the SAME transform the upload receiver applied,
			// then the resolved path is re-confined ('..' survives that transform).
			const staged = resolve(dir, stagedTmpName(name));
			if (!staged.startsWith(dir + sep)) {
				errors.push(`${name}: invalid file name`);
				continue;
			}
			if (!existsSync(staged)) {
				errors.push(`${name}: staged file not found`);
				continue;
			}
			const { subjects } = parseRdfXml(await Bun.file(staged).text());
			mapped.push(...applyRdfMap(subjects, map));
		}

		const report = await importMappedRecords(mapped, sectionTipo, ctx.userId);
		return {
			result: true,
			msg: `OK. Zotero import done. Created ${report.created}, updated ${report.updated}${report.failed.length > 0 ? `, ${report.failed.length} failed` : ''}.`,
			errors,
			created: report.created,
			updated: report.updated,
			failed: report.failed,
		};
	} catch (error) {
		return fail((error as Error).message);
	}
}

export const tool: ToolServerModule = {
	name: 'tool_import_zotero',
	apiActions: {
		import_files: { permission: 'tipo', minLevel: 2, handler: importFiles },
	},
	backgroundRunnable: ['import_files'],
};
