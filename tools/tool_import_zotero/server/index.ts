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
import { DedaloError, ok } from '../../../src/core/errors/index.ts';
import { stagingDir } from '../../../src/core/media/ingest/add_file.ts';
import { resolveStagedName } from '../../../src/core/media/ingest/staged_files.ts';
import { importMappedRecords, type MappedRecord } from '../../../src/core/tools/import_execute.ts';
import {
	type ToolActionContext,
	type ToolResponse,
	type ToolServerModule,
	toolRequestId,
} from '../../../src/core/tools/module.ts';
import { applyRdfMap, parseRdfXml, type RdfMapEntry } from '../../../src/core/tools/rdf_xml.ts';

/**
 * A caller fault. `message` AND `publicMessage`: import_files is
 * backgroundRunnable, and the executor records `error.message` on the job.
 */
function invalidRequest(message: string): DedaloError {
	return new DedaloError('request.invalid_options', { message, publicMessage: message });
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
	const o = ctx.options;
	const sectionTipo = String(o.section_tipo ?? '');
	const filesData = (o.files_data ?? []) as { name?: string; tmp_name?: string | null }[];
	if (sectionTipo === '' || filesData.length === 0) {
		throw invalidRequest('Missing section_tipo or files_data');
	}
	const map = readFieldMap(o.tool_config);
	if (map.length === 0) {
		throw invalidRequest('Missing Zotero field-map (tool_config.config.main)');
	}

	// key_dir is TOP-LEVEL and server-sanitized; the dir is rebuilt from the
	// CURRENT user id, so no payload can reach another user's staged uploads.
	const dir = stagingDir(ctx.userId, String(o.key_dir ?? ''));

	const errors: string[] = [];
	const mapped: MappedRecord[] = [];
	for (const file of filesData) {
		// The client URI-encodes the display name (JSON/HTTP safety); decode
		// defensively, since a bare '%' is not a valid escape sequence.
		const rawName = String(file.name ?? '');
		let name: string;
		try {
			name = decodeURIComponent(rawName);
		} catch {
			name = rawName;
		}
		// PHP: the batch is filtered to .json (the Zotero export) — the other
		// dropzone entries are attachments, not records.
		if (!name.toLowerCase().endsWith('.json')) continue;
		// The staged name is SERVER-ASSIGNED (upload.ts claimStagedName), so the
		// authoritative source is the `tmp_name` this tool's client forwards per
		// entry; the legacy transform is the fallback, and it REFUSES rather than
		// guess when collision-suffixed candidates exist. The resolved path is
		// then re-confined ('..' survives the legacy transform untouched).
		let staged: string;
		try {
			staged = resolve(dir, resolveStagedName(dir, name, file.tmp_name ?? null));
		} catch (error) {
			errors.push(`${name}: ${(error as Error).message}`);
			continue;
		}
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
	// CONSUME the staging form (WC-079). See the tool_import_marc21 twin: this
	// tool's client also builds a service_tmp_section, so its scratch rows need
	// the same clear. Best effort.
	// Only when something was ACTUALLY created or updated: a run where every
	// record failed still returns result:true, and clearing on that would wipe
	// the form after writing nothing.
	if (report.created + report.updated > 0) {
		try {
			const { clearTemporalScratch } = await import(
				'../../../src/core/section/record/temporal_store.ts'
			);
			await clearTemporalScratch(ctx.userId, 'tool_import_zotero');
		} catch (error) {
			console.warn('[tool_import_zotero] scratch clear failed:', (error as Error).message);
		}
	}
	// A per-file failure never fails the batch: the summary and both failure
	// lists are PAYLOAD (`errors` = per-file parse problems, `failed` = the
	// records the write refused).
	return ok(
		{
			summary: `OK. Zotero import done. Created ${report.created}, updated ${report.updated}${report.failed.length > 0 ? `, ${report.failed.length} failed` : ''}.`,
			errors,
			created: report.created,
			updated: report.updated,
			failed: report.failed,
		},
		{ requestId: toolRequestId(ctx) },
	);
}

export const tool: ToolServerModule = {
	name: 'tool_import_zotero',
	apiActions: {
		import_files: { permission: 'tipo', minLevel: 2, handler: importFiles },
	},
	backgroundRunnable: ['import_files'],
};
