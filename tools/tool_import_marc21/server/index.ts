/**
 * tool_import_marc21 server module (PHP tool_import_marc21). import_files parses
 * the staged MARC21 (ISO 2709) files with the from-scratch parser (marc21.ts, no
 * 3rd-party lib), applies the marc21_map (tool_config.config.map: field/subfield
 * → component tipo, + config.main's field_to_section_id) to each record, and
 * imports the mapped records through the shared executor (conform +
 * createSectionRecord + saveComponentData — the same write path the CSV import
 * scratch-twin-verifies).
 *
 * STAGED-FILE WIRE (PHP prepare_import_context :218 + process_marc21_file :294):
 * the client posts `key_dir` ONCE at the TOP LEVEL of options and each
 * `files_data[]` entry carries only `{name, size, …}` — the service_dropzone
 * descriptor. So the staged path is rebuilt as
 * `<staging root>/<ctx.userId>/<sanitized key_dir>/<staged name>`, never from a
 * client-supplied directory, and the resolved path is re-confined under the
 * user's staging dir (PHP sanitize_key_dir + safe_upload_target).
 *
 * NOT PORTED (see the tools audit report): PHP's per-entry value transforms
 * (partial_left_content / date_format / data_map / dd_action / skip_on_empty)
 * and its resolve_target_section CODE lookup (get_section_id_from_code) — the
 * field_to_section_id value is used here as the section_id directly. PHP also
 * reads main/map from the SERVER-side tool config (tool_common::get_config);
 * this module still reads them from the client-posted `tool_config`.
 */

import { existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { stagingDir } from '../../../src/core/media/ingest/add_file.ts';
import { resolveStagedName } from '../../../src/core/media/ingest/staged_files.ts';
import { importMappedRecords, type MappedRecord } from '../../../src/core/tools/import_execute.ts';
import {
	applyMarcMap,
	type MarcMapEntry,
	type MarcValueSpec,
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

/** One authored `config.map` entry (sample_config.json / dd996 tool configuration). */
interface MarcConfigMapEntry {
	/** The TARGET component tipo. PHP names it `tipo`, not `component_tipo`. */
	tipo?: unknown;
	field?: unknown;
	subfield?: unknown;
	subfield_separator?: unknown;
	marc21_conditional?: unknown;
}

/**
 * Read the marc21_map from the tool config: the field→component bindings live in
 * `config.map` (PHP $context->map), and `config.main` holds the global settings —
 * among them the `field_to_section_id` spec. Reading the bindings out of `main`
 * (as this module did) yields entries with no `field`, so extractMarcValues
 * matched nothing and every import wrote zero components.
 */
export function readMarcMap(toolConfig: unknown): {
	entries: MarcMapEntry[];
	idSpec?: MarcValueSpec;
} {
	// SHAPE: `{config:{main,map}}` is the AUTHORING shape (register.json /
	// sample_config.json). getToolConfig RESOLVES options FLAT — one key per
	// option — so a real caller passes `{map, info, main}` with NO `.config`
	// wrapper. Reading only the nested form (as this did until 2026-07-28) meant
	// every real import found zero bindings and answered "Missing marc21_map",
	// while the suite stayed green on a hand-built nested fixture. Flat first,
	// nested tolerated as legacy — same fix as resolveTranscriberConfig /
	// resolveTranslatorConfig.
	const raw = toolConfig as {
		main?: { name?: string; value?: unknown }[];
		map?: MarcConfigMapEntry[];
		config?: { main?: { name?: string; value?: unknown }[]; map?: MarcConfigMapEntry[] };
	};
	const cfg = Array.isArray(raw?.map) || Array.isArray(raw?.main) ? raw : raw?.config;
	const main = Array.isArray(cfg?.main) ? cfg.main : [];
	const map = Array.isArray(cfg?.map) ? cfg.map : [];
	const entries: MarcMapEntry[] = map
		.filter((e) => typeof e?.tipo === 'string' && typeof e?.field === 'string')
		.map((e) => ({
			component_tipo: e.tipo as string,
			field: e.field as string,
			...(typeof e.subfield === 'string' ? { subfield: e.subfield } : {}),
			...(typeof e.subfield_separator === 'string'
				? { subfield_separator: e.subfield_separator }
				: {}),
			...(e.marc21_conditional !== undefined && e.marc21_conditional !== null
				? { marc21_conditional: e.marc21_conditional as MarcMapEntry['marc21_conditional'] }
				: {}),
		}));
	const idEntry = main.find((e) => e.name === 'field_to_section_id');
	return { entries, idSpec: idEntry?.value as MarcValueSpec | undefined };
}

/**
 * Resolve ONE staged file inside the user's staging dir, or null when the name
 * is not stageable there.
 *
 * The staged name is SERVER-ASSIGNED since 2026-08-03 (two client names that
 * sanitize alike now yield `x.mrc` and `x-1.mrc`), so the authoritative source
 * is the `tmp_name` this tool's client forwards per entry. `resolveStagedName`
 * takes it when present and falls back to the legacy transform otherwise —
 * THROWING rather than guessing when collision-suffixed candidates exist.
 *
 * THE `null` RETURN IS CURRENTLY UNREACHABLE, and is kept deliberately. Both
 * branches of `resolveStagedName` now produce a name that cannot escape: a
 * forwarded value goes through `sanitizeSegment` (which THROWS on '', '.', '..',
 * NUL, '/' and anything outside [A-Za-z0-9_.-]), and the legacy transform
 * rewrites every other character to '_' and prefixes a leading dot, so '..'
 * becomes '_..'. No input reaches `resolve(dir, name)` with a traversal left in
 * it. Stating that here rather than deleting the check, because it is the last
 * line of a confinement guarantee and the transforms in front of it are two
 * modules away; the gate that replaces the lost branch coverage asserts the
 * INVARIANT instead (test/unit/tool_import_marc21.test.ts: no hostile client
 * name resolves outside `dir`).
 */
export function resolveStagedFile(
	dir: string,
	clientName: string,
	tmpName?: string | null,
): string | null {
	const target = resolve(dir, resolveStagedName(dir, clientName, tmpName));
	if (!target.startsWith(dir + sep)) return null;
	return target;
}

async function importFiles(ctx: ToolActionContext): Promise<ToolResponse> {
	try {
		const o = ctx.options;
		const sectionTipo = String(o.section_tipo ?? '');
		const filesData = (o.files_data ?? []) as { name?: string; tmp_name?: string | null }[];
		if (sectionTipo === '' || filesData.length === 0)
			return fail('Missing section_tipo or files_data');
		const { entries, idSpec } = readMarcMap(o.tool_config);
		if (entries.length === 0)
			// Names the AUTHORING location (sample_config.json / register.json), which is
			// where an admin actually fixes it — not the flat key getToolConfig resolves to.
			return fail('Missing marc21_map (tool_config.config.map)');

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
			// PHP filter_marc21_files: .mrc (binary ISO 2709) only; other uploads in
			// the same dropzone batch are not MARC21 and are silently passed over.
			if (!name.toLowerCase().endsWith('.mrc')) continue;
			let staged: string | null;
			try {
				// tmp_name is the SERVER-assigned staged name, forwarded per entry by
				// this tool's client. An entry without one falls back to the legacy
				// derivation, which refuses (throws) rather than guess.
				staged = resolveStagedFile(dir, name, file.tmp_name ?? null);
			} catch (error) {
				errors.push(`${name}: ${(error as Error).message}`);
				continue;
			}
			if (staged === null) {
				errors.push(`${name}: invalid file name`);
				continue;
			}
			if (!existsSync(staged)) {
				errors.push(`${name}: staged file not found`);
				continue;
			}
			const bytes = new Uint8Array(await Bun.file(staged).arrayBuffer());
			const { records, errors: parseErrors } = parseMarc(bytes);
			errors.push(...parseErrors.map((e) => `${name}: ${e}`));
			for (const record of records) mapped.push(applyMarcMap(record, entries, idSpec));
		}

		const report = await importMappedRecords(mapped, sectionTipo, ctx.userId);
		// CONSUME the staging form (WC-079). This tool's client builds a
		// service_tmp_section, so it accumulates scratch rows under its own scope —
		// clearing here is what stops the next batch inheriting this run's values.
		// Best effort. Only when something was ACTUALLY created or updated: a run where every
		// record failed still returns result:true, and clearing on that would wipe
		// the form after writing nothing.
		if (report.created + report.updated > 0) {
			try {
				const { clearTemporalScratch } = await import(
					'../../../src/core/section/record/temporal_store.ts'
				);
				await clearTemporalScratch(ctx.userId, 'tool_import_marc21');
			} catch (error) {
				console.warn('[tool_import_marc21] scratch clear failed:', (error as Error).message);
			}
		}
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
