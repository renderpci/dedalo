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
 *   input_component  — import-form values from components_temp_data. The wire
 *                      key is `entries` (WC-001), NOT `value`. Translatable
 *                      components are written per-lang from the entries the
 *                      client ships (each carries its own `lang`), since a
 *                      save call writes exactly ONE lang slice — PHP instead
 *                      copied all langs out of a temp-session component;
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
import { DedaloError, ok } from '../../../src/core/errors/index.ts';
import { getMediaFileDate, withDedaloTime } from '../../../src/core/media/file_date.ts';
import { sanitizeSegment, stagingDir } from '../../../src/core/media/ingest/add_file.ts';
import {
	processUploadedFile,
	requireMediaSpec,
} from '../../../src/core/media/ingest/process_uploaded_file.ts';
import { resolveStagedName } from '../../../src/core/media/ingest/staged_files.ts';
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
import {
	type ToolActionContext,
	type ToolResponse,
	type ToolServerModule,
	toolRequestId,
} from '../../../src/core/tools/module.ts';
import { parseFilename } from './filename_grammar.ts';

/**
 * A caller fault. `message` AND `publicMessage`: import_files is
 * backgroundRunnable, and the executor records `error.message` on the job.
 */
function invalidRequest(message: string): DedaloError {
	return new DedaloError('request.invalid_options', { message, publicMessage: message });
}

/** A locator as READ from a stored `relation` jsonb bag. The union is stored-
 * legacy passthrough: an install not yet swept by
 * scripts/migrate_section_id_locators.ts still holds the PHP string form
 * (WC-2026-08-10-section-id-int-canonical) — narrows at contraction. */
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

/**
 * One components_temp_data entry (the import-form component payload).
 *
 * The client pushes each tmp-section instance's `data` verbatim
 * (service_tmp_section.get_components_data). Under WC-001 the engine emits
 * component values as `entries` (resolve/component_data.ts buildDataItem), so
 * `entries` is the LIVE key; `value` is kept only as the PHP-era fallback for
 * any caller still shipping the old shape. Reading `value` alone silently
 * dropped every Values field the operator typed.
 */
export interface TempDataEntry {
	tipo?: string;
	section_tipo?: string;
	entries?: unknown;
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

/**
 * The permission targets of the two MATCHER actions (the 'section_list' gate).
 *
 * Both read records — the SOURCE record and, more importantly, the TARGET
 * section's stored filename values — and neither posts a top-level
 * `section_tipo` in the shape its handler understands. A plain 'section' spec
 * therefore (a) missed the target section entirely on `..._from_souce`, so the
 * section whose data is actually read was ungated, and (b) denied
 * `get_media_section_match` outright ("invalid section target"), because that
 * handler only ever receives `target_filename.section_tipo`.
 *
 * NOTE the action name `get_media_section_match_from_souce` keeps PHP's typo:
 * it is the literal API_ACTIONS entry of the oracle
 * (class.tool_import_files.php :74) and therefore a WIRE fact, not a slip.
 */
export function matchFromSourceSectionTipos(options: Record<string, unknown>): unknown[] {
	const target = options.target_section_tipo;
	return [options.section_tipo, ...(target === undefined ? [] : [target])];
}

export function matchFreeNameSectionTipos(options: Record<string, unknown>): unknown[] {
	const targetFilename = (options.target_filename ?? {}) as { section_tipo?: unknown };
	return targetFilename.section_tipo === undefined ? [] : [targetFilename.section_tipo];
}

/** get_media_section_match_from_souce: relation-driven match (PHP parity). */
async function getMediaSectionMatchFromSource(ctx: ToolActionContext): Promise<ToolResponse> {
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
		throw invalidRequest('Missing required parameters');
	}
	const matches = await matchFromSource(
		sectionTipo,
		sectionId,
		targetSectionTipo,
		fullName,
		filenameTipo,
	);
	return ok(matches, { requestId: toolRequestId(ctx) });
}

/** get_media_section_match: free-name match by scanning the target section. */
async function getMediaSectionMatch(ctx: ToolActionContext): Promise<ToolResponse> {
	const o = ctx.options;
	const fullName = String(o.full_name ?? '');
	const targetFilename = (o.target_filename ?? {}) as { tipo?: string; section_tipo?: string };
	const filenameTipo = String(targetFilename.tipo ?? '');
	const targetSectionTipo = String(targetFilename.section_tipo ?? '');
	if (fullName === '' || filenameTipo === '' || targetSectionTipo === '') {
		throw invalidRequest('Missing required parameters');
	}
	const matches = await matchFreeName(fullName, filenameTipo, targetSectionTipo);
	return ok(matches, { requestId: toolRequestId(ctx) });
}

/** file_processor: run a REGISTERED named processor (allowlist; none ported — crop_50 ledgered). */
async function fileProcessor(ctx: ToolActionContext): Promise<ToolResponse> {
	const name = String(ctx.options.file_processor ?? '');
	const processor = getFileProcessor(name);
	if (processor === null) {
		// SEC-053 collapse: only registered names run. No processors are ported
		// (crop_50 is ledgered on-demand), so any request fails closed rather
		// than executing arbitrary code.
		throw new DedaloError('tool.unsupported_target', {
			publicMessage: `file_processor '${name}' is not a registered processor`,
			coordinates: { file_processor: name },
		});
	}
	// The processor answers with its own internal outcome object; a false one is a
	// failed operation, not a body.
	const outcome = await processor(ctx.options);
	if (!outcome.result) {
		throw new DedaloError('tool.action_failed', {
			coordinates: { tool: 'tool_import_files', file_processor: name },
			message: outcome.msg,
		});
	}
	return ok(outcome.result, { requestId: toolRequestId(ctx) });
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
				// The client ships the full component payload in components_temp_data;
				// extract the value and save it (PHP :1698-1705). WC-001: the engine's
				// wire key is `entries` — `value` is the PHP-era fallback only.
				const temp = indexedTempData.get(`${tipo}\0${ddoSectionTipo}`);
				const rawValue = temp?.entries ?? temp?.value;
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
				// TRANSLATABLE components are stored as per-language SLICES:
				// applySaveComponentData writes exactly ONE lang per call (its
				// effectiveLang). PHP reached all languages by copying a
				// session-backed temp component; the TS client instead ships every
				// entry it holds, each already carrying its own `lang`. So group by
				// lang and issue one save per group — which reaches the same
				// languages the operator actually filled in, without a temp-session
				// twin. This used to THROW (and a pre-flight check refused the whole
				// batch), making the tool unusable with any translatable field on the
				// import form — the shipped configuration.
				// Non-translatable components ignore lang entirely (they are stored
				// under 'lg-nolan'), so the single group below is the previous path.
				const groups = new Map<string, unknown[]>();
				for (const entry of items) {
					const entryLang =
						translatable && entry !== null && typeof entry === 'object'
							? ((entry as { lang?: string }).lang ?? lang)
							: lang;
					const bucket = groups.get(entryLang);
					if (bucket === undefined) groups.set(entryLang, [entry]);
					else bucket.push(entry);
				}
				for (const [groupLang, groupItems] of groups) {
					const save = await saveComponentData({
						componentTipo: tipo,
						sectionTipo: ddoSectionTipo,
						sectionId: destinationSectionId,
						lang: groupLang,
						changedData: [{ action: 'set_data', id: null, value: groupItems }],
						userId,
					});
					if (!save.ok) {
						throw new Error(`input_component save failed on '${tipo}': ${save.message}`);
					}
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
	/** Pre-matched target address, echoed back by the CLIENT from a matcher
	 * response. Union kept: this RQO-body door still accepts the legacy numeric
	 * STRING form (coerced at each use) until the contraction release —
	 * WC-2026-08-10-section-id-int-canonical. */
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
	// The Quality selector's choice (render_tool_import_files.js :989). PHP
	// set_quality()'d the component with it before add_file; undefined ⇒ the
	// component's original tier. add_file validates it against the ladder.
	const customTargetQuality =
		typeof o.custom_target_quality === 'string' && o.custom_target_quality !== ''
			? o.custom_target_quality
			: undefined;
	const filesData = (o.files_data ?? []) as ImportFileData[];
	if (sectionTipo === '' || componentTipo === '' || filesData.length === 0) {
		throw invalidRequest('Missing section_tipo, tipo or files_data');
	}

	// Target media component: ddo_map role 'target_component' (PHP :818-827);
	// without a ddo_map, options.tipo is the media component (module contract).
	const targetDdoComponent = ddoMap.find((ddo) => ddo.role === 'target_component') ?? null;
	if (ddoMap.length > 0 && targetDdoComponent === null) {
		throw invalidRequest(
			'Invalid target_component. Role "target_component" is not defined in Ontology tool configuration properties.',
		);
	}
	const targetComponentTipo = String(targetDdoComponent?.tipo ?? componentTipo);
	const targetComponentModel = await getModelByTipo(targetComponentTipo);
	let spec: MediaTypeSpec;
	try {
		spec = requireMediaSpec(targetComponentModel ?? '');
	} catch (error) {
		throw new DedaloError('tool.unsupported_target', {
			cause: error,
			publicMessage: `'${targetComponentTipo}' is not a media component`,
			coordinates: { tipo: targetComponentTipo, model: targetComponentModel ?? '' },
		});
	}

	// (No pre-flight refusal of translatable input_components: the
	// setComponentsData input_component branch now saves them per-lang from the
	// client payload. The old check rejected the ENTIRE batch before touching a
	// single file, which made the tool unusable with the shipped import form.)

	// Capture the request data language NOW, while still in request scope, and
	// thread it into every setComponentsData call (Rule 6) — the translatable
	// role writes must not read the ALS from a leaf on the background path.
	const dataLang = currentDataLang();

	const namedGroups = new Map<string, number>();
	let imported = 0;
	const errors: string[] = [];

	/**
	 * Move one staged file into a target record's media component, AND record it
	 * on the record.
	 *
	 * (!) BOTH HALVES ARE REQUIRED. `processUploadedFile` only touches the DISK —
	 * add_file + derivatives + a files_info SCAN which it returns. Writing that
	 * scan onto the record is a separate call, and this importer used to skip it:
	 * the files landed in image/original, image/1.5MB and image/thumb while the
	 * matrix `media` key stayed NULL, so the record did not know its own files.
	 * tool_media_versions reported exactly that — `files_info_db: []` against
	 * three disk entries — and unlike component_av (re-scanned on every emit)
	 * an image has no read-time rescue, so the loss was permanent.
	 * PHP did persist here: process_uploaded_file → regenerate_component →
	 * update_component_data_files_info + save.
	 *
	 * The persist lives INSIDE this closure so both call sites — the multi-match
	 * copy loop and the default single-target path — are covered by construction.
	 */
	const ingest = async (
		targetSectionTipo: string,
		targetSectionId: number,
		keyDir: string,
		tmpName: string,
		extension: string,
		originalFileName: string,
	): Promise<void> => {
		// The context is RE-RESOLVED per call (stored items read fresh), so importing
		// several files into the SAME record accumulates instead of each one clobbering
		// the last.
		const { identity, pathOpts } = await resolveMediaToolContext({
			component_tipo: targetComponentTipo,
			section_tipo: targetSectionTipo,
			section_id: targetSectionId,
		});
		const result = await processUploadedFile({
			spec,
			identity,
			pathOpts,
			userId: ctx.userId,
			keyDir,
			tmpName,
			extension,
			quality: customTargetQuality,
		});
		const { persistUploadedMedia, nameKeysForQuality } = await import(
			'../../../src/core/media/tools/files_info_persist.ts'
		);
		const { buildMediaIdentifier } = await import('../../../src/core/media/path.ts');
		await persistUploadedMedia({
			sectionTipo: identity.sectionTipo,
			sectionId: identity.sectionId,
			componentTipo: identity.componentTipo,
			lang: identity.lang,
			filesInfo: result.filesInfo,
			// The name the operator recognises. NOTE it is not always human-readable:
			// a dropzone row restored from the server listing carries the SANITIZED
			// staged name, because that is what the listing reports.
			originalFileName: originalFileName || result.originalFileName,
			originalNormalizedName: `${buildMediaIdentifier(identity)}.${result.extension}`,
			// Provenance follows the tier the file landed in (PHP :778) — an import
			// into a non-original tier records no original_*/modified_* names.
			nameKeys: nameKeysForQuality(spec, customTargetQuality),
		});
		// A derivative failure is NOT an import failure: the original landed and
		// is now indexed by the persist above, so the file counts as imported and
		// the missing tiers can be rebuilt (tool_media_versions / repair). Report
		// it per file so the operator knows a tier is missing.
		//
		// Reported through the EXISTING `errors[]` — the ONE channel the panel
		// reads: render_tool_import_files.js:605-609 renders
		// `sse_response.data.errors` and nothing else, so a `warnings` field
		// would be dropped on the floor and the failure would be silent.
		for (const message of result.derivativeErrors) {
			errors.push(
				`${originalFileName || result.originalFileName}: imported, but a derivative could not be built — ${message}`,
			);
		}
		// AFTER the persist commits: an av transcode writes its own files_info
		// back, and must not race the write above (IngestResult.startTranscode).
		result.startTranscode?.();
	};

	// Live progress + cooperative cancellation. `import_files` runs under the
	// background executor (backgroundRunnable below), which supplies both
	// publishProgress and signal; a direct call has neither, so both are
	// optional here. Frame keys are the ones the client's compound_msg reads
	// verbatim (render_tool_import_files.js:597-620) — msg / counter / total /
	// total_ms / current_time / errors. `current_time` is the PER-FILE ms: the
	// panel averages it over a rolling window to estimate time remaining, so
	// it must be one file's cost, NOT the elapsed total.
	const publish = ctx.publishProgress;
	const totalFiles = filesData.length;
	const runStartedAt = Date.now();
	let counter = 0;

	for (const file of filesData) {
		// Cancellation is checked at the loop boundary: a file is imported whole
		// or not at all, so an abort never leaves a half-ingested record behind.
		if (ctx.signal?.aborted) {
			errors.push(`Import cancelled after ${counter} of ${totalFiles} files`);
			break;
		}
		const fileStartedAt = Date.now();
		counter++;
		// The client's display name arrives URI-encoded (tool_import_files.js
		// applies encodeURI; PHP applied rawurldecode here). Decode defensively:
		// a name containing a bare '%' is not a valid escape sequence and must
		// survive untouched. Declared OUTSIDE the try so the `finally` progress
		// frame and the error message can both name the file.
		const rawName = String(file.name ?? '');
		let fileName: string;
		try {
			fileName = decodeURIComponent(rawName);
		} catch {
			fileName = rawName;
		}
		try {
			const keyDir = String(file.key_dir ?? optionsKeyDir);
			// The STAGED name is not the client name: it is SERVER-ASSIGNED
			// (upload.ts claimStagedName). Anything outside [A-Za-z0-9_.-] became
			// '_', so 'DSC 001.jpg' / 'María.jpg' / 'photo (1).jpg' are on disk
			// under a different name — and two names that sanitize alike are kept
			// apart with a '-1', '-2' … suffix, which no transform can reproduce.
			// service_dropzone echoes the server's tmp_name back into files_data;
			// resolveStagedName takes it when present and falls back to the legacy
			// transform otherwise, REFUSING (throwing, reported as this file's
			// error) rather than guessing when suffixed candidates exist.
			const tmpName = resolveStagedName(
				stagingDir(ctx.userId, keyDir),
				fileName,
				typeof file.tmp_name === 'string' ? file.tmp_name : null,
			);
			const parsed = parseFilename(fileName);
			// Extension resolution. parseFilename implements the PHP IMPORT-NAME
			// grammar, whose extension group is `[a-zA-Z]{3,4}` — ALPHA ONLY. That
			// grammar exists to split section_id / base_name / letter for the
			// matching modes; it is NOT a media-extension parser, and using it as
			// the only source made every digit-bearing extension resolve to '' —
			// so .mp4, .mp3, .jp2, .3gp and .m4v (the dominant AV formats) each
			// died with 'Invalid media extension (empty)'.
			// Order: the server-staged extension (authoritative — the receiver
			// sniffed the magic bytes against it), then the grammar, then a plain
			// last-dot split as the honest fallback.
			const lastDot = fileName.lastIndexOf('.');
			const plainExtension = lastDot > 0 ? fileName.slice(lastDot + 1).toLowerCase() : '';
			const extension = String(file.extension ?? parsed.extension ?? plainExtension ?? '');

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
					await ingest(
						targetSectionTipo,
						step.targetSectionId,
						keyDir,
						step.tmpName,
						extension,
						fileName,
					);
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
					throw new DedaloError('record.save_failed', {
						coordinates: { tool: 'tool_import_files', section_tipo: targetSectionTipo },
						message: `Error on create portal children: ${save.message}`,
					});
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
			await ingest(targetSectionTipo, targetSectionId, keyDir, tmpName, extension, fileName);
			imported += 1;
		} catch (error) {
			errors.push(`${file.name}: ${(error as Error).message}`);
		} finally {
			// Publish AFTER the file settles (in `finally`, so a failed file still
			// advances the counter — otherwise the bar stalls on the first error).
			// `errors` is sent every frame so the panel can list them as they
			// happen instead of only at the terminal frame.
			publish?.({
				msg: `Importing ${fileName}`,
				counter,
				total: totalFiles,
				total_ms: Date.now() - runStartedAt,
				current_time: Date.now() - fileStartedAt,
				file: fileName,
				errors,
			});
		}
	}
	// CONSUME the staging form (WC-079). The "Values" the operator typed have
	// now been written into real records, so the scratch rows must go or the
	// NEXT batch silently inherits this run's metadata.
	//
	// Server-side, on the code path that actually consumed them — not a client
	// hook. That is what makes it survive a closed tab, and what gives
	// tool_import_marc21 / tool_import_zotero the same behaviour without either
	// of them growing an on_done handler they never had.
	//
	// Best effort, and only when something was ACTUALLY imported. `ok:true` is
	// not success here — this handler answers it for a run where every single
	// file failed (each per-file error is collected into `errors` and the loop
	// carries on), so clearing on it would wipe the form after a run that wrote
	// nothing and leave the operator retyping it.
	if (imported > 0) {
		try {
			const { clearTemporalScratch } = await import(
				'../../../src/core/section/record/temporal_store.ts'
			);
			await clearTemporalScratch(ctx.userId, 'tool_import_files');
		} catch (error) {
			console.warn('[tool_import_files] scratch clear failed:', (error as Error).message);
		}
	}
	// Per-file failures are PAYLOAD: the batch never aborts on one file.
	return ok(
		{
			summary: `OK. Imported ${imported} of ${filesData.length} (${nameMode} mode)${errors.length > 0 ? ' with errors' : ''}.`,
			errors,
			imported,
		},
		{ requestId: toolRequestId(ctx) },
	);
}

export const tool: ToolServerModule = {
	name: 'tool_import_files',
	apiActions: {
		// Both matchers READ record data out of the TARGET section, which rides
		// inside the payload — so the gate is declared over the payload targets.
		get_media_section_match_from_souce: {
			permission: 'section_list',
			minLevel: 1,
			sectionTipos: matchFromSourceSectionTipos,
			handler: getMediaSectionMatchFromSource,
		},
		get_media_section_match: {
			permission: 'section_list',
			minLevel: 1,
			sectionTipos: matchFreeNameSectionTipos,
			handler: getMediaSectionMatch,
		},
		file_processor: { permission: 'section', minLevel: 2, handler: fileProcessor },
		import_files: { permission: 'tipo', minLevel: 2, handler: importFiles },
	},
	backgroundRunnable: ['import_files'],
};
