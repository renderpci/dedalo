/**
 * tool_import_zotero server module (PHP tool_import_zotero). import_files reads the
 * staged Zotero RDF/XML export, parses it with the from-scratch RDF/XML parser
 * (rdf_xml.ts, no 3rd-party lib), applies the field-map (tool_config.config.main:
 * RDF predicate → component tipo), and imports the mapped records through the
 * shared executor (the same write path the CSV/MARC21 imports scratch-twin-verify).
 */

import { existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { config } from '../../../src/config/config.ts';
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
		const filesData = (o.files_data ?? []) as {
			name?: string;
			tmp_name?: string;
			key_dir?: string;
		}[];
		if (sectionTipo === '' || filesData.length === 0)
			return fail('Missing section_tipo or files_data');
		const map = readFieldMap(o.tool_config);
		if (map.length === 0) return fail('Missing Zotero field-map (tool_config.config.main)');

		const root = config.media.rootPath;
		if (root === null) throw new Error('media root is not configured');
		const stagingBase = resolve(root, config.media.upload.tmpSubdir);

		const errors: string[] = [];
		const mapped: MappedRecord[] = [];
		for (const file of filesData) {
			const staged = resolve(
				stagingBase,
				String(ctx.userId),
				String(file.key_dir ?? ''),
				String(file.tmp_name ?? ''),
			);
			if (!staged.startsWith(stagingBase + sep) || !existsSync(staged)) {
				errors.push(`${file.name}: staged file not found`);
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
