/**
 * tool_import_files server module (PHP tool_import_files) — import MEDIA files,
 * matching each to records by the filename stored in a target_filename component.
 *
 * get_media_section_match_from_souce: walk a SOURCE record's relation locators to
 *   the target section, match by stored filename basename (relation-driven).
 * get_media_section_match: free-name match via an SQO filter on the
 *   target_filename component path (sanitizeClientSqo + buildSearchSql — the
 *   PHP :1490 search), confirmed by the exact basename comparison.
 * file_processor: run a REGISTERED named processor on a staged file (SEC-053 →
 *   allowlist: only registered names run; crop_50 is LEDGERED not ported —
 *   rewrite/LEDGER.md — so the registry stays fail-closed and EMPTY).
 * import_files (backgroundRunnable): media import across all name-modes —
 *   default (create) / enumerate (filename numeric prefix → section_id) / named
 *   (base_name grouping) / match + match_freename (matcher-driven, with the
 *   multi-target copy loop) — plus the tool_config.ddo_map role writes
 *   (setComponentsData) and the component_option PORTAL chain (create the media
 *   record through the portal and link it, PHP :1108-1267).
 *
 * DDO-map roles (PHP set_components_data :1592):
 *   target_component — the media component that receives the file (no data write);
 *   target_filename  — original filename into a text component, ONLY when empty;
 *   target_date      — EXIF/container/PDF capture date of the staged file
 *                      (media/file_date.ts getMediaFileDate), ONLY when empty;
 *                      no readable date keeps PHP's skip-when-empty path;
 *   input_component  — import-form values from components_temp_data
 *                      (non-translatable only; the translatable temp-session
 *                      component has no TS twin → FAIL LOUD, ledgered);
 *   component_option — import routing (the portal), never a data write.
 *
 * All component writes go through saveComponentData (tx-wrapped, TM-audited);
 * the portal link reuses the add_new_element relation hook (relations/save.ts).
 */

import { copyFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MediaTypeSpec } from '../../../src/core/concepts/media.ts';
import { sanitizeClientSqo } from '../../../src/core/concepts/sqo.ts';
import { readMatrixRecord } from '../../../src/core/db/matrix.ts';
import { sql } from '../../../src/core/db/postgres.ts';
import { getMediaFileDate, withDedaloTime } from '../../../src/core/media/file_date.ts';
import { sanitizeSegment, stagingDir } from '../../../src/core/media/ingest/add_file.ts';
import {
	processUploadedFile,
	requireMediaSpec,
} from '../../../src/core/media/ingest/process_uploaded_file.ts';
import { resolveMediaToolContext } from '../../../src/core/media/tool_support.ts';
import {
	getColumnNameByModel,
	getMatrixTableFromTipo,
	getModelByTipo,
	getNode,
	getTranslatableByTipo,
} from '../../../src/core/ontology/resolver.ts';
import { buildRequestConfigForElement } from '../../../src/core/relations/request_config/build.ts';
import { extractSqoSectionTipos } from '../../../src/core/relations/request_config/explicit.ts';
import { readComponentItems } from '../../../src/core/resolve/component_data.ts';
import { currentDataLang } from '../../../src/core/resolve/request_lang.ts';
import { buildSearchSql } from '../../../src/core/search/sql_assembler.ts';
import { createSectionRecord } from '../../../src/core/section/record/create_record.ts';
import { saveComponentData } from '../../../src/core/section/record/save_component.ts';
import {
	basenamesMatch,
	fileBasename,
	getFileProcessor,
} from '../../../src/core/tools/import_files_match.ts';
import type {
	ToolActionContext,
	ToolResponse,
	ToolServerModule,
} from '../../../src/core/tools/module.ts';
import { parseFilename } from './filename_grammar.ts';

function fail(message: string): ToolResponse {
	return { result: false, msg: `Error. ${message}`, errors: [message] };
}

interface Locator {
	section_tipo?: string;
	section_id?: number | string;
}

/** One tool_config.ddo_map entry (PHP ontology tool configuration properties). */
export interface DdoMapEntry {
	role?: string;
	tipo?: string;
	section_tipo?: string;
	/** Portal ddos may pin the target section explicitly (PHP :1214). */
	target_section_tipo?: string;
	/** target_filename: store only the parsed base_name (PHP :1661). */
	only_basename?: boolean;
	model?: string;
	label?: string;
}

/** One components_temp_data entry (the import-form component payload). */
export interface TempDataEntry {
	tipo?: string;
	section_tipo?: string;
	value?: unknown;
}

/** Raw stored items of one component on one record (empty when none). */
async function readStoredItems(
	sectionTipo: string,
	sectionId: number,
	componentTipo: string,
): Promise<unknown[]> {
	const table = await getMatrixTableFromTipo(sectionTipo);
	if (table === null) return [];
	const record = await readMatrixRecord(table, sectionTipo, sectionId);
	if (record === null) return [];
	const model = await getModelByTipo(componentTipo);
	if (model === null) return [];
	return readComponentItems(record, componentTipo, model) ?? [];
}

/** Read the first stored value of a (filename) component on a record. */
async function readFilenameValue(
	sectionTipo: string,
	sectionId: number,
	componentTipo: string,
): Promise<string> {
	const items = await readStoredItems(sectionTipo, sectionId, componentTipo);
	const first = items[0];
	if (first === null || first === undefined) return '';
	return typeof first === 'object'
		? String((first as { value?: unknown }).value ?? '')
		: String(first);
}

/**
 * Relation-driven match (PHP get_media_section_match_from_souce :1391): walk
 * the SOURCE record's relation locators to the target section and compare the
 * stored filename basenames against the uploaded name.
 */
async function matchFromSource(
	sectionTipo: string,
	sectionId: number,
	targetSectionTipo: string,
	fullName: string,
	filenameTipo: string,
): Promise<(number | string)[]> {
	const table = await getMatrixTableFromTipo(sectionTipo);
	if (table === null) throw new Error('no matrix table for source section');
	const record = await readMatrixRecord(table, sectionTipo, sectionId);
	const relationColumn = (record?.columns.relation ?? {}) as Record<string, Locator[]>;

	const matches: (number | string)[] = [];
	for (const locators of Object.values(relationColumn)) {
		for (const locator of locators) {
			if (locator.section_tipo !== targetSectionTipo || locator.section_id == null) continue;
			const value = await readFilenameValue(
				targetSectionTipo,
				Number(locator.section_id),
				filenameTipo,
			);
			if (basenamesMatch(value, fullName)) matches.push(locator.section_id);
		}
	}
	return matches;
}

/**
 * Basenames the string builder's begins-with branch treats literally: leading
 * alphanumeric (no '!'/'='/'-'/'*'/quote operator prefixes), then characters
 * that are regex-inert or only BROADEN the anchored match ('.' = any-char).
 * Anything else falls back to the not-empty prefilter — still sound, because
 * basenamesMatch() below is the authoritative comparison either way.
 */
const SQL_SAFE_BASENAME = /^[A-Za-z0-9][A-Za-z0-9 ._,-]*$/;

/**
 * Free-name match (PHP get_media_section_match :1490): an SQO with a `$and`
 * filter on the target_filename component path, run through the search
 * subsystem (sanitizeClientSqo → buildSearchSql — identifier gating + the
 * per-model string builder), then confirmed with the exact extension-stripped
 * basename comparison. One indexed query instead of the previous
 * read-every-record scan; the RESULT SET is identical to that scan:
 *
 * - the SQL stage is a SOUND overapproximation of basename equality — plain
 *   basenames ride a begins-with anchor (`'<basename>*'`: any stored value
 *   whose extension-stripped basename equals the uploaded one starts with
 *   it), basenames with search-operator/regex characters use the not-empty
 *   filter (`'*'`);
 * - basenamesMatch() applies the exact semantics to the candidates in memory
 *   (first stored item, any lang — readFilenameValue's contract).
 *
 * Deliberately NOT PHP's q shape: PHP searches contains-'<basename>.' where
 * the '.' rides into the regex as any-char, so PHP both over-matches
 * ('my_image' hits 'my_image2.jpg') and misses extension-less stored values.
 * The TS matcher keeps the exact comparison this module has always shipped.
 */
async function matchFreeName(
	fullName: string,
	filenameTipo: string,
	targetSectionTipo: string,
): Promise<number[]> {
	const basename = fileBasename(fullName);
	const q = SQL_SAFE_BASENAME.test(basename) ? `${basename}*` : '*';
	// The inputs are client-supplied (tool options / ontology config), so the
	// SQO takes the full untrusted-gate path (PHP sanitize_client_sqo parity).
	const sqo = sanitizeClientSqo({
		section_tipo: [targetSectionTipo],
		filter: {
			$and: [{ q, path: [{ section_tipo: targetSectionTipo, component_tipo: filenameTipo }] }],
		},
		limit: 1,
	});
	// Server-side override AFTER the gate: the matcher must see every candidate
	// (PHP sqo->set_limit(0) = no limit; the clamp is for untrusted listings).
	sqo.limit = 'all';
	// No principal → the projects filter is skipped, matching PHP's explicit
	// skip_projects_filter(true) (imports match records across projects).
	const query = await buildSearchSql(sqo);
	const rows = (await sql.unsafe(query.sql, query.params as (string | number | null)[])) as ({
		section_id: number;
	} & Record<string, unknown>)[];

	// Confirm candidates with the EXACT comparison on the first stored item —
	// the rows already carry the component's data column, so no per-record read.
	const model = await getModelByTipo(filenameTipo);
	const column = model !== null ? getColumnNameByModel(model) : null;
	if (column === null) return [];
	const matches: number[] = [];
	for (const row of rows) {
		const payload = row[column] as Record<string, unknown> | null | undefined;
		const rawItems = payload?.[filenameTipo];
		// readComponentItems' coercion + null/'' hole filter (same read contract).
		const items = (Array.isArray(rawItems) ? rawItems : rawItems == null ? [] : [rawItems]).filter(
			(item) => item !== null && item !== '',
		);
		const first = items[0];
		if (first === null || first === undefined) continue;
		const value =
			typeof first === 'object'
				? String((first as { value?: unknown }).value ?? '')
				: String(first);
		if (basenamesMatch(value, fullName)) matches.push(Number(row.section_id));
	}
	return matches;
}

/** get_media_section_match_from_souce: relation-driven match (PHP parity). */
async function getMediaSectionMatchFromSource(ctx: ToolActionContext): Promise<ToolResponse> {
	try {
		const o = ctx.options;
		const sectionTipo = String(o.section_tipo ?? '');
		const sectionId = Number(o.section_id);
		const targetSectionTipo = String(o.target_section_tipo ?? '');
		const fullName = String(o.full_name ?? '');
		const targetFilename = (o.target_filename ?? {}) as { tipo?: string };
		const filenameTipo = String(targetFilename.tipo ?? '');
		if (
			sectionTipo === '' ||
			!Number.isInteger(sectionId) ||
			targetSectionTipo === '' ||
			filenameTipo === ''
		) {
			return fail('Missing required parameters');
		}
		const matches = await matchFromSource(
			sectionTipo,
			sectionId,
			targetSectionTipo,
			fullName,
			filenameTipo,
		);
		return { result: matches, msg: 'OK. Request done', errors: [] };
	} catch (error) {
		return fail((error as Error).message);
	}
}

/** get_media_section_match: free-name match by scanning the target section. */
async function getMediaSectionMatch(ctx: ToolActionContext): Promise<ToolResponse> {
	try {
		const o = ctx.options;
		const fullName = String(o.full_name ?? '');
		const targetFilename = (o.target_filename ?? {}) as { tipo?: string; section_tipo?: string };
		const filenameTipo = String(targetFilename.tipo ?? '');
		const targetSectionTipo = String(targetFilename.section_tipo ?? '');
		if (fullName === '' || filenameTipo === '' || targetSectionTipo === '') {
			return fail('Missing required parameters');
		}
		const matches = await matchFreeName(fullName, filenameTipo, targetSectionTipo);
		return { result: matches, msg: 'OK. Request done', errors: [] };
	} catch (error) {
		return fail((error as Error).message);
	}
}

/** file_processor: run a REGISTERED named processor (allowlist; none ported — crop_50 ledgered). */
async function fileProcessor(ctx: ToolActionContext): Promise<ToolResponse> {
	const name = String(ctx.options.file_processor ?? '');
	const processor = getFileProcessor(name);
	if (processor === null) {
		// SEC-053 collapse: only registered names run. No processors are ported
		// (crop_50 is ledgered on-demand), so any request fails closed rather
		// than executing arbitrary code.
		return fail(`file_processor '${name}' is not a registered processor (none ported yet)`);
	}
	const outcome = await processor(ctx.options);
	return { result: outcome.result, msg: outcome.msg, errors: outcome.result ? [] : [outcome.msg] };
}

/**
 * Destination routing (PHP set_components_data :1635): a ddo living in the
 * CALLER's section writes to the calling record; anything else writes to the
 * freshly created/matched target media record.
 */
export function destinationSectionIdFor(
	ddoSectionTipo: string,
	callerSectionTipo: string,
	callerSectionId: number,
	targetSectionId: number,
): number {
	return ddoSectionTipo === callerSectionTipo ? callerSectionId : targetSectionId;
}

/**
 * target_filename value (PHP :1661): the full original name, or — with
 * only_basename — the parsed descriptive base_name segment ('portrait' from
 * '73-portrait-A.jpg').
 */
export function filenameValueFor(currentFileName: string, onlyBasename: boolean): string {
	if (!onlyBasename) return currentFileName;
	return parseFilename(currentFileName).base_name ?? '';
}

/** '<stem>_<sectionId>.<ext>' (PHP :993-996 multi-section copy naming). */
function suffixName(name: string, sectionId: number): string {
	const dot = name.lastIndexOf('.');
	if (dot <= 0) return `${name}_${sectionId}`;
	return `${name.slice(0, dot)}_${sectionId}.${name.slice(dot + 1)}`;
}

export interface MultiMatchCopyStep {
	targetSectionId: number;
	/** The staged file to ingest — a suffixed copy except for the last target. */
	tmpName: string;
	/** The filename recorded on the target (PHP current_file_name :1036). */
	fileName: string;
	/** True = this ingest consumes the ORIGINAL staged file (no copy made). */
	isLast: boolean;
}

/**
 * Multi-match copy plan (PHP :974-1041): when one staged file matches several
 * target records, every target except the LAST gets a '<stem>_<id>.<ext>' copy
 * (so the original survives for the next iteration); the last target consumes
 * the original staged file.
 */
export function buildMultiMatchCopyPlan(
	matches: number[],
	fileName: string,
	tmpName: string,
): MultiMatchCopyStep[] {
	return matches.map((targetSectionId, index) => {
		const isLast = index === matches.length - 1;
		if (isLast) return { targetSectionId, tmpName, fileName, isLast };
		return {
			targetSectionId,
			tmpName: suffixName(tmpName, targetSectionId),
			fileName: suffixName(fileName, targetSectionId),
			isLast,
		};
	});
}

export interface SetComponentsDataOptions {
	ddoMap: DdoMapEntry[];
	/** Caller section tipo/id (the record the tool was opened from). */
	sectionTipo: string;
	sectionId: number;
	/** The created/matched target media record id. */
	targetSectionId: number;
	/** Decoded filename recorded by the target_filename role. */
	currentFileName: string;
	/**
	 * Absolute path of the ORIGINAL staged source file — the target_date role
	 * reads its capture date from here (PHP file_data['file_path'], always the
	 * tmp-dir original). Null/consumed paths skip the date write (PHP's
	 * empty-tool-output path — in match mode the LAST target's original has
	 * already been moved by the ingest, exactly as in PHP).
	 */
	mediaFilePath: string | null;
	/** The media component model (component_image/av/pdf) driving the date reader. */
	targetComponentModel: string;
	componentsTempData: TempDataEntry[];
	userId: number;
	/**
	 * The request data language for translatable role writes (PHP DEDALO_DATA_LANG).
	 * Threaded EXPLICITLY (captured by importFiles while in request scope) rather
	 * than read from currentDataLang() here: this is the import background-runnable
	 * path, and a leaf ALS read would silently backstop to the installation default
	 * once a detached executor (the ledgered Bun-Worker) drains the job (Rule 6).
	 */
	dataLang: string;
}

/**
 * PHP tool_import_files::set_components_data (:1592) — iterate the ddo_map and
 * persist the import-related role data into the target/caller records. Every
 * write goes through saveComponentData (tx + TM audit).
 */
export async function setComponentsData(options: SetComponentsDataOptions): Promise<void> {
	const {
		ddoMap,
		sectionTipo,
		sectionId,
		targetSectionId,
		currentFileName,
		mediaFilePath,
		targetComponentModel,
		componentsTempData,
		userId,
		dataLang,
	} = options;

	// Index components_temp_data by [tipo][section_tipo] (PHP :1610).
	const indexedTempData = new Map<string, TempDataEntry>();
	for (const item of componentsTempData) {
		if (item?.tipo && item?.section_tipo) {
			indexedTempData.set(`${item.tipo}\0${item.section_tipo}`, item);
		}
	}

	for (const ddo of ddoMap) {
		const role = ddo.role ?? '';
		// component_option drives import routing; target_component receives the
		// media file itself — neither is a role data write (PHP :1624 + default).
		if (role !== 'target_filename' && role !== 'target_date' && role !== 'input_component') {
			continue;
		}
		const tipo = String(ddo.tipo ?? '');
		const ddoSectionTipo = String(ddo.section_tipo ?? '');
		if (tipo === '' || ddoSectionTipo === '') continue;

		const translatable = await getTranslatableByTipo(tipo);
		// PHP :1630: translatable → DEDALO_DATA_LANG (threaded by importFiles from
		// request scope — see SetComponentsDataOptions.dataLang), else lg-nolan.
		const lang = translatable ? dataLang : 'lg-nolan';
		const destinationSectionId = destinationSectionIdFor(
			ddoSectionTipo,
			sectionTipo,
			sectionId,
			targetSectionId,
		);

		switch (role) {
			case 'target_filename': {
				// Fill ONLY when the component is currently empty (PHP :1653-1654) —
				// re-importing never overwrites a manually edited value. The check is
				// across ALL langs (readComponentItems raw items): more conservative
				// than PHP's instance-lang get_data, same protective intent.
				const existing = await readStoredItems(ddoSectionTipo, destinationSectionId, tipo);
				if (existing.length > 0) break;
				const value = filenameValueFor(currentFileName, ddo.only_basename === true);
				const save = await saveComponentData({
					componentTipo: tipo,
					sectionTipo: ddoSectionTipo,
					sectionId: destinationSectionId,
					lang,
					changedData: [{ action: 'set_data', id: null, value: [{ value, lang }] }],
					userId,
				});
				if (!save.ok) {
					throw new Error(`target_filename save failed on '${tipo}': ${save.message}`);
				}
				break;
			}

			case 'target_date': {
				// PHP (:1674-1688 + get_media_file_date :421): extract the staged
				// file's EXIF/container/PDF capture date and fill the component ONLY
				// when it is currently empty; no readable date SILENTLY SKIPS.
				const existing = await readStoredItems(ddoSectionTipo, destinationSectionId, tipo);
				if (existing.length > 0) break;
				const mediaDate =
					mediaFilePath === null
						? null
						: await getMediaFileDate(mediaFilePath, targetComponentModel);
				if (mediaDate === null) break; // PHP skip-when-empty
				// Persisted shape (PHP :1683-1686 + component_date::save add_time):
				// one data element {start: dd_date} with the server-computed 'time'.
				const save = await saveComponentData({
					componentTipo: tipo,
					sectionTipo: ddoSectionTipo,
					sectionId: destinationSectionId,
					lang,
					changedData: [
						{ action: 'set_data', id: null, value: [{ start: withDedaloTime(mediaDate) }] },
					],
					userId,
				});
				if (!save.ok) {
					throw new Error(`target_date save failed on '${tipo}': ${save.message}`);
				}
				break;
			}

			case 'input_component': {
				if (translatable) {
					// PHP (:1707-1732) copies ALL languages out of a session-backed
					// temp component (is_temp=true at fake section_id 1). TS has no
					// temp-session component twin — FAIL LOUD rather than silently
					// dropping the user's other-language input. LEDGERED:
					// rewrite/LEDGER.md "translatable input_component".
					throw new Error(
						`tool_import_files: translatable input_component '${tipo}' is not supported (the PHP temp-session component has no TS twin — see rewrite/LEDGER.md)`,
					);
				}
				// Non-translatable: the client ships the full component payload in
				// components_temp_data; extract .value and save it (PHP :1698-1705).
				const temp = indexedTempData.get(`${tipo}\0${ddoSectionTipo}`);
				const rawValue = temp?.value;
				// PHP !empty guard; null/'' holes are dropped (never persist [null]).
				const rawItems = Array.isArray(rawValue)
					? rawValue.filter((entry) => entry !== null && entry !== '')
					: rawValue === null || rawValue === undefined || rawValue === ''
						? []
						: [rawValue];
				if (rawItems.length === 0) break;
				// PHP set_data auto-assigns the instance lang to lang-less items —
				// stamp the component lang here so the stored dato matches.
				const items = rawItems.map((entry) =>
					entry !== null && typeof entry === 'object' && (entry as { lang?: string }).lang == null
						? { ...(entry as Record<string, unknown>), lang }
						: entry,
				);
				const save = await saveComponentData({
					componentTipo: tipo,
					sectionTipo: ddoSectionTipo,
					sectionId: destinationSectionId,
					lang,
					changedData: [{ action: 'set_data', id: null, value: items }],
					userId,
				});
				if (!save.ok) {
					throw new Error(`input_component save failed on '${tipo}': ${save.message}`);
				}
				break;
			}
		}
	}
}

/**
 * The portal's first target section tipo (PHP get_ar_target_section_tipo()[0],
 * :1214): resolved from the portal's request_config sqo targets.
 */
async function portalTargetSectionTipo(
	portalTipo: string,
	portalSectionTipo: string,
): Promise<string | null> {
	const node = await getNode(portalTipo);
	const config = await buildRequestConfigForElement(node?.properties ?? null, {
		ownerTipo: portalTipo,
		ownerSectionTipo: portalSectionTipo,
		mode: 'list',
		ownerIsSection: false,
	});
	for (const item of config) {
		const tipos = extractSqoSectionTipos(item);
		const first = tipos[0];
		if (first !== undefined && first !== '') return first;
	}
	return null;
}

interface ImportFileData {
	name?: string;
	tmp_name?: string;
	extension?: string;
	key_dir?: string;
	section_id?: number | string;
	/** The component_option ddo tipo chosen per file in the UI (portal routing). */
	component_option?: string;
	/** Per-file named-processor selection (fail-closed: none ported). */
	file_processor?: string;
}

/**
 * import_files: media import across all name-modes (PHP import_files :764).
 * The target record per file is resolved by import_file_name_mode — 'enumerate'
 * uses the filename's numeric prefix as the section_id (record created when
 * missing), 'named' groups files by base_name into one record, 'default'
 * creates a fresh record; 'match'/'match_freename' resolve target(s) via the
 * matchers (multi-target copy loop: every target but the last gets a staged
 * COPY; the last consumes the original). With a tool_config.ddo_map:
 * import_mode 'section'/'default' runs the component_option PORTAL chain
 * (create the media record through the portal + link it, PHP :1108-1267),
 * 'section_resource' targets the resolved record itself; after each ingest the
 * ddo_map role writes run (setComponentsData). Without a ddo_map the module
 * keeps its pre-ddo_map contract: options.tipo is the media component on the
 * caller's section.
 */
async function importFiles(ctx: ToolActionContext): Promise<ToolResponse> {
	try {
		const o = ctx.options;
		const toolConfig = (o.tool_config ?? {}) as {
			import_mode?: string;
			import_file_name_mode?: string | null;
			ddo_map?: DdoMapEntry[];
		};
		const importMode = String(toolConfig.import_mode ?? 'default');
		const nameMode = String(toolConfig.import_file_name_mode ?? 'default');
		const ddoMap = Array.isArray(toolConfig.ddo_map) ? toolConfig.ddo_map : [];
		const sectionTipo = String(o.section_tipo ?? '');
		const componentTipo = String(o.tipo ?? '');
		const callerSectionId = Number(o.section_id ?? 0);
		const componentsTempData = (o.components_temp_data ?? []) as TempDataEntry[];
		const optionsKeyDir = String(o.key_dir ?? '');
		const filesData = (o.files_data ?? []) as ImportFileData[];
		if (sectionTipo === '' || componentTipo === '' || filesData.length === 0) {
			return fail('Missing section_tipo, tipo or files_data');
		}

		// Target media component: ddo_map role 'target_component' (PHP :818-827);
		// without a ddo_map, options.tipo is the media component (module contract).
		const targetDdoComponent = ddoMap.find((ddo) => ddo.role === 'target_component') ?? null;
		if (ddoMap.length > 0 && targetDdoComponent === null) {
			return fail(
				'Invalid target_component. Role "target_component" is not defined in Ontology tool configuration properties.',
			);
		}
		const targetComponentTipo = String(targetDdoComponent?.tipo ?? componentTipo);
		const targetComponentModel = await getModelByTipo(targetComponentTipo);
		let spec: MediaTypeSpec;
		try {
			spec = requireMediaSpec(targetComponentModel ?? '');
		} catch {
			return fail(`'${targetComponentTipo}' is not a media component`);
		}

		// FAIL LOUD before any ingest: a translatable input_component would need
		// the PHP temp-session component, which has no TS twin (ledgered).
		for (const ddo of ddoMap) {
			if (ddo.role !== 'input_component' || !ddo.tipo) continue;
			if (await getTranslatableByTipo(String(ddo.tipo))) {
				return fail(
					`translatable input_component '${ddo.tipo}' is not supported (the PHP temp-session component has no TS twin — see rewrite/LEDGER.md)`,
				);
			}
		}

		// Capture the request data language NOW, while still in request scope, and
		// thread it into every setComponentsData call (Rule 6) — the translatable
		// role writes must not read the ALS from a leaf on the background path.
		const dataLang = currentDataLang();

		const namedGroups = new Map<string, number>();
		let imported = 0;
		const errors: string[] = [];

		/** Move one staged file into a target record's media component. */
		const ingest = async (
			targetSectionTipo: string,
			targetSectionId: number,
			keyDir: string,
			tmpName: string,
			extension: string,
		): Promise<void> => {
			const { identity, pathOpts } = await resolveMediaToolContext({
				component_tipo: targetComponentTipo,
				section_tipo: targetSectionTipo,
				section_id: targetSectionId,
			});
			await processUploadedFile({
				spec,
				identity,
				pathOpts,
				userId: ctx.userId,
				keyDir,
				tmpName,
				extension,
			});
		};

		for (const file of filesData) {
			try {
				const fileName = String(file.name ?? '');
				const keyDir = String(file.key_dir ?? optionsKeyDir);
				const tmpName = String(file.tmp_name ?? fileName);
				const parsed = parseFilename(fileName);
				const extension = String(file.extension ?? parsed.extension ?? '');

				// Per-file named-processor selections are fail-closed (SEC-053): no
				// processor is ported (crop_50 ledgered), so the selection is an
				// explicit per-file error — never a silent generic import.
				if (file.file_processor) {
					errors.push(
						`${fileName}: file_processor '${file.file_processor}' is not a registered processor (none ported)`,
					);
					continue;
				}

				// ── match / match_freename: matcher-driven multi-target copy loop
				// (PHP :934-1051) ───────────────────────────────────────────────
				if (
					targetDdoComponent !== null &&
					(importMode === 'section' || importMode === 'section_resource') &&
					(nameMode === 'match' || nameMode === 'match_freename')
				) {
					const targetSectionTipo = String(targetDdoComponent.section_tipo ?? '');
					const targetFilenameDdo = ddoMap.find(
						(ddo) => ddo.role === 'target_filename' && ddo.section_tipo === targetSectionTipo,
					);
					const filenameTipo = String(targetFilenameDdo?.tipo ?? '');
					let matches: number[];
					if (file.section_id != null) {
						// Pre-matched by the client via the matcher actions.
						matches = [Number(file.section_id)];
					} else if (nameMode === 'match') {
						matches = (
							await matchFromSource(
								sectionTipo,
								Number(parsed.section_id),
								targetSectionTipo,
								fileName,
								filenameTipo,
							)
						).map(Number);
					} else {
						matches = await matchFreeName(fileName, filenameTipo, targetSectionTipo);
					}

					const plan = buildMultiMatchCopyPlan(matches, fileName, tmpName);
					for (const step of plan) {
						if (!step.isLast) {
							// Copy the staged file so the original survives for the next
							// target (PHP :991-1008); the LAST ingest consumes the original.
							const dir = stagingDir(ctx.userId, keyDir);
							copyFileSync(
								join(dir, sanitizeSegment(tmpName)),
								join(dir, sanitizeSegment(step.tmpName)),
							);
						}
						await ingest(targetSectionTipo, step.targetSectionId, keyDir, step.tmpName, extension);
						await setComponentsData({
							ddoMap,
							sectionTipo,
							sectionId: callerSectionId,
							targetSectionId: step.targetSectionId,
							currentFileName: step.fileName,
							// PHP file_data['file_path'] stays the ORIGINAL staged file for
							// every target; on the LAST step the ingest above has already
							// consumed it → the date read skips (PHP-identical ordering).
							mediaFilePath: join(stagingDir(ctx.userId, keyDir), sanitizeSegment(tmpName)),
							targetComponentModel: targetComponentModel ?? '',
							componentsTempData,
							userId: ctx.userId,
							dataLang,
						});
					}
					// A zero-match file ingests nothing (plan is empty): report it as a
					// per-file note instead of silently counting a no-op as imported.
					if (plan.length === 0) {
						errors.push(`${fileName}: no target record matched`);
					} else {
						imported += 1;
					}
					continue;
				}

				// ── enumerate / named / default: resolve the destination record ──
				if (
					ddoMap.length > 0 &&
					nameMode === 'enumerate' &&
					importMode !== 'section' &&
					importMode !== 'section_resource'
				) {
					// PHP :916-926: enumerate needs a section import mode.
					errors.push(
						`${fileName}: Incompatible import mode: '${importMode}' with import_file_name_mode: 'enumerate'. Ignored action`,
					);
					continue;
				}

				let resolvedSectionId: number;
				if (ddoMap.length > 0 && importMode === 'default') {
					// PHP 'default' import_mode (:1132-1141): files go into the portal
					// on the CALLING record — no record is created per name mode.
					resolvedSectionId = callerSectionId;
				} else if (file.section_id != null) {
					resolvedSectionId = Number(file.section_id); // pre-matched
				} else if (nameMode === 'enumerate' && parsed.section_id) {
					// PHP :1060-1070: the numeric prefix is the explicit section_id;
					// create_record() returns the existing id without duplicating.
					resolvedSectionId = Number(parsed.section_id);
					await createSectionRecord(sectionTipo, ctx.userId, new Date(), resolvedSectionId, {
						conflictTolerant: true,
					});
				} else if (nameMode === 'named') {
					const key = parsed.base_name || parsed.section_id || fileName;
					const existing = namedGroups.get(key);
					if (existing !== undefined) {
						resolvedSectionId = existing;
					} else {
						resolvedSectionId = await createSectionRecord(sectionTipo, ctx.userId);
						namedGroups.set(key, resolvedSectionId);
					}
				} else {
					resolvedSectionId = await createSectionRecord(sectionTipo, ctx.userId);
				}

				// ── media destination: portal chain vs the record itself ─────────
				let targetSectionTipo = sectionTipo;
				let targetSectionId = resolvedSectionId;
				if (ddoMap.length > 0 && importMode !== 'section_resource') {
					// PORTAL-LINKING chain (PHP :1108-1251): the component_option ddo
					// is the portal that receives the new media record's locator.
					let portalDdo: DdoMapEntry;
					if (importMode === 'section') {
						const optionTipo = String(file.component_option ?? '');
						const found = ddoMap.find(
							(ddo) => ddo.role === 'component_option' && ddo.tipo === optionTipo,
						);
						if (found === undefined) {
							// PHP :1113-1122 skips the file. (TS checks BEFORE creating the
							// destination record, so a config error leaves no orphan row —
							// deliberate ordering improvement over PHP.)
							errors.push(
								`${fileName}: empty target_ddo for role "component_option" and tipo "${optionTipo}"`,
							);
							continue;
						}
						// 'self' placeholder substitution (PHP :1128-1130).
						portalDdo =
							found.section_tipo === 'self' ? { ...found, section_tipo: sectionTipo } : found;
					} else {
						// PHP 'default' import_mode: the CALLING component is the portal.
						portalDdo = { tipo: componentTipo, section_tipo: sectionTipo };
					}
					const portalTipo = String(portalDdo.tipo ?? '');
					const portalSectionTipo = String(portalDdo.section_tipo ?? '');
					const portalTarget =
						portalDdo.target_section_tipo ??
						(await portalTargetSectionTipo(portalTipo, portalSectionTipo));
					if (portalTarget == null || portalTarget === '') {
						throw new Error(
							`cannot resolve the portal target section for '${portalTipo}' (no target_section_tipo and no resolvable request_config)`,
						);
					}
					// Create + link the media record through the portal — the
					// add_new_element relation hook (relations/save.ts) inside the
					// tx-wrapped, TM-audited saveComponentData (PHP :1217-1232).
					const save = await saveComponentData({
						componentTipo: portalTipo,
						sectionTipo: portalSectionTipo,
						sectionId: resolvedSectionId,
						lang: 'lg-nolan',
						changedData: [{ action: 'add_new_element', id: null, value: portalTarget }],
						userId: ctx.userId,
					});
					const created = (save as { ok: boolean; created_section_id?: number }).created_section_id;
					if (!save.ok || created == null) {
						// PHP :1220-1227 aborts the whole batch on portal-create failure.
						return fail(`Error on create portal children: ${save.message}`);
					}
					targetSectionTipo = portalTarget;
					targetSectionId = created;
				}

				// Role writes BEFORE the media move (PHP order :1254-1285) — the
				// staged file is still in place for the target_date capture read.
				if (ddoMap.length > 0) {
					await setComponentsData({
						ddoMap,
						sectionTipo,
						sectionId: resolvedSectionId,
						targetSectionId,
						currentFileName: fileName,
						mediaFilePath: join(stagingDir(ctx.userId, keyDir), sanitizeSegment(tmpName)),
						targetComponentModel: targetComponentModel ?? '',
						componentsTempData,
						userId: ctx.userId,
						dataLang,
					});
				}
				await ingest(targetSectionTipo, targetSectionId, keyDir, tmpName, extension);
				imported += 1;
			} catch (error) {
				errors.push(`${file.name}: ${(error as Error).message}`);
			}
		}
		return {
			result: true,
			msg: `OK. Imported ${imported} of ${filesData.length} (${nameMode} mode)${errors.length > 0 ? ' with errors' : ''}.`,
			errors,
			imported,
		};
	} catch (error) {
		return fail((error as Error).message);
	}
}

export const tool: ToolServerModule = {
	name: 'tool_import_files',
	apiActions: {
		get_media_section_match_from_souce: {
			permission: 'section',
			minLevel: 1,
			handler: getMediaSectionMatchFromSource,
		},
		get_media_section_match: { permission: 'section', minLevel: 1, handler: getMediaSectionMatch },
		file_processor: { permission: 'section', minLevel: 2, handler: fileProcessor },
		import_files: { permission: 'tipo', minLevel: 2, handler: importFiles },
	},
	backgroundRunnable: ['import_files'],
};
