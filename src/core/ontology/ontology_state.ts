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
 * — and completely untested — rollback. That is fragile (a crash between the wipe and the
 * reinsert leaves the runtime ontology EMPTY; two concurrent runs clobber each other's
 * backup table).
 *
 * This module replaces that with ONE READ and ONE WRITE:
 *   - `inspectOntology(tld)`  — pure read. The drift: which nodes are missing, stale or
 *     orphaned, and whether the main node is present. Nothing today can show you this.
 *   - `rebuildOntology(tld)`  — the wipe-and-rebuild, but TRANSACTIONAL: the delete +
 *     reinsert run inside ONE `withTransaction`, so a mid-run failure rolls back
 *     automatically — no backup table, no leftover, no corruption window.
 *
 * WHY THERE IS NO INCREMENTAL RECONCILE (removed 2026-08-11). An `ensureOntology` used to sit
 * between the two: upsert the missing/stale nodes, delete the orphaned ones, fill the main node
 * if absent. Its ONLY claim over rebuild was "NO WIPE, so the runtime ontology is never
 * momentarily empty" — and that claim died the day rebuild became transactional. Under MVCC no
 * other session ever observes the empty window: readers see the old rows until the commit
 * publishes the new ones atomically. What remained was a strictly weaker writer (it FILLS the
 * main node; rebuild re-derives it) offered next to the stronger one, i.e. a decision the
 * operator had to make with no criterion to make it by — and a second write path to keep in
 * step with the parser forever. One writer, no choice, no drift between them.
 *
 * NODE SOURCES (why orphan detection is clean). For tld `es`:
 *   - matrix records in section `es0` parse to nodes `es1, es2, …`  (the PROJECTION);
 *   - the `es0` MAIN node (is_main) is created by the bootstrap, NOT parsed;
 *   - the parent GROUPER node lives under tld `ontologytype`, not `es`.
 * So `stored(tld=es) − parsed − {the es0 main node}` is exactly the orphans, and the
 * grouper is never a false orphan.
 *
 * MISFILED SOURCE RECORDS (drift kind `foreign`). A node's tipo AND tld come from the RECORD's
 * own `ontology7` value, not from the section it sits in — so a typo there (live: `actv0/127`
 * declares `ontology7="act"`) parses a record of section `es0` into a node of ANOTHER tld.
 * BOTH sides of the diff are therefore scoped to the inspected tld: `parseMatrixNodes` keeps
 * only `node.tld === tld` exactly as `storedNodes` reads `WHERE tld = $1`. The rejects are NOT
 * dropped — they surface as drift kind `foreign` naming the SOURCE RECORD (`es0/127 declares
 * tld 'act'`), which is the only thing an operator can act on. Without that scoping the foreign
 * node could never appear in `stored`, so it was reported `missing` forever (an unfixable false
 * failure), re-upserted on every run (breaking idempotency), and WRITTEN into the other tld's
 * namespace by a per-tld operation — where `deleteTldNodes(tld)` could never take it back.
 * Nothing here touches a byte outside the tld it was asked about: cleaning up a node the old bug
 * leaked into tld X is X's own rebuild (its wipe is scoped to X). The comparison is
 * EXACT, not case- or whitespace-insensitive: `ontology7 = "ES"` is a misfiled record too, and
 * saying so beats silently minting an `ES7` tipo. Gated by
 * test/unit/ontology_state_foreign_tld.test.ts.
 *
 * TLD-LESS SOURCE RECORDS (`tldlessRecords`) — the same blind spot, from the other side.
 * `ontology7` is MANDATORY: without it the parser returns null, so the record yields no tipo, no
 * dd_ontology row, and no place in the ontology tree. It used to be skipped in silence here, and
 * silence was indistinguishable from health — it could never appear in `stored` (there was no
 * tipo to look up) so it could not even be `missing`, and inspect reported `inSync: true` over
 * an administrator's invisible record. It is now named by its SOURCE RECORD, the only handle
 * that exists for it.
 *
 * It is a WARNING CHANNEL, NOT A DRIFT KIND, and that distinction was itself a bug once: filed
 * as drift it made `inSync` false, which the parser tool renders red — while nothing may write
 * those records (report-only, and normalizeOntologyTld skips contentless shells), so Rebuild
 * reported success against a panel that could never go green again. `drift`
 * means "dd_ontology disagrees with what the source parses to"; a record that parses to nothing
 * is absent from both sides and disagrees with nothing. Prevention lives upstream:
 * ontology/tld.ts requiredOntologyTld (the ONT-TLD rule), the birth stamp in
 * section/record/record_defaults.ts, the save refusal in section/record/save_component.ts, and
 * the post-COPY normalization in ontology/data_io_import.ts.
 *
 * SINGLE WRITER: nothing outside this module wipe-and-rebuilds a TLD's dd_ontology, and
 * inside it there is exactly ONE writer. The legacy `regenerateRecordsInDdOntology` is
 * retired onto `rebuildOntology`. Guarded by
 * test/unit/ontology_single_writer_tripwire.test.ts.
 */

import {
	type DdOntologyNode,
	type DdOntologyRow,
	deleteTldNodes,
	upsertDdOntologyNode,
} from '../db/dd_ontology.ts';
import { sql, withTransaction } from '../db/postgres.ts';
import { ONTOLOGY_TLD } from './ontology_tipos.ts';
import {
	addMainSection,
	createDdOntologyRootNode,
	type FileItem,
	getMainNameData,
	getMainTypologyId,
} from './ontology_write.ts';
import { parseSectionRecordToOntologyNode } from './parser.ts';
import { getMatrixTableFromTipo, getModelByTipo } from './resolver.ts';
import { mapTldToTargetSectionTipo, safeTld } from './tld.ts';

/**
 * One node's place in the diff. `foreign` is not a dd_ontology state at all — it is a SOURCE
 * record of this tld's section whose `ontology7` declares a different tld, so it can never be
 * part of this tld's projection. Rebuild refuses it and names it; only a data fix clears it.
 */
/**
 * NOTE: tld-less source records are deliberately NOT a drift kind. They are not a
 * disagreement between dd_ontology and its source (they are absent from both) —
 * they ride `OntologyState.tldlessRecords` instead. Adding a kind here also breaks
 * every consumer that enumerates the set, client and gate alike.
 */
export type OntologyDriftKind = 'missing' | 'stale' | 'orphaned' | 'foreign';

export interface OntologyDriftItem {
	/** The node tipo. For `foreign`, the tipo the misfiled record parses INTO (other tld). */
	tipo: string;
	kind: OntologyDriftKind;
	/** For `stale`: which columns differ. `['tld']` for `foreign`. Empty for missing/orphaned. */
	diffColumns: string[];
	/** `foreign` only: the offending source record, `<section_tipo>/<section_id>`. */
	source?: string;
	/** `foreign` only: the tld its `ontology7` declares (verbatim). */
	declaredTld?: string;
}

export interface OntologyState {
	tld: string | null;
	/** Count of matrix records that parsed into a node OF THIS TLD (the projection size). */
	matrixNodes: number;
	/** Count of dd_ontology rows currently stored for the tld. */
	storedNodes: number;
	/** The `<tld>0` main node exists in dd_ontology. */
	mainNodeOk: boolean;
	/** Count of source records of this tld's section that declare ANOTHER tld (misfiled). */
	foreignNodes: number;
	/** Count of source records of this tld's section that declare NO tld at all (unparseable). */
	tldlessNodes: number;
	/**
	 * Those records, as `<section_tipo>/<section_id>` — the operator's only handle
	 * on them (a record with no tld parses into no tipo). A WARNING channel, not
	 * drift: see the emission in inspectOntology for why they are kept out of it.
	 */
	tldlessRecords: string[];
	drift: OntologyDriftItem[];
	/** No drift and the main node is present → dd_ontology matches its source. */
	inSync: boolean;
}

export interface OntologyWriteResult {
	result: boolean;
	msg: string;
	errors: string[];
	state: OntologyState;
	/** What the write actually changed. */
	applied: string[];
}

/* ------------------------------------------------------------------ reads */

/** A source record of this tld's section whose `ontology7` names a DIFFERENT tld. */
interface ForeignRecord {
	/** The tipo it parses into — in the other tld's namespace. */
	tipo: string;
	/** The tld its `ontology7` declares, verbatim. */
	declaredTld: string;
	/** `<section_tipo>/<section_id>` — the record the operator must fix. */
	source: string;
}

/**
 * A source record of this tld's section that declares NO tld at all (ONT-TLD violated).
 *
 * `parseSectionRecordToOntologyNode` returns null for it — `ontology7` is mandatory — so it
 * produces no tipo, no dd_ontology row, and no presence in the ontology tree. Before this was
 * tracked the record was SILENTLY skipped here: it never reached `stored` (the parse produced no
 * tipo to look up), so it could not show as `missing`, and inspect reported `inSync: true` while
 * the administrator's record was invisible. Exactly the blind spot the `foreign` kind was added
 * to close, in the other direction.
 */
interface TldlessRecord {
	/** `<section_tipo>/<section_id>` — the record the operator must fix or delete. */
	source: string;
}

interface ParsedMatrixNodes {
	/** Nodes that belong to the inspected tld, keyed by tipo — the projection. */
	own: Map<string, DdOntologyNode>;
	/** Records of the same section that parsed into ANOTHER tld (see the module header). */
	foreign: ForeignRecord[];
	/** Records of the same section that parsed into NOTHING, for want of an ontology7. */
	tldless: TldlessRecord[];
}

/**
 * Parse every matrix record of the TLD's section, SPLIT by the tld the record declares.
 * `own` is scoped exactly as `storedNodes` (`tld = $1`) so the two sides of the diff cover the
 * same namespace; `foreign` and `tldless` carry the unusable records so they are diagnosed,
 * not chased.
 */
async function parseMatrixNodes(tld: string): Promise<ParsedMatrixNodes> {
	const sectionTipo = mapTldToTargetSectionTipo(tld);
	const table = await getMatrixTableFromTipo(sectionTipo);
	const own = new Map<string, DdOntologyNode>();
	const foreign: ForeignRecord[] = [];
	const tldless: TldlessRecord[] = [];
	if (table === null) return { own, foreign, tldless };

	// BEFORE blaming any record: can `ontology7` itself be resolved?
	//
	// parseSectionRecordToOntologyNode returns null for a record with no tld — AND
	// for a perfectly good record when `getModelByTipo(ontology7)` cannot answer,
	// which happens whenever dd_ontology has not been (re-)derived yet: mid
	// update_ontology, after a partial import, on a half-installed ontology. An
	// earlier version of this bucket assumed the first cause and attributed the
	// second to the DATA: on such an install `inspect('dd')` reported 1726 tld-less
	// records and named healthy ones (dd0/1, dd0/2 …) as the operator's fault.
	// One shared cause must never be reported as N record-level defects.
	if ((await getModelByTipo(ONTOLOGY_TLD)) === null) {
		throw new Error(
			`inspectOntology('${tld}'): the '${ONTOLOGY_TLD}' node cannot be resolved in dd_ontology, so NO record of '${sectionTipo}' can be parsed. This is an ontology-resolution failure, not a defect in the records — re-derive the 'ontology' tld first.`,
		);
	}

	const rows = (await sql.unsafe(
		`SELECT section_id FROM "${table}" WHERE section_tipo = $1 ORDER BY section_id ASC`,
		[sectionTipo],
	)) as { section_id: number }[];
	for (const row of rows) {
		const sectionId = Number(row.section_id);
		const node = await parseSectionRecordToOntologyNode(sectionTipo, sectionId);
		if (node === null) {
			// With ontology7 resolvable (guarded above), the remaining cause is what
			// this kind names: the RECORD declares no tld. Reported, never dropped.
			tldless.push({ source: `${sectionTipo}/${sectionId}` });
			continue;
		}
		if (node.tld !== tld) {
			foreign.push({
				tipo: node.tipo,
				declaredTld: node.tld ?? '',
				source: `${sectionTipo}/${sectionId}`,
			});
			continue;
		}
		own.set(node.tipo, node);
	}
	return { own, foreign, tldless };
}

/** The operator-facing line for one misfiled record: what is wrong, where, and that nothing ran. */
function foreignError(item: ForeignRecord, tld: string): string {
	return `${item.source} declares tld '${item.declaredTld}' (parses to node '${item.tipo}'), not '${tld}' — fix the record's ontology7; nothing was written for it`;
}

/**
 * Did a rebuild achieve everything a rebuild CAN achieve?
 *
 * `inSync` is the answer for the projection, and tld-less records no longer disturb it (they
 * ride their own channel). What this adds is a WHOLESALE-FAILURE floor: if the section holds
 * records but NOT ONE of them parsed, the tld has no projection at all, and calling that
 * "converged" would report a rebuild that deleted every node and re-inserted none as a success.
 * Something systemic is wrong in that case — never a per-record data fault — so it must fail.
 */
function rebuildConverged(state: OntologyState): boolean {
	if (state.matrixNodes === 0 && state.tldlessNodes > 0) return false;
	return state.inSync;
}

/**
 * The warning suffix appended to a SUCCESSFUL rebuild message, or ''.
 *
 * A tld-less record is a WARNING, not an error: unlike `foreign` — which would land a node in
 * another tld's namespace, where this tld's own writer could never take it back — it
 * contributes nothing to the projection, so rebuilding the rest is perfectly safe. But it is
 * still an administrator's record that the tree will never show, so a green run says so every
 * time rather than letting it pass in silence (the whole bug this kind exists to close).
 *
 * Named, not just counted — an operator needs the record to open. Capped, because an install
 * carrying legacy shells has dozens; the complete list is always in `state.tldlessRecords`.
 */
const TLDLESS_NAMED_LIMIT = 10;

function tldlessNote(state: OntologyState): string {
	if (state.tldlessNodes === 0) return '';
	const sources = state.tldlessRecords;
	const named = sources.slice(0, TLDLESS_NAMED_LIMIT).join(', ');
	const rest = sources.length - TLDLESS_NAMED_LIMIT;
	return ` — ${state.tldlessNodes} source record(s) declare no ontology7 and stay invisible in the tree: ${named}${rest > 0 ? ` (+${rest} more)` : ''}`;
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
 * different would report every live node as drifted on every inspect for no semantic change.
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
 * older path may be MINIFIED. Those are the same content, and calling the whitespace a
 * difference would paint huge swathes of the live ontology as drifted (779 of the `dd` tld's
 * nodes) for zero semantic gain, sending an operator to rebuild over nothing. Compare by
 * MEANING: parse both and diff structurally; fall back to a text compare only when a side is
 * not valid JSON.
 *
 * (A rebuild rewrites every row of the tld regardless, so it normalizes those bytes to the
 * parser's pretty-printed form. That is the canonical shape — the point here is only that
 * the DIFF must not manufacture a reason to run one.)
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
			foreignNodes: 0,
			tldlessNodes: 0,
			tldlessRecords: [],
			drift: [],
			inSync: false,
		};
	}
	const { own: parsed, foreign, tldless } = await parseMatrixNodes(tld);
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
	// Misfiled source records: real drift (the tld cannot be a faithful projection while one
	// exists) that no writer can clear — only editing the record's ontology7 does.
	for (const item of foreign) {
		drift.push({
			tipo: item.tipo,
			kind: 'foreign',
			diffColumns: ['tld'],
			source: item.source,
			declaredTld: item.declaredTld,
		});
	}
	// Tld-less source records are reported on their OWN channel, NOT as drift.
	//
	// `drift` answers "does dd_ontology match what the source parses to", and a
	// tld-less record parses to nothing — it is absent from both sides, so it is
	// not a disagreement between them. Filing it as drift made `inSync` false, which
	// this tool's client renders as a red "drifted" check; and since nothing may
	// write those records (report-only, and normalizeOntologyTld deliberately skips
	// contentless shells), Rebuild returned success while the panel stayed red
	// forever. An install carrying 92 legacy shells could not reach
	// green by any action available to it.
	//
	// So: `inSync` keeps its meaning, and `tldlessRecords` carries the finding.
	// Still loud — it is the whole point of the kind — but as a WARNING the operator
	// can act on (fill the tld, or delete the record), not a failure state.
	return {
		tld,
		matrixNodes: parsed.size,
		storedNodes: stored.size,
		mainNodeOk,
		foreignNodes: foreign.length,
		tldlessNodes: tldless.length,
		tldlessRecords: tldless.map((item) => item.source),
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
 * Wipe and rebuild ONE TLD's dd_ontology from its matrix source — the ONE writer,
 * TRANSACTIONAL. The delete + reinsert run inside one `withTransaction`: a failure at any
 * point rolls the whole thing back, so there is no window where the runtime ontology is
 * empty and no leftover backup table. Concurrent readers never see the wipe — MVCC publishes
 * the new projection atomically at commit — which is why no incremental companion is needed
 * (module header).
 */
export async function rebuildOntology(rawTld: string, userId = -1): Promise<OntologyWriteResult> {
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
			const { own: parsed, foreign } = await parseMatrixNodes(tld);
			// Misfiled records are reported, never rebuilt: `deleteTldNodes(tld)` below scopes
			// the wipe to THIS tld, so writing a foreign node would plant a row this rebuild
			// could never take back. A misfiled record does not block the tld's own rebuild —
			// it only keeps the result honest (result=false while the source stays wrong).
			for (const item of foreign) errors.push(foreignError(item, tld));
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
	const converged = rebuildConverged(state);
	return {
		result: converged,
		msg: converged
			? `Ontology '${tld}' rebuilt${tldlessNote(state)}`
			: state.foreignNodes > 0
				? `Ontology '${tld}' rebuilt; ${state.foreignNodes} source record(s) declare another tld and were skipped`
				: `Ontology '${tld}' rebuilt with drift`,
		errors,
		state,
		applied,
	};
}

/** Rebuild several TLDs, collecting a per-TLD outcome. */
export async function rebuildOntologies(
	tlds: readonly string[],
	userId = -1,
): Promise<OntologyWriteResult[]> {
	const out: OntologyWriteResult[] = [];
	for (const tld of tlds) out.push(await rebuildOntology(tld, userId));
	return out;
}
