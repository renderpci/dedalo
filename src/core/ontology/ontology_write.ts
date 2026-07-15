/**
 * Ontology write drivers — PHP ontology:: {insert_dd_ontology_record :2355,
 * set_records_in_dd_ontology :2502, regenerate_records_in_dd_ontology :2655,
 * sync_order_to_dd_ontology :2411, create_dd_ontology_ontology_section_node
 * :1042 (createDdOntologyRootNode), create_parent_grouper :1154,
 * add_main_section :809, get_main_* :2846}.
 *
 * These orchestrate the definition→runtime pipeline: they read matrix_ontology /
 * matrix_ontology_main records, (re)build the derived dd_ontology rows via the
 * parser + db/dd_ontology.ts write layer, and (for provisioning) write the
 * source matrix records that back a TLD's `<tld>0` main section, its groupers
 * and typology nodes. All jsonb/matrix I/O goes through db/matrix*.ts +
 * db/dd_ontology.ts + create_record.ts — no raw SQL here except a handful of
 * read-only existence/probe queries (parameterized, fixed-identifier) that no
 * helper expresses.
 *
 * TRANSACTIONS: setRecords is partial-success (each record independent — PHP does
 * not wrap it). regenerate uses the BACKUP-TABLE protocol as its rollback (NOT a
 * transaction — matches PHP + two-server coexistence) and LEAVES dd_ontology_bk
 * on success (PHP-pinned).
 *
 * LEDGER / divergences (per no-silent-narrowing):
 *  - setRecords LIST mode = full-section scan; PHP filters by the session SQO,
 *    which TS keeps no twin of. Documented divergence.
 *  - createDdOntologyRootNode typology fallback: when typology_id is absent we
 *    default to 15 ('others') directly rather than reading matrix_hierarchy_main
 *    (get_typology_locator_from_tld) — every caller in this workstream passes an
 *    explicit typology_id, so the DB probe is never reached. Ledgered.
 */

import {
	type DdOntologyNode,
	createBackupTable,
	deleteTldNodes,
	dropBackupTable,
	getActiveTlds,
	readDdOntologyRow,
	restoreFromBackupTable,
	updateDdOntologyColumns,
	upsertDdOntologyNode,
} from '../db/dd_ontology.ts';
import { readMatrixRecord } from '../db/matrix.ts';
import { updateMatrixKeyData } from '../db/matrix_write.ts';
import { sql } from '../db/postgres.ts';
import { createSectionRecord } from '../section/record/create_record.ts';
import {
	DATA_NOLAN,
	HIERARCHY_ACTIVE,
	HIERARCHY_ACTIVE_IN_THESAURUS,
	HIERARCHY_FILTER,
	HIERARCHY_GENERAL_TERM,
	HIERARCHY_LANG,
	HIERARCHY_TARGET_SECTION,
	HIERARCHY_TERM,
	HIERARCHY_TLD,
	HIERARCHY_TYPES_NAME,
	HIERARCHY_TYPES_SECTION,
	HIERARCHY_TYPOLOGY,
	ONTOLOGY_IS_DESCRIPTOR,
	ONTOLOGY_IS_MODEL,
	ONTOLOGY_MAIN_SECTION,
	ONTOLOGY_MODEL,
	ONTOLOGY_PARENT,
	ONTOLOGY_PUBLICATION,
	ONTOLOGY_TERM,
	ONTOLOGY_TLD,
	ONTOLOGY_TRANSLATABLE,
	ONTOLOGY_TYPE_GROUP,
	ONTOLOGY_TYPE_TLD,
	PROJECTS_SECTION,
	RELATION_TYPE_CHILDREN,
	RELATION_TYPE_LINK,
	RELATION_TYPE_PARENT,
	SECTION_MODEL_TIPO,
	SI_NO_NO,
	SI_NO_SECTION,
	SI_NO_YES,
	STRUCTURE_LANG,
} from './ontology_tipos.ts';
import { getTermIdFromLocator, parseSectionRecordToOntologyNode } from './parser.ts';
import { getMatrixTableFromTipo } from './resolver.ts';
import { getSectionIdFromTipo, getTldFromTipo, mapTldToTargetSectionTipo, safeTld } from './tld.ts';

const RELATION_TYPE_FILTER = 'dd675'; // DEDALO_RELATION_TYPE_FILTER
const LANG_SECTION = 'lg1';
const LANG_SPA_ID = '17344'; // lg-spa id in lg1

/** Standard write response (PHP $response shape). */
export interface OntologyWriteResponse {
	result: boolean;
	msg: string;
	errors: string[];
	total?: number;
	processed_count?: number;
	total_insert?: number;
}

// --- small item builders (byte-shape helpers) --------------------------------

/** A stored relation locator. section_id is always a STRING in the matrix. */
function relationLocator(fields: {
	id?: number;
	type: string;
	section_tipo: string;
	section_id: string | number;
	from_component_tipo: string;
}): Record<string, unknown> {
	const locator: Record<string, unknown> = {};
	if (fields.id !== undefined) locator.id = fields.id;
	locator.type = fields.type;
	locator.section_id = String(fields.section_id);
	locator.section_tipo = fields.section_tipo;
	locator.from_component_tipo = fields.from_component_tipo;
	return locator;
}

/** A stored literal item ({id, lang, value}). */
function literalItem(id: number, lang: string, value: string): Record<string, unknown> {
	return { id, lang, value };
}

/** term map ({lang: value}) from a list of {lang, value} name items. */
function termFromNameData(
	nameData: readonly { lang?: string; value?: unknown }[],
): Record<string, string> {
	const term: Record<string, string> = {};
	for (const item of nameData) {
		if (typeof item.lang === 'string') {
			term[item.lang] = String(item.value ?? '');
		}
	}
	return term;
}

/** True when a matrix record exists (existence probe; fixed-identifier table). */
async function matrixRecordExists(
	table: string,
	sectionTipo: string,
	sectionId: number,
): Promise<boolean> {
	const rows = (await sql.unsafe(
		`SELECT 1 FROM "${table}" WHERE section_tipo = $1 AND section_id = $2 LIMIT 1`,
		[sectionTipo, sectionId],
	)) as unknown[];
	return rows.length > 0;
}

/** Ensure a matrix record with an explicit id exists (create with audit metadata if missing). */
async function ensureMatrixRecord(
	sectionTipo: string,
	sectionId: number,
	userId: number,
): Promise<void> {
	const table = await getMatrixTableFromTipo(sectionTipo);
	if (table === null) {
		throw new Error(`ensureMatrixRecord: no matrix table for '${sectionTipo}'`);
	}
	if (!(await matrixRecordExists(table, sectionTipo, sectionId))) {
		await createSectionRecord(sectionTipo, userId, new Date(), sectionId);
	}
}

// --- main-record readers (PHP get_main_*) ------------------------------------

/**
 * The `matrix_ontology_main` row for a TLD (PHP get_ontology_main_from_tld):
 * a case-insensitive jsonpath probe on hierarchy6. Null when absent/unsafe TLD.
 */
export async function getOntologyMainFromTld(tld: string): Promise<{ section_id: number } | null> {
	const safe = safeTld(tld.trim().toLowerCase());
	if (safe === null) return null;
	const rows = (await sql.unsafe(
		`SELECT section_id FROM "matrix_ontology_main"
		 WHERE section_tipo = $1 AND string @> $2::text::jsonb LIMIT 1`,
		[ONTOLOGY_MAIN_SECTION, JSON.stringify({ [HIERARCHY_TLD]: [{ value: safe }] })],
	)) as { section_id: number }[];
	return rows[0] ? { section_id: Number(rows[0].section_id) } : null;
}

/** The lowercase TLD of a main record (PHP get_main_tld — reads hierarchy6). */
export async function getMainTld(
	sectionId: number | string,
	sectionTipo: string,
): Promise<string | null> {
	const table = await getMatrixTableFromTipo(sectionTipo);
	if (table === null) return null;
	const record = await readMatrixRecord(table, sectionTipo, Number(sectionId));
	const items = (record?.columns.string as Record<string, unknown[]> | null)?.[HIERARCHY_TLD] as
		| { value?: unknown }[]
		| undefined;
	const value = items?.[0]?.value;
	return value ? String(value).toLowerCase() : null;
}

/** The typology id of a TLD's main record (PHP get_main_typology_id; default 15). */
export async function getMainTypologyId(tld: string): Promise<number | null> {
	const main = await getOntologyMainFromTld(tld);
	if (main === null) return null;
	const table = 'matrix_ontology_main';
	const record = await readMatrixRecord(table, ONTOLOGY_MAIN_SECTION, main.section_id);
	const items = (record?.columns.relation as Record<string, unknown[]> | null)?.[
		HIERARCHY_TYPOLOGY
	] as { section_id?: unknown }[] | undefined;
	const sectionId = items?.[0]?.section_id;
	return sectionId !== undefined && sectionId !== null ? Math.trunc(Number(sectionId)) : 15;
}

/** The full multilingual name data of a TLD's main record (PHP get_main_name_data). */
export async function getMainNameData(
	tld: string,
): Promise<{ id?: number; lang: string; value: string }[] | null> {
	const main = await getOntologyMainFromTld(tld);
	if (main === null) return null;
	const record = await readMatrixRecord(
		'matrix_ontology_main',
		ONTOLOGY_MAIN_SECTION,
		main.section_id,
	);
	const items = (record?.columns.string as Record<string, unknown[]> | null)?.[HIERARCHY_TERM] as
		| { id?: number; lang?: string; value?: unknown }[]
		| undefined;
	if (items === undefined) return null;
	return items
		.filter(
			(item): item is { id?: number; lang: string; value: unknown } =>
				typeof item.lang === 'string',
		)
		.map((item) => ({ id: item.id, lang: item.lang, value: String(item.value ?? '') }));
}

// --- single-record upsert (PHP insert_dd_ontology_record) --------------------

/**
 * Parse one matrix record and upsert its dd_ontology row (PHP
 * insert_dd_ontology_record). Returns the node tipo, or null when the record is
 * invalid (missing TLD).
 */
export async function insertDdOntologyRecord(
	sectionTipo: string,
	sectionId: number | string,
): Promise<string | null> {
	const node = await parseSectionRecordToOntologyNode(sectionTipo, sectionId);
	if (node === null) {
		return null;
	}
	await upsertDdOntologyNode(node);
	return node.tipo;
}

// --- root node (PHP create_dd_ontology_ontology_section_node) -----------------

export interface FileItem {
	tld: string;
	section_tipo?: string;
	typology_id?: number | null;
	name_data?: { id?: number; lang?: string; value?: unknown }[] | null;
	parent_grouper_tipo?: string | null;
}

/**
 * Create/upsert the `<tld>0` root dd_ontology node (PHP
 * create_dd_ontology_ontology_section_node). Model 'section'/dd6, is_main,
 * relations [ontology1, dd1201], properties {main_tld, color:'#2d8894'}, parent =
 * the typology grouper (built on demand via createParentGrouper). Returns the tipo.
 */
export async function createDdOntologyRootNode(fileItem: FileItem, userId = -1): Promise<string> {
	const tld = fileItem.tld;
	const typologyId = fileItem.typology_id ?? 15; // default 'others' (see LEDGER)
	const nameData = fileItem.name_data ?? [{ lang: STRUCTURE_LANG, value: tld }];

	let parentGrouperTipo = fileItem.parent_grouper_tipo ?? null;
	if (parentGrouperTipo === null || parentGrouperTipo === '') {
		parentGrouperTipo = await createParentGrouper(
			ONTOLOGY_TYPE_GROUP,
			ONTOLOGY_TYPE_TLD,
			typologyId,
			userId,
		);
	}

	const tipo = `${tld}0`;
	const node: DdOntologyNode = {
		tipo,
		parent: parentGrouperTipo,
		term: termFromNameData(nameData as { lang?: string; value?: unknown }[]),
		model: 'section',
		order_number: null,
		relations: [{ tipo: 'ontology1' }, { tipo: 'dd1201' }],
		tld,
		properties: { main_tld: tld, color: '#2d8894' },
		model_tipo: SECTION_MODEL_TIPO,
		is_model: false,
		is_translatable: false,
		is_main: true,
		propiedades: null,
	};
	await upsertDdOntologyNode(node);
	return tipo;
}

// --- add main section (PHP add_main_section) ---------------------------------

/**
 * Idempotently create/update the matrix_ontology_main record for a TLD (PHP
 * add_main_section). Reuses the existing row (matched by hierarchy6) or creates a
 * new ontology35 record, then writes the registry components. Returns section_id.
 */
export async function addMainSection(fileItem: FileItem, userId = -1): Promise<number | null> {
	const tld = fileItem.tld;
	const targetSectionTipo = fileItem.section_tipo ?? mapTldToTargetSectionTipo(tld);
	const typologyId = fileItem.typology_id ?? null;
	const nameData = fileItem.name_data ?? [literalItem(1, STRUCTURE_LANG, tld)];

	const existing = await getOntologyMainFromTld(tld);
	const mainSectionId =
		existing !== null
			? existing.section_id
			: await createSectionRecord(ONTOLOGY_MAIN_SECTION, userId);
	const table = 'matrix_ontology_main';
	const write = (column: 'relation' | 'string', tipo: string, value: unknown): Promise<void> =>
		updateMatrixKeyData(table, ONTOLOGY_MAIN_SECTION, mainSectionId, column, tipo, value);

	// Project filter (dd153/1)
	await write('relation', HIERARCHY_FILTER, [
		relationLocator({
			id: 1,
			type: RELATION_TYPE_FILTER,
			section_tipo: PROJECTS_SECTION,
			section_id: '1',
			from_component_tipo: HIERARCHY_FILTER,
		}),
	]);
	// Active in thesaurus (only 'dd' → yes by default)
	await write('relation', HIERARCHY_ACTIVE_IN_THESAURUS, [
		relationLocator({
			id: 1,
			type: RELATION_TYPE_LINK,
			section_tipo: SI_NO_SECTION,
			section_id: tld === 'dd' ? SI_NO_YES : SI_NO_NO,
			from_component_tipo: HIERARCHY_ACTIVE_IN_THESAURUS,
		}),
	]);
	// Language (lg-spa)
	await write('relation', HIERARCHY_LANG, [
		relationLocator({
			id: 1,
			type: RELATION_TYPE_LINK,
			section_tipo: LANG_SECTION,
			section_id: LANG_SPA_ID,
			from_component_tipo: HIERARCHY_LANG,
		}),
	]);
	// Active (yes)
	await write('relation', HIERARCHY_ACTIVE, [
		relationLocator({
			id: 1,
			type: RELATION_TYPE_LINK,
			section_tipo: SI_NO_SECTION,
			section_id: SI_NO_YES,
			from_component_tipo: HIERARCHY_ACTIVE,
		}),
	]);
	// Name (multilingual) — normalize to {id:1, lang, value} items.
	const nameItems = (nameData as { id?: number; lang?: string; value?: unknown }[])
		.filter(
			(item): item is { id?: number; lang: string; value: unknown } =>
				typeof item.lang === 'string',
		)
		.map((item) => literalItem(item.id ?? 1, item.lang, String(item.value ?? '')));
	if (nameItems.length > 0) {
		await write('string', HIERARCHY_TERM, nameItems);
	}
	// TLD
	await write('string', HIERARCHY_TLD, [literalItem(1, DATA_NOLAN, tld)]);
	// Target section tipo
	await write('string', HIERARCHY_TARGET_SECTION, [literalItem(1, DATA_NOLAN, targetSectionTipo)]);
	// Typology (optional; PHP omits the item id here)
	if (typologyId !== null && typologyId !== undefined && Number(typologyId) > 0) {
		await write('relation', HIERARCHY_TYPOLOGY, [
			relationLocator({
				type: RELATION_TYPE_LINK,
				section_tipo: HIERARCHY_TYPES_SECTION,
				section_id: typologyId,
				from_component_tipo: HIERARCHY_TYPOLOGY,
			}),
		]);
	}
	// Root children (only 'dd': nodes 1 and 2)
	if (tld === 'dd') {
		await write('relation', HIERARCHY_GENERAL_TERM, [
			relationLocator({
				id: 1,
				type: RELATION_TYPE_CHILDREN,
				section_tipo: targetSectionTipo,
				section_id: '1',
				from_component_tipo: HIERARCHY_GENERAL_TERM,
			}),
			relationLocator({
				id: 2,
				type: RELATION_TYPE_CHILDREN,
				section_tipo: targetSectionTipo,
				section_id: '2',
				from_component_tipo: HIERARCHY_GENERAL_TERM,
			}),
		]);
	}

	return mainSectionId;
}

// --- parent grouper (PHP create_parent_grouper) ------------------------------

/** The 7-lang grouper labels for a typology TLD namespace (PHP :1170-1213). */
function grouperNameData(tld: string): { lang: string; value: string }[] {
	const suffix = tld === 'hierarchymtype' ? ` [m] | ${tld}` : ` | ${tld}`;
	const isOntology = tld === ONTOLOGY_TYPE_TLD;
	const pick = (ontologyLabel: string, hierarchyLabel: string): string =>
		(isOntology ? ontologyLabel : hierarchyLabel) + suffix;
	return [
		{ lang: 'lg-spa', value: pick('Tipologías de ontología', 'Tipologías de jerarquía') },
		{ lang: 'lg-eng', value: pick('Ontology typologies', 'Hierarchy typologies') },
		{ lang: 'lg-deu', value: pick('Ontologie-Typen', 'Typologien der Hierarchie') },
		{ lang: 'lg-fra', value: pick("Types d'ontologie", 'Typologies hiérarchiques') },
		{ lang: 'lg-ita', value: pick('Tipi di ontologia', 'Tipologie di gerarchia') },
		{ lang: 'lg-cat', value: pick("Tipus d'ontologia", 'Tipus de jerarquies') },
		{ lang: 'lg-ell', value: pick('Τύποι οντολογίας', 'Τυπολογίες ιεραρχίας') },
	];
}

/**
 * Ensure a typology grouper node exists in dd_ontology + the matrix and return
 * its tipo (PHP create_parent_grouper). Resilient to partial-bootstrap: creates
 * the grouper's own TLD registration, the `<parentTld>0` parent node/record, and
 * the typology matrix node `<tld><typologyId>` on demand.
 *
 * Groupers: ontology → ('ontology40','ontologytype'); hierarchy →
 * ('hierarchy56','hierarchytype'); hierarchy-model → ('hierarchy57','hierarchymtype').
 */
export async function createParentGrouper(
	parentGroup: string,
	tld: string,
	typologyId: number,
	userId = -1,
): Promise<string> {
	const nameData = grouperNameData(tld);
	const fileData: FileItem = {
		tld,
		typology_id: typologyId,
		name_data: nameData,
		parent_grouper_tipo: 'ontologytype14', // fixed — prevents grouper recursion
	};

	// Register the grouper's own TLD (matrix_ontology_main + <groupTld>0 node).
	await addMainSection(fileData, userId);
	await createDdOntologyRootNode(fileData, userId);

	// Parent node (e.g. ontology0 for parent group ontology40).
	const parentTld = getTldFromTipo(parentGroup);
	const parentSectionId = getSectionIdFromTipo(parentGroup);
	const parentNodeTipo = `${parentTld}0`;

	if ((await readDdOntologyRow(parentNodeTipo)) === null) {
		await upsertDdOntologyNode({
			tipo: parentNodeTipo,
			parent: parentGroup,
			term: null,
			model: 'section',
			order_number: null,
			relations: [{ tipo: 'ontology1' }, { tipo: 'dd1201' }],
			tld: parentTld,
			properties: { main_tld: parentTld, color: '#276f67' },
			model_tipo: SECTION_MODEL_TIPO,
			is_model: false,
			is_translatable: false,
			is_main: true,
			propiedades: null,
		});
	}

	// Parent matrix record (<parentNodeTipo>/<parentSectionId>).
	if (parentSectionId !== null) {
		await ensureMatrixRecord(parentNodeTipo, Number(parentSectionId), userId);
	}

	// Typology matrix node record: <tld>0 / <typologyId> (e.g. ontologytype/14).
	const typologySectionTipo = `${tld}0`;
	await ensureMatrixRecord(typologySectionTipo, typologyId, userId);
	const typologyTable = (await getMatrixTableFromTipo(typologySectionTipo)) ?? 'matrix_ontology';
	const write = (column: 'relation' | 'string', tipo: string, value: unknown): Promise<void> =>
		updateMatrixKeyData(typologyTable, typologySectionTipo, typologyId, column, tipo, value);

	// Publication (yes)
	await write('relation', ONTOLOGY_PUBLICATION, [
		relationLocator({
			id: 1,
			type: RELATION_TYPE_LINK,
			section_tipo: SI_NO_SECTION,
			section_id: SI_NO_YES,
			from_component_tipo: ONTOLOGY_PUBLICATION,
		}),
	]);
	// Is descriptor (yes)
	await write('relation', ONTOLOGY_IS_DESCRIPTOR, [
		relationLocator({
			id: 1,
			type: RELATION_TYPE_LINK,
			section_tipo: SI_NO_SECTION,
			section_id: SI_NO_YES,
			from_component_tipo: ONTOLOGY_IS_DESCRIPTOR,
		}),
	]);
	// Model (area model root dd0/4)
	await write('relation', ONTOLOGY_MODEL, [
		relationLocator({
			id: 1,
			type: RELATION_TYPE_LINK,
			section_tipo: 'dd0',
			section_id: '4',
			from_component_tipo: ONTOLOGY_MODEL,
		}),
	]);
	// Translatable (no)
	await write('relation', ONTOLOGY_TRANSLATABLE, [
		relationLocator({
			id: 1,
			type: RELATION_TYPE_LINK,
			section_tipo: SI_NO_SECTION,
			section_id: SI_NO_NO,
			from_component_tipo: ONTOLOGY_TRANSLATABLE,
		}),
	]);
	// Is model (no)
	await write('relation', ONTOLOGY_IS_MODEL, [
		relationLocator({
			id: 1,
			type: RELATION_TYPE_LINK,
			section_tipo: SI_NO_SECTION,
			section_id: SI_NO_NO,
			from_component_tipo: ONTOLOGY_IS_MODEL,
		}),
	]);
	// TLD
	await write('string', ONTOLOGY_TLD, [literalItem(1, DATA_NOLAN, tld)]);
	// Name = the typology term (hierarchy16 off hierarchy13/typologyId, all langs)
	const typologyTermItems = await readTypologyTermItems(typologyId);
	if (typologyTermItems.length > 0) {
		await write('string', ONTOLOGY_TERM, typologyTermItems);
	}
	// Parent locator (dd47 → <parentNodeTipo>/<parentSectionId>)
	await write('relation', ONTOLOGY_PARENT, [
		relationLocator({
			type: RELATION_TYPE_PARENT,
			section_tipo: parentNodeTipo,
			section_id: parentSectionId ?? '',
			from_component_tipo: ONTOLOGY_PARENT,
		}),
	]);

	// Re-derive the dd_ontology node for the typology matrix record.
	await insertDdOntologyRecord(typologySectionTipo, typologyId);

	return `${tld}${typologyId}`;
}

/** Read the typology's name (hierarchy16 off hierarchy13/typologyId), all langs. */
async function readTypologyTermItems(typologyId: number): Promise<Record<string, unknown>[]> {
	const table = await getMatrixTableFromTipo(HIERARCHY_TYPES_SECTION);
	if (table === null) return [];
	const record = await readMatrixRecord(table, HIERARCHY_TYPES_SECTION, typologyId);
	const items = (record?.columns.string as Record<string, unknown[]> | null)?.[
		HIERARCHY_TYPES_NAME
	] as Record<string, unknown>[] | undefined;
	return items ?? [];
}

// --- set_records (PHP set_records_in_dd_ontology) ----------------------------

export interface SetRecordsTarget {
	sectionTipo: string;
	/** Present → edit mode (single record); absent/null → list mode (all records). */
	sectionId?: number | null;
	userId?: number;
}

/**
 * Sync matrix ontology records into dd_ontology (PHP set_records_in_dd_ontology).
 * Edit mode processes one record; list mode processes every record of the section
 * (ordered by section_id — the TS full-section scan, see LEDGER). Partial success:
 * result=true when at least one record processed.
 */
export async function setRecordsInDdOntology(
	target: SetRecordsTarget,
): Promise<OntologyWriteResponse> {
	const userId = target.userId ?? -1;
	const response: OntologyWriteResponse = {
		result: false,
		msg: '',
		errors: [],
		total: 0,
		processed_count: 0,
	};

	const table = await getMatrixTableFromTipo(target.sectionTipo);
	if (table === null) {
		response.errors.push(`no matrix table for '${target.sectionTipo}'`);
		return response;
	}

	// Resolve the record ids to process.
	let ids: number[];
	if (target.sectionId !== undefined && target.sectionId !== null) {
		ids = [Number(target.sectionId)];
	} else {
		const rows = (await sql.unsafe(
			`SELECT section_id FROM "${table}" WHERE section_tipo = $1 ORDER BY section_id ASC`,
			[target.sectionTipo],
		)) as { section_id: number }[];
		ids = rows.map((row) => Number(row.section_id));
	}
	response.total = ids.length;

	if (ids.length === 0) {
		response.result = true;
		response.msg = `OK. No records found to process for ${target.sectionTipo}`;
		return response;
	}

	let processed = 0;
	for (const sectionId of ids) {
		let termId: string | null = null;
		if (target.sectionTipo === ONTOLOGY_MAIN_SECTION) {
			const tld = await getMainTld(sectionId, target.sectionTipo);
			const activeTlds = await getActiveTlds();
			if (tld === null || !activeTlds.includes(tld)) {
				const safe = tld === null ? null : safeTld(tld);
				if (safe === null) {
					response.errors.push(`Invalid TLD for deletion: ${tld}`);
					continue;
				}
				const deleted = await deleteTldNodes(safe);
				if (!deleted) {
					response.errors.push(`Unable to delete TLD nodes for: ${tld}`);
					continue;
				}
				termId = `${safe}0`;
			} else {
				const typologyId = await getMainTypologyId(tld);
				const nameData = await getMainNameData(tld);
				termId = await createDdOntologyRootNode(
					{
						tld,
						typology_id: typologyId,
						name_data: nameData,
						parent_grouper_tipo: `${ONTOLOGY_TYPE_TLD}${typologyId}`,
					},
					userId,
				);
			}
		} else {
			termId = await insertDdOntologyRecord(target.sectionTipo, sectionId);
		}

		if (termId === null || termId === '') {
			response.errors.push(
				`Failed to process dd_ontology record for section_tipo: ${target.sectionTipo}, section_id: ${sectionId}`,
			);
		} else {
			processed++;
		}
	}

	response.processed_count = processed;
	if (response.errors.length === 0) {
		response.result = true;
		response.msg = `OK. Request completed successfully for ${target.sectionTipo}`;
	} else if (processed > 0) {
		response.result = true;
		response.msg = `Partial success. Some records processed for ${target.sectionTipo}`;
	} else {
		response.msg = `Request failed for ${target.sectionTipo}`;
	}
	return response;
}

// --- regenerate — RETIRED 2026-07-15 -----------------------------------------
// The destructive dd_ontology rebuild moved to core/ontology/ontology_state.ts
// `rebuildOntology` (transactional; no leftover backup table) alongside the
// non-destructive `ensureOntology` reconcile. `regenerateRecordsInDdOntology` — the
// backup-table-based version — is gone; nothing may wipe-and-rebuild a tld outside
// ontology_state.ts (ontology_single_writer_tripwire).

// --- order sync (PHP sync_order_to_dd_ontology) — CONSUMED BY THE TREE (A5) ---

/**
 * Push new per-parent order_number values into dd_ontology after a tree reorder
 * (PHP sync_order_to_dd_ontology). Only rows whose dd_ontology parent matches the
 * reordered parent are touched; missing/mismatched/unchanged rows are skipped.
 * Returns the number of rows actually updated.
 *
 * EXPORTED WITH THIS EXACT SIGNATURE — the tree's save_order (Workstream A5)
 * imports it; do not change the shape.
 */
export async function syncOrderToDdOntology(
	changed: { value: number; locator: { section_tipo: string; section_id: number } }[],
	parentSectionTipo: string,
	parentSectionId: number,
): Promise<number> {
	if (changed.length === 0) {
		return 0;
	}
	const parentTermId = await getTermIdFromLocator({
		section_tipo: parentSectionTipo,
		section_id: parentSectionId,
	});
	if (parentTermId === null || parentTermId === '') {
		return 0;
	}
	let updated = 0;
	for (const item of changed) {
		const childTermId = await getTermIdFromLocator(item.locator);
		if (childTermId === null || childTermId === '') continue;
		const row = await readDdOntologyRow(childTermId);
		if (row === null) continue; // not an ontology node
		if ((row.parent ?? null) !== parentTermId) continue;
		if (Number(row.order_number ?? 0) === Number(item.value)) continue;
		if (
			await updateDdOntologyColumns(childTermId, { order_number: Math.trunc(Number(item.value)) })
		) {
			updated++;
		}
	}
	return updated;
}
