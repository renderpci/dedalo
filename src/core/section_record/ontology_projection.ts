/**
 * ONTOLOGY NODE PROJECTION — the ONE per-record door into dd_ontology, and the
 * record-lifecycle hook that keeps a node moving with its source record.
 *
 * THE INVARIANT (ONT-1/2/3, audit 2026-09-26): `dd_ontology(tld)` equals the
 * parse of `matrix_ontology(<tld>0)` (+ its `<tld>0` root) for every tld that
 * holds a projection, and a torn-down tld holds none. ("Active" = holds rows,
 * getActiveTlds; nothing keys it on hierarchy4 yet — ontology_state
 * syncOntologyActivation.) The doors that write a tld's NODES from its source:
 *   - whole tld — `ontology/ontology_state.ts` rebuildOntology /
 *     retractOntology / syncOntologyActivation;
 *   - one record — `projectOntologyNode` / `unprojectOntologyNode` below;
 *   - record lifecycle — `projectOntologyRecordLifecycle` below, called inside
 *     the record's own transaction by `deleteSectionRecord`,
 *     `deleteSectionData` (section/record/delete_record.ts) and the birth
 *     chokepoint `writeBirth` (record_write.ts).
 * And the dd_ontology writers that are NOT a projection of a matrix record —
 * named so nobody reads the list above as exhaustive:
 *   - roots and groupers — `ontology/ontology_write.ts` createDdOntologyRootNode
 *     (`<tld>0`, no source record) and createParentGrouper (on the 'ensure'
 *     path: the grouper tld's registry row via ensureMainSection, the
 *     `ontology0` parent node, the `ontologytype0/<N>` matrix record and its
 *     `ontologytype<N>` node). The 'existing' path (the ontology update, the
 *     activation) builds none of them: the root names its grouper only;
 *   - the archive restore — `archive/restore.ts` upserts the archive's
 *     dd_ontology rows DIRECTLY, with no matrix_ontology source written. A node
 *     it INSERTS is an orphan to rebuildOntology (the tld's next update /
 *     rebuild removes it); one it OVERWRITES is re-derived back to the
 *     destination's source. Ledgered with the integrator: the archive door must
 *     write the source records, or refuse nodes the destination cannot source;
 *   - the seed / test fixtures (`test_data/`, the install seed).
 * Gates: test/unit/ontology_projection_guard_native.test.ts (the guard),
 * ontology_record_lifecycle_native.test.ts (the lifecycle),
 * ontology_derive_packages_native.test.ts + ontology_update_shell_native.test.ts
 * (the whole-tld doors). "ONE per-record door" is a census: only this module and
 * ontology_state.ts may PARSE an ontology record
 * (ontology_single_writer_tripwire rule 3).
 *
 * ADDRESSING RULE (INV-A). A governed record `<tld>0/<id>` projects the node
 * `<tld><id>` and nothing else: the tipo is `buildTipo(requiredOntologyTld(
 * sectionTipo), sectionId)` — derived from the record's ADDRESS, never read
 * from its data (`ontology7`) or from a snapshot. A record whose `ontology7`
 * parses into another namespace is REFUSED (`ontology.invalid_node`), so it can
 * never overwrite a canonical node of another tld — the `foreign` drift
 * ontology_state reports stays a report, not a write.
 *
 * WHY HERE (section_record/, a leaf). The lifecycle hook is called from the
 * write chokepoint, so this module must not pull the provisioning graph
 * (ontology_write.ts → create_record → select_lang …) into it: it imports only
 * the dd_ontology layer, the parser and the pure tld rules.
 */

import {
	type DdOntologyNode,
	deleteDdOntologyNode,
	readDdOntologyRow,
	upsertDdOntologyNode,
} from '../db/dd_ontology.ts';
import { DedaloError } from '../errors/dedalo_error.ts';
import { ONTOLOGY_OVERWRITE } from '../ontology/ontology_tipos.ts';
import { parseSectionRecordToOntologyNode } from '../ontology/parser.ts';
import { buildTipo, LOCAL_ONTOLOGY_SECTION, requiredOntologyTld } from '../ontology/tld.ts';

declare const addressBrand: unique symbol;

/**
 * A governed record's address and the ONE node tipo it may project. Only
 * `ontologyNodeAddress` mints it (the brand), so a tipo can never be handed in
 * from record data.
 */
export interface OntologyNodeAddress {
	readonly sectionTipo: string;
	readonly sectionId: number;
	readonly tld: string;
	readonly tipo: string;
	readonly [addressBrand]: true;
}

/**
 * The address of record `sectionTipo/sectionId`, or null when the section is
 * not an ontology node section (`localontology0`, `ontology35`, `ontology1..N`,
 * `test3`, … — see tld.ts requiredOntologyTld) or the id is not a positive
 * integer.
 */
export function ontologyNodeAddress(
	sectionTipo: string,
	sectionId: number | string,
): OntologyNodeAddress | null {
	const tld = requiredOntologyTld(sectionTipo);
	const id = positiveId(sectionId);
	if (tld === null || id === null) return null;
	return { sectionTipo, sectionId: id, tld, tipo: buildTipo(tld, id) } as OntologyNodeAddress;
}

/** The positive safe integer a section id names (a number, or a string of digits), or null. */
function positiveId(sectionId: number | string): number | null {
	const id =
		typeof sectionId === 'number'
			? sectionId
			: /^[0-9]+$/.test(sectionId)
				? Number(sectionId)
				: Number.NaN;
	return Number.isSafeInteger(id) && id >= 1 ? id : null;
}

/**
 * The refusal of a record whose parse lands outside its own address (INV-A) — a thin
 * DedaloError family (ERRORS_SPEC §2.1) on `ontology.invalid_node`. The CLASS is the
 * discriminator: the doors that tolerate THIS refusal (a restore is never blocked by it, a
 * setRecords batch names it and goes on — projectTolerant below, ontology_write.ts
 * setRecordsInDdOntology) must not swallow a grammar or DB-constraint refusal of the same
 * code (dd_ontology.ts), which stays fatal. Gate: ontology_projection_guard_native G2f.
 */
export class ForeignOntologyNodeRefused extends DedaloError {
	/** The operator line a tolerating door reports (a composed sentence, never raw text). */
	readonly line: string;

	constructor(address: OntologyNodeAddress, node: DdOntologyNode) {
		const line = `${address.sectionTipo}/${address.sectionId} declares tld '${node.tld ?? ''}' (parses to '${node.tipo}'), not '${address.tld}' — nothing written`;
		super('ontology.invalid_node', {
			message: line,
			coordinates: {
				section_tipo: address.sectionTipo,
				section_id: address.sectionId,
				declared_tld: node.tld ?? '',
			},
		});
		this.name = 'ForeignOntologyNodeRefused';
		this.line = line;
	}
}

/**
 * Parse the record at `address` and upsert its node — only when the parse IS
 * that address's node. `tldless` = the record declares no tld (or is absent):
 * nothing written. A parse into another tld or tipo throws ForeignOntologyNodeRefused
 * BEFORE any write.
 */
export async function projectOntologyNode(
	address: OntologyNodeAddress,
): Promise<{ kind: 'projected'; tipo: string } | { kind: 'tldless' }> {
	const node = await parseSectionRecordToOntologyNode(address.sectionTipo, address.sectionId);
	if (node === null) return { kind: 'tldless' };
	if (node.tld !== address.tld || node.tipo !== address.tipo) {
		throw new ForeignOntologyNodeRefused(address, node);
	}
	await upsertDdOntologyNode(node);
	return { kind: 'projected', tipo: node.tipo };
}

/** Remove the node at `address` (its tipo only). Returns the rows removed (0 or 1). */
export async function unprojectOntologyNode(address: OntologyNodeAddress): Promise<number> {
	return deleteDdOntologyNode(address.tipo);
}

export interface OntologyLifecycleOutcome {
	action: 'deleted' | 'projected' | 'reprojected' | 'skipped' | 'refused' | 'none';
	tipo?: string;
	reason?: string;
}

/**
 * Project `address`, turning the NAMESPACE refusal (ForeignOntologyNodeRefused) into a
 * warning. Nothing else is swallowed: a grammar / constraint refusal or any other error
 * propagates and aborts the caller's unit. No savepoint is needed for that: the namespace
 * refusal is raised after a read-only parse and before any statement, so the caller's
 * transaction holds no failed statement when it goes on.
 */
async function projectTolerant(
	address: OntologyNodeAddress,
	context: string,
): Promise<'projected' | 'tldless' | 'refused'> {
	try {
		return (await projectOntologyNode(address)).kind;
	} catch (error) {
		if (!(error instanceof ForeignOntologyNodeRefused)) throw error;
		console.warn(
			`[ontology_projection] ${context}: ${address.sectionTipo}/${address.sectionId} not projected — ${error.line}`,
		);
		return 'refused';
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object';
}

/** The ontology42 items of an override's relation image ([] when there are none). */
function overrideItems(relationImage: unknown): unknown[] {
	const items = isRecord(relationImage) ? relationImage[ONTOLOGY_OVERWRITE] : undefined;
	return Array.isArray(items) ? items : [];
}

/** The governed record one ontology42 locator addresses, or null. */
function overrideTarget(item: unknown): OntologyNodeAddress | null {
	if (!isRecord(item)) return null;
	const { section_tipo: sectionTipo, section_id: sectionId } = item;
	const idShaped = typeof sectionId === 'number' || typeof sectionId === 'string';
	return typeof sectionTipo === 'string' && idShaped
		? ontologyNodeAddress(sectionTipo, sectionId)
		: null;
}

/** The distinct governed records an override's ontology42 locators address. */
function overrideTargets(relationImage: unknown): OntologyNodeAddress[] {
	const targets = new Map<string, OntologyNodeAddress>();
	for (const item of overrideItems(relationImage)) {
		const address = overrideTarget(item);
		if (address !== null) targets.set(address.tipo, address);
	}
	return [...targets.values()];
}

type TolerantKind = Awaited<ReturnType<typeof projectTolerant>>;

/** An override's lifecycle: re-parse each ALREADY-projected node it addresses. */
async function overrideLifecycle(
	relationImage: unknown,
	context: string,
): Promise<OntologyLifecycleOutcome> {
	const kinds = new Map<string, TolerantKind>();
	for (const target of overrideTargets(relationImage)) {
		if ((await readDdOntologyRow(target.tipo)) === null) continue;
		kinds.set(target.tipo, await projectTolerant(target, context));
	}
	const reprojected = [...kinds].filter(([, kind]) => kind === 'projected').map(([tipo]) => tipo);
	if (reprojected.length > 0) return { action: 'reprojected', tipo: reprojected.join(',') };
	return [...kinds.values()].includes('refused')
		? { action: 'refused', reason: 'override target parses outside its namespace' }
		: { action: 'skipped', reason: 'no projected override target' };
}

/** What a governed birth's tolerant projection answers, by kind. */
const BIRTH_OUTCOME: Readonly<Record<TolerantKind, Omit<OntologyLifecycleOutcome, 'tipo'>>> = {
	projected: { action: 'projected' },
	refused: { action: 'refused', reason: 'record declares another tld' },
	tldless: { action: 'skipped', reason: 'record declares no tld' },
};

/** A governed record's birth: re-projected, only into a tld whose root is projected. */
async function governedBirth(
	address: OntologyNodeAddress,
	context: string,
): Promise<OntologyLifecycleOutcome> {
	if ((await readDdOntologyRow(`${address.tld}0`)) === null) {
		return { action: 'skipped', tipo: address.tipo, reason: 'tld not projected' };
	}
	return { tipo: address.tipo, ...BIRTH_OUTCOME[await projectTolerant(address, context)] };
}

/**
 * Move a record's dd_ontology node with its LIFECYCLE, inside the caller's
 * transaction (DML through the ambient `sql`; the cache fan-out is deferred to
 * the settle point by clearOntologyDerivedCaches itself). A rolled-back unit
 * rolls its projection back with it.
 *
 *  - governed `<tld>0/<id>`, `death`: the node `<tld><id>` is removed.
 *  - governed, `birth` (an undelete): re-projected — but only into a tld whose
 *    root `<tld>0` is projected (a torn-down tld — no root — is never
 *    re-planted). A record parsing into another namespace is REFUSED with a
 *    warning, never a throw (ForeignOntologyNodeRefused only — any other error
 *    aborts the unit): a restore is not blocked, and inspectOntology keeps
 *    naming the record as `foreign`.
 *  - `localontology0` (an override): each node its ontology42 addresses
 *    (`relationImage` = the before-image on death, the after-image on birth)
 *    is re-parsed — only when that node is already projected. The parser then
 *    picks the next-lowest override, or the canonical record. An override never
 *    deletes a canonical node and never creates one.
 *  - anything else: nothing (`none`, decided from the section tipo alone — no
 *    database read, so the chokepoints call this unconditionally).
 */
export async function projectOntologyRecordLifecycle(
	sectionTipo: string,
	sectionId: number,
	event: 'death' | 'birth',
	relationImage: unknown,
): Promise<OntologyLifecycleOutcome> {
	if (sectionTipo === LOCAL_ONTOLOGY_SECTION) {
		return overrideLifecycle(relationImage, `override ${sectionTipo}/${sectionId} ${event}`);
	}
	const address = ontologyNodeAddress(sectionTipo, sectionId);
	if (address === null) return { action: 'none' };
	if (event === 'birth') return governedBirth(address, `undelete ${sectionTipo}/${sectionId}`);
	await unprojectOntologyNode(address);
	return { action: 'deleted', tipo: address.tipo };
}
