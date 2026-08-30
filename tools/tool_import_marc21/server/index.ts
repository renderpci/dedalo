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
 * THE IDENTIFIER IS AN IDENTIFIER (audit DATA-08, closed 2026-08-30). The
 * `field_to_section_id` value is a LIBRARY CONTROL NUMBER, and this door
 * resolves it the way `resolve_target_section` did: through the section's CODE
 * component (`findSectionIdByCode`, the `id` map entry's ddo_map), to an
 * existing record or to none — in which case the executor creates one. It is
 * never cast to a section_id. The header used to document the opposite against
 * itself ("the field_to_section_id value is used here as the section_id
 * directly"), which is exactly what it did: '42' wrote onto record 42.
 *
 * NOT PORTED (see the tools audit report): PHP's per-entry value transforms
 * (partial_left_content / date_format / data_map / dd_action / skip_on_empty).
 * PHP also reads main/map from the SERVER-side tool config
 * (tool_common::get_config); this module still reads them from the
 * client-posted `tool_config`.
 */

import { existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { DedaloError, ok } from '../../../src/core/errors/index.ts';
import { stagingDir } from '../../../src/core/media/ingest/add_file.ts';
import { resolveStagedName } from '../../../src/core/media/ingest/staged_files.ts';
import type { Principal } from '../../../src/core/security/permissions.ts';
import {
	findSectionIdByCode,
	type ImportCodeTarget,
} from '../../../src/core/tools/import_code_lookup.ts';
import { importMappedRecords, type MappedRecord } from '../../../src/core/tools/import_execute.ts';
import {
	applyMarcMap,
	type MarcMapEntry,
	type MarcMappedRecord,
	type MarcValueSpec,
	marcSpecLabel,
	parseMarc,
} from '../../../src/core/tools/marc21.ts';
import {
	type ToolActionContext,
	type ToolResponse,
	type ToolServerModule,
	toolRequestId,
} from '../../../src/core/tools/module.ts';

/**
 * A caller fault. `message` AND `publicMessage`: import_files is
 * backgroundRunnable, and the executor records `error.message` on the job.
 */
function invalidRequest(message: string): DedaloError {
	return new DedaloError('request.invalid_options', { message, publicMessage: message });
}

/** One authored `config.map` entry (sample_config.json / dd996 tool configuration). */
interface MarcConfigMapEntry {
	/** The TARGET component tipo. PHP names it `tipo`, not `component_tipo`. */
	tipo?: unknown;
	field?: unknown;
	subfield?: unknown;
	subfield_separator?: unknown;
	marc21_conditional?: unknown;
	/**
	 * The entry's ROLE. Only one is meaningful to the engine: `id`, the entry
	 * that declares which component holds the record's code (PHP
	 * resolve_target_section reads `array_find($context->map, name === 'id')`).
	 * It is an ordinary binding as well — its own `field`/`tipo` write the
	 * control number INTO that component, which is what makes the NEXT import of
	 * the same file find the record instead of duplicating it.
	 */
	name?: unknown;
	/** The `id` entry's target: `[{tipo, section_tipo}]` — the code component. */
	ddo_map?: unknown;
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
	/**
	 * WHERE the `field_to_section_id` value is looked up: the code component
	 * named by the `id` map entry's first ddo_map row (PHP
	 * get_section_id_from_code reads exactly `reset($id_item->ddo_map)`).
	 * Undefined when the config declares no such entry — which, when an id field
	 * IS configured, is a refusal at the door and never a fallback to "use the
	 * value as an address" (audit DATA-08).
	 */
	idTarget?: ImportCodeTarget;
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
	const idMapEntry = map.find((e) => e?.name === 'id');
	const ddo = Array.isArray(idMapEntry?.ddo_map)
		? (idMapEntry.ddo_map[0] as { tipo?: unknown; section_tipo?: unknown } | undefined)
		: undefined;
	const idTarget =
		typeof ddo?.tipo === 'string' && typeof ddo?.section_tipo === 'string'
			? { sectionTipo: ddo.section_tipo, componentTipo: ddo.tipo }
			: undefined;
	return {
		entries,
		idSpec: idEntry?.value as MarcValueSpec | undefined,
		...(idTarget === undefined ? {} : { idTarget }),
	};
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

/**
 * Turn the identifiers the file carries into record ADDRESSES (PHP
 * resolve_target_section, restored — audit DATA-08).
 *
 * Per record: no identifier ⇒ `sectionId: null`, which the shared executor
 * reads as "create". An identifier ⇒ the record whose code component holds
 * EXACTLY that value, or `null` again when no record does — the create half of
 * the frozen upsert. The value is never cast to an id: it is a foreign control
 * number, and record 42 of this section has nothing to do with control number
 * '42'.
 *
 * TWO IDENTICAL IDENTIFIERS IN ONE BATCH REFUSE THE RUN. Resolution happens for
 * the whole batch BEFORE the first write (this door maps every record of every
 * staged file first), so a second record carrying an identifier the first one
 * just created would resolve to `null` too and mint a duplicate; and if both
 * resolve to the same existing record, the second silently overwrites what the
 * first just wrote. PHP had the second outcome only, because it resolved inside
 * the write loop. Neither is an import: the file names one record twice, that is
 * a fault in the file, and the run stops with nothing written — the same "a
 * shape we cannot trust is not imported at all" this door already applies.
 */
async function resolveImportCodes(
	mapped: readonly MarcMappedRecord[],
	sectionTipo: string,
	idTarget: ImportCodeTarget | undefined,
	principal: Principal,
): Promise<MappedRecord[]> {
	const records: MappedRecord[] = [];
	const seen = new Set<string>();
	for (const record of mapped) {
		let sectionId: number | null = null;
		// `idTarget` is guaranteed present whenever a record carries a code (a
		// configured id field without a code component was refused at the door);
		// the check is what makes that guarantee readable here rather than assumed.
		if (record.code !== null && idTarget !== undefined) {
			if (seen.has(record.code)) {
				const sentence =
					`The identifier '${record.code}' is carried by more than one record of this import, ` +
					`so it does not identify one record. Nothing was imported — fix the file.`;
				throw new DedaloError('request.invalid_data', {
					message: sentence,
					publicMessage: sentence,
				});
			}
			seen.add(record.code);
			// The section searched is the section being WRITTEN, always (the config's
			// own declaration was checked to agree with it at the door).
			sectionId = await findSectionIdByCode(
				{ sectionTipo, componentTipo: idTarget.componentTipo },
				record.code,
				principal,
			);
		}
		records.push({ sectionId, fields: record.fields });
	}
	return records;
}

async function importFiles(ctx: ToolActionContext): Promise<ToolResponse> {
	const o = ctx.options;
	const sectionTipo = String(o.section_tipo ?? '');
	const filesData = (o.files_data ?? []) as { name?: string; tmp_name?: string | null }[];
	if (sectionTipo === '' || filesData.length === 0) {
		throw invalidRequest('Missing section_tipo or files_data');
	}
	const { entries, idSpec, idTarget } = readMarcMap(o.tool_config);
	if (entries.length === 0) {
		// Names the AUTHORING location (sample_config.json / register.json), which is
		// where an admin actually fixes it — not the flat key getToolConfig resolves to.
		throw invalidRequest('Missing marc21_map (tool_config.config.map)');
	}
	// THE CONFIG DECIDES HOW AN IDENTIFIER RESOLVES — never the value's shape
	// (audit DATA-08). A config that says "match records by 907$a" but never says
	// WHERE that code is stored cannot be honoured: the only two answers left are
	// "create a duplicate for every record" and "use the control number as a
	// section_id", and the second is the defect this refusal exists to end. So the
	// run stops here, before a single file is read, naming what to author.
	if (idSpec !== undefined && idTarget === undefined) {
		throw invalidRequest(
			`The marc21 config reads the record identifier from ${marcSpecLabel(idSpec)} ` +
				`(main.field_to_section_id) but declares no code component to match it against: ` +
				`add the map entry {"name":"id","ddo_map":[{"section_tipo":"${sectionTipo}","tipo":"<code component>"}]}. ` +
				`An identifier is matched against the section's code component, never used as a record id.`,
		);
	}
	if (idTarget !== undefined && idTarget.sectionTipo !== sectionTipo) {
		throw invalidRequest(
			`The marc21 config's id ddo_map points at section ${idTarget.sectionTipo}, but this import ` +
				`writes into ${sectionTipo}. Resolving an identifier in one section to address a record in ` +
				`another names an unrelated record; fix the ddo_map.`,
		);
	}

	// key_dir is TOP-LEVEL and server-sanitized; the dir is rebuilt from the
	// CURRENT user id, so no payload can reach another user's staged uploads.
	const dir = stagingDir(ctx.userId, String(o.key_dir ?? ''));

	const errors: string[] = [];
	const mapped: MarcMappedRecord[] = [];
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

	// The identifiers become addresses HERE, once, before anything is written.
	const records = await resolveImportCodes(mapped, sectionTipo, idTarget, ctx.principal);
	const report = await importMappedRecords(records, sectionTipo, ctx.userId);
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
	// A per-file failure never fails the batch: the summary and both failure
	// lists are PAYLOAD.
	return ok(
		{
			summary: `OK. MARC21 import done. Created ${report.created}, updated ${report.updated}${report.failed.length > 0 ? `, ${report.failed.length} failed` : ''}.`,
			errors,
			created: report.created,
			updated: report.updated,
			failed: report.failed,
		},
		{ requestId: toolRequestId(ctx) },
	);
}

export const tool: ToolServerModule = {
	name: 'tool_import_marc21',
	apiActions: {
		import_files: { permission: 'tipo', minLevel: 2, handler: importFiles },
	},
	backgroundRunnable: ['import_files'],
};
