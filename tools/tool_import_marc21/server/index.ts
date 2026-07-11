/**
 * tool_import_marc21 server module (PHP tool_import_marc21). import_files parses
 * the staged MARC21 (ISO 2709) files with the from-scratch parser (marc21.ts, no
 * 3rd-party lib), applies the marc21_map (tool_config.config.main: field/subfield
 * → component tipo, + field_to_section_id) to each record, and imports the mapped
 * records through the shared executor (conform + createSectionRecord +
 * saveComponentData — the same write path the CSV import scratch-twin-verifies).
 */

import { existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { config } from '../../../src/config/config.ts';
import { type MappedRecord, importMappedRecords } from '../../../src/core/tools/import_execute.ts';
import {
	type MarcMapEntry,
	type MarcValueSpec,
	applyMarcMap,
	parseMarc,
} from '../../../src/core/tools/marc21.ts';
import type {
	ToolActionContext,
	ToolResponse,
	ToolServerModule,
} from '../../../src/core/tools/module.ts';

function fail(message: string): ToolResponse {
	return { result: false, msg: `Error. ${message}`, errors: [message] };
}

/** Read the marc21_map from tool_config (config.main entries + field_to_section_id). */
function readMarcMap(toolConfig: unknown): { entries: MarcMapEntry[]; idSpec?: MarcValueSpec } {
	const main = (toolConfig as { config?: { main?: { name?: string; value?: unknown }[] } })?.config
		?.main;
	if (!Array.isArray(main)) return { entries: [] };
	const entries = main
		.filter((e) => e.name !== 'field_to_section_id')
		.map((e) => e as unknown as MarcMapEntry);
	const idEntry = main.find((e) => e.name === 'field_to_section_id');
	return { entries, idSpec: idEntry?.value as MarcValueSpec | undefined };
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
		const { entries, idSpec } = readMarcMap(o.tool_config);
		if (entries.length === 0) return fail('Missing marc21_map (tool_config.config.main)');

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
			const bytes = new Uint8Array(await Bun.file(staged).arrayBuffer());
			const { records, errors: parseErrors } = parseMarc(bytes);
			errors.push(...parseErrors.map((e) => `${file.name}: ${e}`));
			for (const record of records) mapped.push(applyMarcMap(record, entries, idSpec));
		}

		const report = await importMappedRecords(mapped, sectionTipo, ctx.userId);
		return {
			result: true,
			msg: `OK. MARC21 import done. Created ${report.created}, updated ${report.updated}${report.failed.length > 0 ? `, ${report.failed.length} failed` : ''}.`,
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
	name: 'tool_import_marc21',
	apiActions: {
		import_files: { permission: 'tipo', minLevel: 2, handler: importFiles },
	},
	backgroundRunnable: ['import_files'],
};
