/**
 * ONTOLOGY STATE — the single source of truth for "is a TLD's runtime ontology
 * consistent with its source?", and the single writer that makes it so.
 *
 * WHY THIS EXISTS. `dd_ontology` is a DERIVED runtime projection of the editable
 * `matrix_ontology` records: one node per matrix record, produced by
 * `parseSectionRecordToOntologyNode`. The invariant is therefore a RECONCILIATION,
 * not a fixed checklist —
 *
 *     dd_ontology(tld)  ==  parse(matrix_ontology(tld))   (+ the bootstrap main node)
 *
 * The PHP-inherited design enforced that invariant ONE way: `regenerate` WIPED every
 * node for the TLD and rebuilt from scratch (`ontology_write.ts` deleteTldNodes → reinsert),
 * even when a single record had changed, with a leftover `dd_ontology_bk` table as its only
 * — and completely untested — rollback. That is slow (rebuild the world) and fragile (a
 * crash between the wipe and the reinsert leaves the runtime ontology EMPTY; two concurrent
 * runs clobber each other's backup table).
 *
 * This module replaces that with a DIFF:
 *   - `inspectOntology(tld)`  — pure read. The drift: which nodes are missing, stale or
 *     orphaned, and whether the main node is present. Nothing today can show you this.
 *   - `ensureOntology(tld)`   — idempotent INCREMENTAL reconcile: upsert the missing/stale
 *     nodes, delete the orphaned ones, bootstrap the main node if absent. NO WIPE, so the
 *     runtime ontology is never momentarily empty, and a healthy TLD is a no-op.
 *   - `rebuildOntology(tld)`  — the nuclear option (the old regenerate), but TRANSACTIONAL:
 *     the delete + reinsert run inside ONE `withTransaction`, so a mid-run failure rolls
 *     back automatically — no backup table, no leftover, no corruption window.
 *
 * NODE SOURCES (why orphan detection is clean). For tld `es`:
 *   - matrix records in section `es0` parse to nodes `es1, es2, …`  (the PROJECTION);
 *   - the `es0` MAIN node (is_main) is created by the bootstrap, NOT parsed;
 *   - the parent GROUPER node lives under tld `ontologytype`, not `es`.
 * So `stored(tld=es) − parsed − {the es0 main node}` is exactly the orphans, and the
 * grouper is never a false orphan.
 *
 * SINGLE WRITER: nothing outside this module wipe-and-rebuilds a TLD's dd_ontology. The
 * legacy `regenerateRecordsInDdOntology` is retired onto `rebuildOntology`. Guarded by
 * test/unit/ontology_single_writer_tripwire.test.ts.
 */

import {
	type DdOntologyNode,
	type DdOntologyRow,
	deleteDdOntologyNode,
	deleteTldNodes,
	upsertDdOntologyNode,
} from '../db/dd_ontology.ts';
import { sql, withTransaction } from '../db/postgres.ts';
import {
	type FileItem,
	addMainSection,
	createDdOntologyRootNode,
	getMainNameData,
	getMainTypologyId,
} from './ontology_write.ts';
import { parseSectionRecordToOntologyNode } from './parser.ts';
import { getMatrixTableFromTipo } from './resolver.ts';
import { mapTldToTargetSectionTipo, safeTld } from './tld.ts';

/** One node's place in the diff. */
export type OntologyDriftKind = 'missing' | 'stale' | 'orphaned';

export interface OntologyDriftItem {
	tipo: string;
	kind: OntologyDriftKind;
	/** For `stale`: which columns differ. Empty for missing/orphaned. */
	diffColumns: string[];
}

export interface OntologyState {
	tld: string | null;
	/** Count of matrix records that parsed into a node. */
	matrixNodes: number;
	/** Count of dd_ontology rows currently stored for the tld. */
	storedNodes: number;
	/** The `<tld>0` main node exists in dd_ontology. */
	mainNodeOk: boolean;
	drift: OntologyDriftItem[];
	/** No drift and the main node is present → dd_ontology matches its source. */
	inSync: boolean;
}

export interface EnsureOntologyResult {
	result: boolean;
	msg: string;
	errors: string[];
	state: OntologyState;
	/** What ensure actually changed (empty on a no-op reconcile). */
	applied: string[];
}

/* ------------------------------------------------------------------ reads */

/** Parse every matrix record of the TLD into a node map keyed by tipo. */
async function parseMatrixNodes(tld: string): Promise<Map<string, DdOntologyNode>> {
	const sectionTipo = mapTldToTargetSectionTipo(tld);
	const table = await getMatrixTableFromTipo(sectionTipo);
	const map = new Map<string, DdOntologyNode>();
	if (table === null) return map;
	const rows = (await sql.unsafe(
		`SELECT section_id FROM "${table}" WHERE section_tipo = $1 ORDER BY section_id ASC`,
		[sectionTipo],
	)) as { section_id: number }[];
	for (const row of rows) {
		const node = await parseSectionRecordToOntologyNode(sectionTipo, Number(row.section_id));
		if (node !== null) map.set(node.tipo, node);
	}
	return map;
}

/** Read every dd_ontology row for the TLD, keyed by tipo. */
async function storedNodes(tld: string): Promise<Map<string, DdOntologyRow>> {
	const rows = (await sql.unsafe(
		`SELECT tipo, parent, term, model, order_number, relations, tld,
		        properties, model_tipo, is_model, is_translatable, is_main, propiedades
		 FROM dd_ontology WHERE tld = $1`,
		[tld],
	)) as DdOntologyRow[];
	const map = new Map<string, DdOntologyRow>();
	for (const row of rows) {
		row.order_number =
			row.order_number === null || row.order_number === undefined
				? null
				: Math.trunc(Number(row.order_number));
		map.set(row.tipo, row);
	}
	return map;
}

/**
 * Stable, EMPTY-NORMALIZED JSON for comparison. Object keys are sorted (a jsonb round-trip
 * re-order is not a real diff), and every "absent" shape collapses to the same token: null,
 * `{}` and `[]` all read as absent. dd_ontology stores an empty component as SQL NULL, but
 * the parser may hand back `{}`/`[]`/`"{}"` for the same emptiness — comparing those as
 * different would churn live nodes on every reconcile for no semantic change.
 */
function stable(value: unknown): string {
	const norm = (v: unknown): unknown => {
		if (v === null || v === undefined) return null;
		if (typeof v !== 'object') return v;
		if (Array.isArray(v)) return v.length === 0 ? null : v.map(norm);
		const keys = Object.keys(v as Record<string, unknown>).sort();
		if (keys.length === 0) return null;
		const out: Record<string, unknown> = {};
		for (const key of keys) out[key] = norm((v as Record<string, unknown>)[key]);
		return out;
	};
	return JSON.stringify(norm(value));
}

/**
 * `propiedades` is a TEXT column holding v5-legacy JSON. The parser PRETTY-PRINTS it
 * (byte-exact PHP `JSON_PRETTY_PRINT` — 4-space indent), while a record written by an
 * older path may be MINIFIED. Those are the same content, and reconciling the whitespace
 * would rewrite huge swathes of the live ontology (779 of the `dd` tld's nodes) for zero
 * semantic gain — and churn the propiedades byte-contract. Compare by MEANING: parse both
 * and diff structurally; fall back to a text compare only when a side is not valid JSON.
 */
function propiedadesDiffer(a: string | null, b: string | null): boolean {
	if ((a ?? '') === (b ?? '')) return false;
	try {
		// stable() normalizes {}/[]/null to the same token, so "{}" vs SQL NULL is not a diff.
		return stable(JSON.parse(a || 'null')) !== stable(JSON.parse(b || 'null'));
	} catch {
		return (a ?? null) !== (b ?? null);
	}
}

/** The columns whose value differs between the parsed node and the stored row. */
function nodeDiffColumns(parsed: DdOntologyNode, stored: DdOntologyRow): string[] {
	const diffs: string[] = [];
	const scalar: (keyof DdOntologyNode)[] = [
		'parent',
		'model',
		'tld',
		'model_tipo',
		'is_model',
		'is_translatable',
		'is_main',
	];
	for (const key of scalar) {
		if ((parsed[key] ?? null) !== (stored[key] ?? null)) diffs.push(key);
	}
	// order_number: numeric, both normalized to number|null already.
	if ((parsed.order_number ?? null) !== (stored.order_number ?? null)) diffs.push('order_number');
	// jsonb columns: compare structurally (key order is not significant).
	for (const key of ['term', 'relations', 'properties'] as const) {
		if (stable(parsed[key] ?? null) !== stable(stored[key] ?? null)) diffs.push(key);
	}
	// propiedades: TEXT-holding-JSON — meaning, not whitespace.
	if (propiedadesDiffer(parsed.propiedades ?? null, stored.propiedades ?? null)) {
		diffs.push('propiedades');
	}
	return diffs;
}

/**
 * The full drift of ONE TLD. Pure read — safe on every render, writes nothing.
 */
export async function inspectOntology(rawTld: string): Promise<OntologyState> {
	const tld = safeTld(rawTld.trim().toLowerCase());
	if (tld === null) {
		return {
			tld: null,
			matrixNodes: 0,
			storedNodes: 0,
			mainNodeOk: false,
			drift: [],
			inSync: false,
		};
	}
	const parsed = await parseMatrixNodes(tld);
	const stored = await storedNodes(tld);
	const mainTipo = `${tld}0`;
	const mainNodeOk = (stored.get(mainTipo)?.is_main ?? false) === true;

	const drift: OntologyDriftItem[] = [];
	for (const [tipo, node] of parsed) {
		const row = stored.get(tipo);
		if (row === undefined) {
			drift.push({ tipo, kind: 'missing', diffColumns: [] });
		} else {
			const diffColumns = nodeDiffColumns(node, row);
			if (diffColumns.length > 0) drift.push({ tipo, kind: 'stale', diffColumns });
		}
	}
	for (const tipo of stored.keys()) {
		// The main node is bootstrap-created, not parsed — never an orphan.
		if (tipo === mainTipo) continue;
		if (!parsed.has(tipo)) drift.push({ tipo, kind: 'orphaned', diffColumns: [] });
	}

	return {
		tld,
		matrixNodes: parsed.size,
		storedNodes: stored.size,
		mainNodeOk,
		drift,
		inSync: drift.length === 0 && mainNodeOk,
	};
}

/* ----------------------------------------------------------------- writes */

/** Bootstrap the `<tld>0` main node + its registry (idempotent — PHP add_main_section). */
async function ensureMainNode(tld: string, userId: number): Promise<{ error: string | null }> {
	const typologyId = await getMainTypologyId(tld);
	const nameData = await getMainNameData(tld);
	const fileItem: FileItem = { tld, typology_id: typologyId, name_data: nameData };
	const mainSectionId = await addMainSection(fileItem, userId);
	if (mainSectionId === null || mainSectionId === undefined) {
		return { error: `add_main_section failed for tld '${tld}'` };
	}
	await createDdOntologyRootNode(fileItem, userId);
	return { error: null };
}

/**
 * Converge ONE TLD's dd_ontology to its matrix source — INCREMENTALLY. The only
 * non-destructive writer: it upserts what is missing/stale and deletes what is
 * orphaned, so the runtime ontology is never momentarily empty. Idempotent: a TLD
 * already in sync reports `applied: []`.
 */
export async function ensureOntology(rawTld: string, userId = -1): Promise<EnsureOntologyResult> {
	const applied: string[] = [];
	const errors: string[] = [];
	const tld = safeTld(rawTld.trim().toLowerCase());
	if (tld === null) {
		const state = await inspectOntology(rawTld);
		return {
			result: false,
			msg: `'${rawTld}' is not a valid TLD`,
			errors: [`invalid tld '${rawTld}'`],
			state,
			applied,
		};
	}

	const parsed = await parseMatrixNodes(tld);
	const stored = await storedNodes(tld);
	const mainTipo = `${tld}0`;

	// 1. upsert missing + stale (parse is authoritative — dd_ontology is its projection).
	for (const [tipo, node] of parsed) {
		const row = stored.get(tipo);
		const isMissing = row === undefined;
		const diff = isMissing ? [] : nodeDiffColumns(node, row);
		if (isMissing || diff.length > 0) {
			try {
				await upsertDdOntologyNode(node);
				applied.push(isMissing ? `+ ${tipo}` : `~ ${tipo} (${diff.join(',')})`);
			} catch (error) {
				errors.push(`upsert ${tipo}: ${String(error)}`);
			}
		}
	}

	// 2. delete orphans (a dd_ontology node the matrix source no longer produces).
	for (const tipo of stored.keys()) {
		if (tipo === mainTipo) continue;
		if (!parsed.has(tipo)) {
			try {
				await deleteDdOntologyNode(tipo);
				applied.push(`− ${tipo}`);
			} catch (error) {
				errors.push(`delete ${tipo}: ${String(error)}`);
			}
		}
	}

	// 3. the main node, only if absent (fill-only — a present one is rebuild's job to redo).
	if ((stored.get(mainTipo)?.is_main ?? false) !== true) {
		const main = await ensureMainNode(tld, userId);
		if (main.error !== null) errors.push(main.error);
		else applied.push(`main node ${mainTipo}`);
	}

	const state = await inspectOntology(tld);
	return {
		result: state.inSync && errors.length === 0,
		msg: state.inSync
			? applied.length === 0
				? `Ontology '${tld}' is already in sync`
				: `Ontology '${tld}' reconciled`
			: `Ontology '${tld}' is still out of sync`,
		errors,
		state,
		applied,
	};
}

/**
 * Wipe and rebuild ONE TLD's dd_ontology from its matrix source — the nuclear option,
 * TRANSACTIONAL. The delete + reinsert run inside one `withTransaction`: a failure at any
 * point rolls the whole thing back, so there is no window where the runtime ontology is
 * empty and no leftover backup table. Use only when the incremental `ensureOntology`
 * cannot converge (structural corruption). Returns the same shape as ensure.
 */
export async function rebuildOntology(rawTld: string, userId = -1): Promise<EnsureOntologyResult> {
	const tld = safeTld(rawTld.trim().toLowerCase());
	if (tld === null) {
		const state = await inspectOntology(rawTld);
		return {
			result: false,
			msg: `'${rawTld}' is not a valid TLD`,
			errors: [`invalid tld '${rawTld}'`],
			state,
			applied: [],
		};
	}

	const applied: string[] = [];
	const errors: string[] = [];
	try {
		await withTransaction(async () => {
			// Parse BEFORE the wipe: a bad record aborts the tx with the live data intact.
			const parsed = await parseMatrixNodes(tld);
			await deleteTldNodes(tld);
			for (const node of parsed.values()) {
				await upsertDdOntologyNode(node);
			}
			const main = await ensureMainNode(tld, userId);
			if (main.error !== null) throw new Error(main.error);
			applied.push(`rebuilt ${parsed.size} node(s)`, `main node ${tld}0`);
		});
	} catch (error) {
		errors.push(String(error));
		const state = await inspectOntology(tld);
		return {
			result: false,
			msg: `Rebuild of '${tld}' failed and was rolled back`,
			errors,
			state,
			applied: [],
		};
	}

	const state = await inspectOntology(tld);
	return {
		result: state.inSync,
		msg: state.inSync ? `Ontology '${tld}' rebuilt` : `Ontology '${tld}' rebuilt with drift`,
		errors,
		state,
		applied,
	};
}

/** Reconcile several TLDs, collecting a per-TLD outcome. */
export async function ensureOntologies(
	tlds: readonly string[],
	userId = -1,
): Promise<EnsureOntologyResult[]> {
	const out: EnsureOntologyResult[] = [];
	for (const tld of tlds) out.push(await ensureOntology(tld, userId));
	return out;
}

/** Rebuild several TLDs, collecting a per-TLD outcome. */
export async function rebuildOntologies(
	tlds: readonly string[],
	userId = -1,
): Promise<EnsureOntologyResult[]> {
	const out: EnsureOntologyResult[] = [];
	for (const tld of tlds) out.push(await rebuildOntology(tld, userId));
	return out;
}
