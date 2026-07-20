/**
 * Time Machine read — SQO mode 'tm' (PHP search_tm + tm_record +
 * section::get_tm_context). Lists a record's change history from
 * matrix_time_machine (flat columns, NOT the jsonb matrix shape) as the
 * standard read wire contract: a dd15 sections envelope whose entries carry
 * matrix_id/timestamp/caller/user facts, plus per-row component items built
 * by TRANSFORMING the flat columns into component-shaped values
 * (tm_record::get_section_record):
 *
 *  - dd1371 bulk_process_id → number item (null stored ⇒ value 0)
 *  - dd559  timestamp       → date item {start: dd_date}
 *  - dd578  user_id         → portal locator into dd128 + a username SUBDATUM
 *                             item (from matrix_users; the dd128 component tipo
 *                             is resolved from dd578's ontology ddo_map — PHP
 *                             behavior, S2-43 channel 2)
 *  - dd577  tipo            → input_text item "«term» [tipo]" in the request
 *                             lang (PHP get_term_by_tipo + bracket suffix)
 *
 * FILTERS: filter_by_locators and/or conformed sqo.filter columns (the _tm
 * builder twins; the inspector/tool record-history cases —
 * section_tipo/section_id columns, optional tipo/lang narrowing). The
 * deleted-sections listing (sqo.filter with format:'column') is uncovered
 * scope and denies loudly. ORDER: the TM id column only (PHP default).
 *
 * PERMISSIONS: the dispatch read gates apply per SQO target (the CALLER
 * section, level >= 1); dd15 itself is admin-only via the getPermissions
 * wrapper rule when addressed directly.
 */

import { config } from '../../config/config.ts';
import type { Ddo } from '../concepts/ddo.ts';
import type { Rqo } from '../concepts/rqo.ts';
import type { Sqo } from '../concepts/sqo.ts';
import type { MatrixRecord } from '../db/matrix.ts';
import { sql } from '../db/postgres.ts';
import type { TimeMachineRow } from '../db/time_machine.ts';
import { createDataCache } from '../ontology/cache_factory.ts';
import { termByTipo } from '../ontology/labels.ts';
import {
	getColumnNameByModel,
	getModelByTipo,
	getNode,
	getTranslatableByTipo,
} from '../ontology/resolver.ts';
import type {
	EmitDdo,
	EmitRowContext,
	SectionReadSource,
	SectionRow,
} from '../section/read_source.ts';
import type { Principal } from '../security/permissions.ts';
import {
	TM_COLUMN_BULK_PROCESS_ID as TIPO_BULK_PROCESS,
	TM_COLUMN_TIPO as TIPO_COMPONENT,
	TM_NOTES_TEXT as TIPO_NOTES,
	TM_COLUMN_TIMESTAMP as TIPO_TIMESTAMP,
	TM_COLUMN_USER_ID as TIPO_USER,
	TM_NOTES_SECTION_TIPO,
	buildTmSectionRecord,
	ddDateFromTimestamp,
} from '../tm_record/tm_record.ts';
import { EmissionContext, filterItemsByLang, readComponentItems } from './component_data.ts';
import { currentDataLang } from './request_lang.ts';
import type { StructureContextEntry } from './structure_context.ts';
import { conformTmFilter } from './tm_filter.ts';

/**
 * The section-record TM list filters by a `tipo` COLUMN filter whose value is the
 * caller SECTION tipo (matrix_time_machine stores one record-level snapshot per
 * save with tipo = section_tipo, plus per-component rows). PHP scopes by it
 * (WHERE tipo = q); extract that value. Returns null when no such filter is set.
 */
function tipoColumnFilter(sqo: Record<string, unknown>): string | null {
	const filter = sqo.filter as { $and?: { q?: unknown; column_name?: unknown }[] } | undefined;
	const clause = filter?.$and?.find((c) => c?.column_name === 'tipo');
	return clause !== undefined && typeof clause.q === 'string' && clause.q !== '' ? clause.q : null;
}

/** TM virtual section + the users section (the rest come from tm_record.ts). */
const TM_SECTION_TIPO = 'dd15';

/**
 * Bare-browse COUNT(*) cache (see tmReadSource.count). Data-event wired: ANY
 * record save/delete may append TM rows, so any section write clears it; the
 * TTL stamp bounds staleness against out-of-band (non-engine) inserts.
 */
const tmBareCountCache = createDataCache<string, { value: number; at: number }>((cache) =>
	cache.clear(),
);
const USERS_SECTION_TIPO = 'dd128';

/**
 * The dd128 component shown as the dd578 user SUBDATUM. PHP resolves it from
 * the live ontology — dd578's properties `source.request_config[0].show
 * .ddo_map[0].tipo` — NOT from a constant. Hardcoding it (previously 'dd132')
 * pinned an ontology-driven value as code: when the shared ontology changed
 * the ddo to dd452, the three TM parity gates went red with zero TS change
 * (S2-43 channel 2). Derived per call through the hub-registered node cache,
 * with dd132 kept only as the last-resort fallback for a broken ontology row.
 */
const USERNAME_COMPONENT_FALLBACK = 'dd132';
async function usernameComponentTipo(): Promise<string> {
	const node = await getNode(TIPO_USER);
	const requestConfig = (
		node?.properties as
			| { source?: { request_config?: { show?: { ddo_map?: { tipo?: unknown }[] } }[] } }
			| null
			| undefined
	)?.source?.request_config;
	const ddoTipo = requestConfig?.[0]?.show?.ddo_map?.[0]?.tipo;
	return typeof ddoTipo === 'string' && ddoTipo !== '' ? ddoTipo : USERNAME_COMPONENT_FALLBACK;
}

/**
 * The row shape this reader selects (a superset of the shared TimeMachineRow:
 * it also pulls the record-level snapshot `data` for the list view). The fields
 * consumed by buildTmSectionRecord are exactly TimeMachineRow's.
 */
interface TmRow {
	id: number;
	section_id: number;
	section_tipo: string;
	tipo: string;
	lang: string;
	timestamp: string;
	user_id: number;
	bulk_process_id: number | null;
	/** The record-level snapshot (a full matrix-record jsonb) for the list view. */
	data: Record<string, unknown> | null;
}

/**
 * Build the WHERE for a TM query. `filter_by_locators` → per-component history
 * (OR of locator groups). Else a `tipo` column filter → the record-snapshot LIST
 * (WHERE tipo = q, matching PHP). Returns whether it is the record-list surface
 * (its rows carry a full-record snapshot whose component columns are the display).
 *
 * NO scope at all — a bare dd15 list (`section_tipo:['dd15']`, no
 * filter_by_locators, no tipo filter), which the client sends when the Time
 * Machine section is opened directly — matches PHP `search_tm` whose
 * build_main_where() is intentionally EMPTY: it returns ALL matrix_time_machine
 * rows (newest-first, paginated), NOT an error and NOT empty. So the where is
 * `true` and it renders as the who/when/where/what history (isRecordList=false).
 */
function buildTmWhere(sqo: Record<string, unknown>): {
	whereSql: string;
	params: unknown[];
	isRecordList: boolean;
} {
	const params: unknown[] = [];
	const locators = Array.isArray(sqo.filter_by_locators)
		? (sqo.filter_by_locators as Record<string, unknown>[])
		: [];
	if (locators.length > 0) {
		const groups = locators.map((locator) => {
			const clauses: string[] = [];
			params.push(String(locator.section_tipo ?? ''));
			clauses.push(`section_tipo = $${params.length}`);
			params.push(Number(locator.section_id ?? 0));
			clauses.push(`section_id = $${params.length}`);
			if (typeof locator.tipo === 'string' && locator.tipo !== '') {
				params.push(locator.tipo);
				clauses.push(`tipo = $${params.length}`);
			}
			if (typeof locator.lang === 'string' && locator.lang !== '') {
				params.push(locator.lang);
				clauses.push(`lang = $${params.length}`);
			}
			return `(${clauses.join(' AND ')})`;
		});
		return { whereSql: `(${groups.join(' OR ')})`, params, isRecordList: false };
	}
	const tipoFilter = tipoColumnFilter(sqo);
	if (tipoFilter !== null) {
		params.push(tipoFilter);
		return { whereSql: `tipo = $${params.length}`, params, isRecordList: true };
	}
	// The standalone dd15 list search: conform component clauses to the flat
	// matrix_time_machine columns (PHP search_tm + the _tm traits). Absent this,
	// every component filter was silently ignored (the whole list came back).
	const componentSql = conformTmFilter(sqo.filter, { params });
	if (componentSql !== null && componentSql !== '') {
		return { whereSql: componentSql, params, isRecordList: false };
	}
	// No scope → the bare dd15 list: ALL TM rows (PHP search_tm empty where).
	return { whereSql: 'true', params, isRecordList: false };
}

export interface TmReadData {
	data: Record<string, unknown>[];
	/** Ledger of requested ddos this reader does not model. */
	unhandled: string[];
}

/** The user-display items of one user record (matrix_users, ontology-derived tipo). */
async function usernameItems(userId: number, usernameTipo: string): Promise<unknown[]> {
	// usernameTipo comes from the ontology ddo_map (a dd-tipo like 'dd452'),
	// interpolated as a jsonb key; parameterize defensively anyway.
	const rows = (await sql.unsafe(
		`SELECT COALESCE(data->$2::text, string->$2::text) AS items
		 FROM matrix_users WHERE section_id = $1`,
		[userId, usernameTipo],
	)) as { items: unknown[] | null }[];
	const items = rows[0]?.items ?? [];
	// Root special resolution in 'tm' mode (PHP component_input_text::
	// get_list_value): the superuser row (-1) typically stores no display name;
	// PHP hard-resolves it to 'Root' so the history user column is not blank.
	if (items.length === 0 && Number(userId) === -1) {
		return [{ value: 'Root', lang: 'lg-nolan' }];
	}
	return items;
}

/** The TM row-plus that a SectionRow carries in `raw` for emitTmRow. */
interface TmRawRow {
	row: TmRow;
	isRecordList: boolean;
}

/**
 * Query matrix_time_machine for one request (the two scoping surfaces of
 * buildTmWhere) and return the ordered/paginated rows plus which surface it is.
 * The sqo may be raw (direct readTimeMachineData) or sanitized (via the generic
 * readSectionRows) — both carry filter/filter_by_locators/order/limit/offset.
 */
async function queryTmRows(
	sqo: Record<string, unknown>,
): Promise<{ rows: TmRow[]; isRecordList: boolean }> {
	// TWO scoping surfaces (see buildTmWhere): the per-record component HISTORY
	// (filter_by_locators) and the section-record LIST (the tool_time_machine
	// browse: one row per record-level snapshot, tipo = caller section_tipo — PHP
	// applies the tipo column filter, WHERE tipo = q). A dd578 USER relation filter
	// is still IGNORED (PHP ignores it; tm_relation_filter_differential pins that).
	const { whereSql, params: scopeParams, isRecordList } = buildTmWhere(sqo);

	// Order: the TM id (service default) or section_id (the list view's order).
	const order = Array.isArray(sqo.order) ? (sqo.order as Record<string, unknown>[]) : [];
	const orderPath = (order[0]?.path as Record<string, unknown>[] | undefined)?.[0];
	const orderCol = orderPath?.component_tipo;
	if (orderCol !== undefined && orderCol !== 'id' && orderCol !== 'section_id') {
		throw new Error(`TM read: order by '${orderCol}' is uncovered scope`);
	}
	const orderColumn = orderCol === 'section_id' ? 'section_id' : 'id';
	const direction = String(order[0]?.direction ?? 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

	const limit = Number(sqo.limit ?? 10);
	const offset = Number(sqo.offset ?? 0);
	const params = [...scopeParams, limit, offset];

	// Late row lookup for DEEP pages on the id-ordered surfaces (bare browse +
	// record-snapshot list, both PK/(tipo,id)-index-served): find the page of
	// ids first (narrow index scan), then join back for the wide data column —
	// a plain OFFSET reads and discards every skipped row's snapshot jsonb.
	// The section_id order path keeps the plain query: its sort key has ties,
	// and page membership under ties must not be perturbed (byte-gated reads).
	const lateThreshold = config.ops.searchLateRowLookupOffset;
	if (lateThreshold >= 0 && offset >= lateThreshold && orderColumn === 'id') {
		const rows = (await sql.unsafe(
			`SELECT tm.id, tm.section_id, tm.section_tipo, tm.tipo, tm.lang, tm.timestamp::text AS timestamp, tm.user_id, tm.bulk_process_id, tm.data
			 FROM matrix_time_machine tm
			 JOIN (SELECT id FROM matrix_time_machine
			       WHERE ${whereSql}
			       ORDER BY id ${direction}
			       LIMIT $${params.length - 1} OFFSET $${params.length}) page ON page.id = tm.id
			 ORDER BY tm.id ${direction}`,
			params,
		)) as TmRow[];
		return { rows, isRecordList };
	}

	const rows = (await sql.unsafe(
		`SELECT id, section_id, section_tipo, tipo, lang, timestamp::text AS timestamp, user_id, bulk_process_id, data
		 FROM matrix_time_machine tm
		 WHERE ${whereSql}
		 ORDER BY ${orderColumn} ${direction}
		 LIMIT $${params.length - 1} OFFSET $${params.length}`,
		params,
	)) as TmRow[];
	return { rows, isRecordList };
}

/** The envelope-entry extras every dd15 row carries (client-consumed; byte-gated). */
function tmEnvelopeExtra(row: TmRow): Record<string, unknown> {
	return {
		matrix_id: row.id,
		timestamp: row.timestamp,
		caller_section_tipo: row.section_tipo,
		caller_section_id: row.section_id,
		bulk_process_id: row.bulk_process_id ?? 0,
		user_id: Number(row.user_id),
	};
}

/**
 * Emit ONE dd15 row's data items into the emission context for every requested ddo tipo — the
 * who/when/where/what meta blocks (dd1371/dd559/dd578+username-ddo/dd577) and, in the
 * record-snapshot list, the section's own component cells resolved from the
 * virtual dd15 record (SELECT-family → flat 'list' labels, portal-family → 'tm'
 * locator+subdatum). `emitDdo` is the shared emitDdoData, passed in.
 */
async function emitTmRow(
	row: TmRow,
	ddoMap: Ddo[],
	lang: string,
	emission: EmissionContext,
	emitDdo: EmitDdo,
): Promise<void> {
	const requestedTipos = ddoMap
		.map((ddo) => ddo.tipo)
		.filter((tipo): tipo is string => typeof tipo === 'string');
	const ddoByTipo = new Map<string, unknown>();
	for (const ddo of ddoMap) {
		if (typeof ddo.tipo === 'string') ddoByTipo.set(ddo.tipo, ddo);
	}
	const clientDdoMap = ddoMap as unknown[];

	// The record-snapshot list resolves the section's OWN components from a
	// virtual dd15 record materialized by the SINGLE dd15 builder (tm_record.ts).
	// Built lazily: only the default (snapshot-component) branch needs it.
	let tmRecord: MatrixRecord | null = null;
	const getTmRecord = async (): Promise<MatrixRecord> => {
		if (tmRecord === null) {
			// TmRow is TimeMachineRow minus the parity `dataText` twin (unused here).
			tmRecord = await buildTmSectionRecord(row as unknown as TimeMachineRow, lang);
		}
		return tmRecord;
	};

	const baseItem = (tipo: string): Record<string, unknown> => ({
		section_id: row.id,
		section_tipo: TM_SECTION_TIPO,
		tipo,
		mode: 'tm',
		lang: 'lg-nolan',
		from_component_tipo: tipo,
		parent_tipo: TM_SECTION_TIPO,
		parent_section_id: row.id,
		row_section_id: row.id,
	});

	// Emit ONE relation column of the virtual dd15 record per relation FAMILY —
	// SELECT family → the flat get_list_value LABEL strings ('list' mode, e.g. a
	// publication's "Sí"/"No"); PORTAL family → the paginated locator + its target
	// SUBDATUM ('tm' mode). PHP stamps the request mode ('tm') back on every block
	// and pins parent_section_id to each block's own record. Used by BOTH the
	// record-snapshot list AND the per-component history surface — the history
	// surface previously hardcoded 'tm', so a select-family value column (a
	// publication flag) leaked its raw dd-locator to the client as '[object
	// Object]' instead of the resolved label.
	const emitRelationCell = async (cellTipo: string, model: string): Promise<void> => {
		const { SELECT_FAMILY_MODELS } = await import('../relations/models/select_family.ts');
		const cellMode = SELECT_FAMILY_MODELS.has(model) ? 'list' : 'tm';
		const clientDdo = (ddoByTipo.get(cellTipo) ?? { tipo: cellTipo }) as Record<string, unknown>;
		const cellDdo = { ...clientDdo, tipo: cellTipo, mode: cellMode };
		const before = emission.items.length;
		await emitDdo(
			cellDdo as never,
			clientDdoMap as never,
			(await getTmRecord()) as never,
			{ section_tipo: TM_SECTION_TIPO, section_id: row.id },
			cellMode,
			lang,
			TM_SECTION_TIPO,
			emission,
		);
		for (let i = before; i < emission.items.length; i++) {
			const item = emission.items[i] as Record<string, unknown>;
			item.mode = 'tm';
			if (cellMode !== 'list' && item.parent_section_id === undefined) {
				item.parent_section_id = item.section_id;
			}
		}
	};

	// Scalar snapshot column: read the stored items straight from the virtual
	// record (no lang filter — the TM list shows the stored value verbatim).
	// readComponentItems applies the same non-array→[data] coercion PHP does.
	const emitScalarCell = async (cellTipo: string, model: string): Promise<void> => {
		const { readComponentItems } = await import('./component_data.ts');
		const items = readComponentItems(await getTmRecord(), cellTipo, model) ?? [];
		emission.items.push({
			...baseItem(cellTipo),
			entries: items,
			fallback_value: null,
		} as never);
	};

	for (const tipo of requestedTipos) {
		switch (tipo) {
			case TIPO_BULK_PROCESS:
				emission.items.push({
					...baseItem(tipo),
					entries: [{ id: 1, value: row.bulk_process_id ?? 0 }],
				} as never);
				break;
			case TIPO_TIMESTAMP:
				emission.items.push({
					...baseItem(tipo),
					entries: [{ id: 1, start: ddDateFromTimestamp(row.timestamp) }],
				} as never);
				break;
			case TIPO_USER: {
				// The user portal locator + its username SUBDATUM item (the dd128
				// component tipo is resolved from dd578's ontology ddo_map like PHP).
				const usernameTipo = await usernameComponentTipo();
				emission.items.push({
					...baseItem(tipo),
					entries: [
						{
							id: 1,
							section_tipo: USERS_SECTION_TIPO,
							section_id: String(row.user_id),
							type: 'dd151',
							from_component_tipo: TIPO_USER,
							paginated_key: 0,
						},
					],
					pagination: { total: 1, limit: 1, offset: 0 },
				} as never);
				// SUBDATUM mode is 'list', NOT the row's 'tm': dd578's portal
				// request_config declares its username subdatum ddo (dd132) in 'list'
				// mode (the standard portal display mode), and the byte-identical
				// client binds a subdatum to its context/data by an EXACT (tipo, mode,
				// section_tipo) match (section_record get_ar_columns_instances_list +
				// get_component_data). Emitting it as 'tm' made ddo('list') ≠ data/
				// context('tm'), so the client dropped the column and the Who cell
				// rendered blank. Same class as the select-family value fix that gave
				// emitRelationCell its cellMode='list' (tm_component_value_differential).
				emission.items.push({
					section_id: String(row.user_id),
					section_tipo: USERS_SECTION_TIPO,
					tipo: usernameTipo,
					mode: 'list',
					lang: 'lg-nolan',
					from_component_tipo: TIPO_USER,
					entries: await usernameItems(row.user_id, usernameTipo),
					parent_tipo: TM_SECTION_TIPO,
					parent_section_id: String(row.user_id),
					fallback_value: null,
					row_section_id: row.id,
				} as never);
				break;
			}
			case TIPO_COMPONENT:
				emission.items.push({
					...baseItem(tipo),
					entries: [
						{ id: 1, lang: 'lg-nolan', value: `${await termByTipo(row.tipo, lang)} [${row.tipo}]` },
					],
					fallback_value: null,
				} as never);
				break;
			case TIPO_NOTES: {
				// The TM annotation (PHP component_text_area_json.php 'tm' branch,
				// :305-336): the item carries the note-record navigation fields the
				// client note view consumes (view_note_text_area.js) — matrix_id (the
				// TM row id; note creation aborts without it), parent_section_tipo/
				// parent_section_id (the notes section + the existing note record, or
				// null), created_by_user_id (the virtual record's dd200 = the TM row
				// user). Entries are the lang-filtered note text (PHP get_data_lang)
				// with the injected parent_section_id lifted OFF the first item;
				// empty → [] (WC-001; PHP emits null).
				const items = readComponentItems(await getTmRecord(), TIPO_NOTES, 'component_text_area');
				const value = filterItemsByLang(items ?? [], lang) as Record<string, unknown>[];
				const parentSectionId = (value[0]?.parent_section_id ?? null) as string | null;
				const entries = value.map((item, index) => {
					if (index !== 0) return item;
					const { parent_section_id: _lifted, ...rest } = item;
					return rest;
				});
				emission.items.push({
					...baseItem(tipo),
					lang,
					entries,
					fallback_value: null,
					parent_section_id: parentSectionId,
					parent_section_tipo: TM_NOTES_SECTION_TIPO,
					created_by_user_id: Number(row.user_id),
					matrix_id: row.id,
				} as never);
				break;
			}
			default: {
				// Any other requested column resolves from the virtual dd15 record
				// materialized for this row (buildTmSectionRecord adopts a full-record
				// snapshot wholesale for the record-snapshot LIST, or injects a
				// per-component history snapshot under its own tipo). Either surface
				// renders the same way per column model — the dd15 meta columns
				// (dd1772/dd1212/rsc329) AND the section's own value columns (e.g. a
				// publication flag in the component-history list).
				const model = await getModelByTipo(tipo);
				const column = model !== null ? getColumnNameByModel(model) : null;
				if (column === 'relation' && model !== null) {
					await emitRelationCell(tipo, model);
				} else if (column !== null && model !== null) {
					await emitScalarCell(tipo, model);
				}
				break;
			}
		}
	}
}

/**
 * The dd15 Time Machine read source (PHP search_tm + the per-row
 * tm_record::get_section_record materialization). Plugged into the generic
 * readSectionRows via section/read_source.ts so dd15 is served as a normal
 * section — same envelope/context/count, only row acquisition + cell policy differ.
 */
export const tmReadSource: SectionReadSource = {
	async getRows(sqo: Sqo): Promise<SectionRow[]> {
		const { rows, isRecordList } = await queryTmRows(sqo as Record<string, unknown>);
		return rows.map((row) => ({
			// dd15 addresses each snapshot by the TM row PK (its own `id`).
			section_tipo: TM_SECTION_TIPO,
			section_id: row.id,
			envelopeExtra: tmEnvelopeExtra(row),
			raw: { row, isRecordList } satisfies TmRawRow,
		}));
	},

	async count(sqo: Sqo): Promise<number> {
		const where = buildTmWhere(sqo as Record<string, unknown>);
		// The BARE browse (no scope, whereSql 'true') is a full-table COUNT(*) on
		// the append-only TM table — the only expensive count surface (the scoped
		// ones are index-served). Serve it from the data-event cache: every save
		// this engine performs clears it (saves are exactly when TM grows), with
		// TM_COUNT_CACHE_TTL_MS as the freshness backstop for out-of-band inserts.
		// 0 disables (exact every time — the parity-environment setting).
		const ttl = config.ops.tmCountCacheTtlMs;
		const bare = where.whereSql === 'true';
		if (bare && ttl > 0) {
			const hit = tmBareCountCache.get('bare');
			if (hit !== undefined && Date.now() - hit.at < ttl) return hit.value;
		}
		const rows = (await sql.unsafe(
			`SELECT COUNT(*)::int AS c FROM matrix_time_machine WHERE ${where.whereSql}`,
			where.params,
		)) as { c: number }[];
		const value = Number(rows[0]?.c ?? 0);
		if (bare && ttl > 0) {
			tmBareCountCache.set('bare', { value, at: Date.now() });
		}
		return value;
	},

	async emitRow(context: EmitRowContext): Promise<void> {
		const { row } = context.row.raw as TmRawRow;
		await emitTmRow(row, context.ddoMap, context.lang, context.emission, context.emitDdo);
	},

	buildContext: buildTmContext,
};

/**
 * Build the dd15 structure-context for a TM read (PHP section::get_json context
 * over the virtual dd15 record). dd15's LIST columns are the CLIENT's chosen
 * components (the caller section's fields shown as history columns), so — unlike
 * an ordinary section — its request_config.show.ddo_map is mirrored from
 * rqo.show.ddo_map (with ontology-term labels), NOT derived from the ontology.
 * The generic readSection context builder can't produce this, so the TM source
 * owns it (formerly the dispatch mode:'tm' branch).
 */
async function buildTmContext(rqo: Rqo, _principal: Principal): Promise<StructureContextEntry[]> {
	const source = (rqo.source ?? {}) as Record<string, unknown>;
	// The Time Machine (dd15) is consultation-only — cap at read (1) even for
	// admins so no TM column/subdatum renders editable (reverts go through
	// tool_time_machine, never inline edit). buildStructureContext caps the dd15
	// section by section_tipo too; this caps the value threaded to the columns.
	const permissions = 1;
	const { buildStructureContext } = await import('./structure_context.ts');

	// dd15's LIST columns are the CLIENT's show.ddo_map when it sends them (the
	// scoped history: the caller section's fields). When it sends NONE (the bare
	// dd15 list opened directly), derive dd15's OWN default list columns from the
	// ontology — same as readSectionRows does for the data (PHP build_request_config).
	const clientColumns = rqo.show?.ddo_map ?? [];
	let columns: { tipo?: unknown; label?: unknown; view?: unknown; column_id?: unknown }[] =
		clientColumns;
	if (clientColumns.length === 0) {
		const { deriveSectionDdoMap } = await import('../section/read.ts');
		columns = (await deriveSectionDdoMap(TM_SECTION_TIPO, TM_SECTION_TIPO, 'list')) as never;
	}

	const tmContext: StructureContextEntry[] = [];
	const sectionCtx = await buildStructureContext({
		tipo: TM_SECTION_TIPO,
		sectionTipo: TM_SECTION_TIPO,
		mode: 'list',
		lang: typeof source.lang === 'string' ? source.lang : currentDataLang(),
		permissions,
	});
	if (sectionCtx !== null) {
		// Mirror the client's show.ddo_map into the section's request_config so the
		// client renders the chosen columns (PHP parity — dd15 columns are client-driven).
		const requestConfig = (sectionCtx as { request_config?: { show?: { ddo_map?: unknown } }[] })
			.request_config?.[0];
		if (requestConfig?.show !== undefined) {
			const headerLang = typeof source.lang === 'string' ? source.lang : currentDataLang();
			requestConfig.show.ddo_map = await Promise.all(
				columns.map(async (d) => {
					const ddo = d as Record<string, unknown>;
					// PHP fills the column label from the ontology TERM when the client
					// didn't send one (dd1371→Proceso, dd559→Cuándo, …).
					const label =
						typeof ddo.label === 'string' && ddo.label !== ''
							? ddo.label
							: await termByTipo(String(ddo.tipo), headerLang);
					return {
						typo: 'ddo',
						tipo: ddo.tipo,
						section_tipo: TM_SECTION_TIPO,
						parent: TM_SECTION_TIPO,
						mode: 'tm',
						view: ddo.view ?? null,
						label,
						...(ddo.column_id !== undefined ? { column_id: ddo.column_id } : {}),
					};
				}),
			);
		}
		tmContext.push(sectionCtx);
	}
	for (const ddo of columns) {
		if (typeof ddo.tipo !== 'string') continue;
		// Per-column lang follows PHP's component lang rule: a TRANSLATABLE column
		// gets the data lang, a non-translatable one lg-nolan. The dd15 meta
		// columns are all non-translatable; rsc329 (the TM annotation) is NOT —
		// its context lang seeds the note modal's editor, so notes must WRITE in
		// the same lang the TM read lang-filters by, or a saved note never shows
		// (grey icon over existing text).
		const columnLang = (await getTranslatableByTipo(ddo.tipo))
			? typeof source.lang === 'string'
				? source.lang
				: currentDataLang()
			: 'lg-nolan';
		const entry = await buildStructureContext({
			tipo: ddo.tipo,
			sectionTipo: TM_SECTION_TIPO,
			mode: 'tm',
			lang: columnLang,
			permissions,
			parent: TM_SECTION_TIPO,
			view: (ddo as { view?: string }).view ?? null,
		});
		if (entry !== null) tmContext.push(entry);
	}
	return tmContext;
}

/**
 * Count TM rows for a request (pagination parity with the read). Thin wrapper
 * over the read source's count — kept for the count dispatch path / callers.
 */
export async function countTimeMachineData(rqo: Rqo): Promise<number> {
	return tmReadSource.count((rqo.sqo ?? {}) as Sqo);
}

/**
 * Adapter kept for direct callers/tests: run the TM query + build the standard
 * {sections envelope, per-row data} shape by composing the read source with the
 * shared emitDdoData. (The generic readSectionRows path does the same assembly.)
 */
export async function readTimeMachineData(rqo: Rqo): Promise<TmReadData> {
	const sqo = (rqo.sqo ?? {}) as Record<string, unknown>;
	const source = (rqo.source ?? {}) as Record<string, unknown>;
	// Request-scoped data lang backstop (S2-28), never a hardcoded lg-spa.
	const lang = typeof source.lang === 'string' ? source.lang : currentDataLang();
	const ddoMap = (rqo.show?.ddo_map ?? []) as Ddo[];
	const offset = Number(sqo.offset ?? 0);

	const { rows, isRecordList } = await queryTmRows(sqo);

	// The sections envelope (dd15; section_id = the TM row PK = matrix_id).
	const data: Record<string, unknown>[] = [
		{
			typo: 'sections',
			tipo: TM_SECTION_TIPO,
			section_tipo: [],
			entries: rows.map((row, index) => ({
				section_tipo: TM_SECTION_TIPO,
				section_id: row.id,
				paginated_key: index + offset,
				...tmEnvelopeExtra(row),
			})),
		},
	];

	// Requested column components (client ddo_map tipos, dd15-scoped only).
	const requestedTipos = ddoMap
		.map((ddo) => ddo.tipo)
		.filter((tipo): tipo is string => typeof tipo === 'string');
	const handled = new Set([TIPO_BULK_PROCESS, TIPO_TIMESTAMP, TIPO_USER, TIPO_COMPONENT]);
	// In the record-snapshot list, the section's own components ARE resolved (from
	// each snapshot's data), so only the per-component history reports metadata
	// misses as unhandled.
	const unhandled = isRecordList ? [] : requestedTipos.filter((tipo) => !handled.has(tipo));

	// Compose the shared per-row emission (identical to the generic readSectionRows
	// path — the source's emitRow over emitDdoData).
	const { emitDdoData } = await import('../section/read.ts');
	const emission = new EmissionContext(data as never);
	for (const row of rows) {
		await emitTmRow(row, ddoMap, lang, emission, emitDdoData as EmitDdo);
	}

	return { data, unhandled };
}
