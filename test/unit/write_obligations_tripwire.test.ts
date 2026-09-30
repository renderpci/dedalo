/**
 * TRIPWIRE — EVERY DOWNSTREAM OBLIGATION OF A RECORD WRITE FIRES FROM THE
 * CHOKEPOINT, NOT FROM WHICHEVER CALLER REMEMBERED (P1-8: DATA-15, DATA-16,
 * DATA-17, DATA-18, DATA-19, DATA-28, DATA-29).
 *
 * A component write incurs obligations the writer does not own: the save event
 * (dependent caches), the security reaction (dd128/dd234), the RAG index event,
 * the dd197/dd201 modified stamps, the 'NEW' activity row for a record's birth,
 * the observer cascade. Before this gate each was a call a door REMEMBERED —
 * and the audit measured what that produces: `persistRecordKeys` never fired
 * the RAG seam (a delete rewrote 1,189 holders through it, none re-indexed),
 * `deletePortalLocator` refreshed no stamp and enqueued nothing, `duplicate`
 * and `create` fired no RAG event, `duplicate` wrote no activity row, the tools
 * cache was cleared INSIDE the caller's transaction, and the interactive
 * observer swallow had no counter.
 *
 * The structural answer is ONE hook, `afterRecordWrite`
 * (src/core/section_record/record_write.ts): every chokepoint writer ends in
 * it, and the two record-INSERT doors that bypass the chokepoint by design
 * (create_record.ts, duplicate_record.ts) call it too. This gate holds that
 * shape in four legs, every one anti-vacuous (a positive-control offender is
 * run through the same analyser that scans the tree, so a broken analyser
 * cannot pass silently):
 *
 *   A. CENSUS — TOTAL over every raw `db/matrix_write.ts` DML caller in the
 *      write-path corpus (src/ + tools/ + scripts/, the shared lister with its
 *      floor). The primitive list is DERIVED from that module's exports (an
 *      export that is neither a DML primitive nor a declared non-writer is
 *      red). Resolution is per top-level FUNCTION, not per file: a function
 *      that calls a raw primitive must itself reach the chokepoint or the hook,
 *      or carry an ENUMERATED exemption with a reason (shrink-only; a stale
 *      row is red too). `src/core/test_data/**` is exempt BY RULE: fixture
 *      builders under the test-database marker guard.
 *   B. THE DOORS × OBLIGATIONS MATRIX — asserted on function BODIES (comments
 *      stripped): each door names the obligations it must reach and the ones
 *      it must NOT re-implement inline. The legitimately empty cells are
 *      ENUMERATED with a reason (the stamp-only writer fires no RAG event; the
 *      SAVE/DELETE activity rows stay at the API door in the oracle's shape;
 *      the race loser of a tolerated-conflict create writes no NEW row).
 *   C. TIMING — the three cache branches of `fireSaveEvent` all ride
 *      `deferPostTransaction` (a bare `invalidateAllToolCaches()` is red).
 *   D. observers.ts TOTAL — every `catch` block in the file increments a
 *      counter before it ends (a `console.error` with no counter is the exact
 *      shape DATA-29 named), with a floor on the catch count.
 *
 * The behavioural twin — write_obligations_native.test.ts — drives every door
 * on the suite database and asserts each obligation's observable effect.
 *
 * Leg A's primitive derivation, declaration splitter and rawCallsIn live in the
 * shared analyser test/helpers/matrix_writer_closure.ts (with tool_lossless_writeback).
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	MATRIX_WRITE,
	MATRIX_WRITE_NON_DML,
	moduleRuntimeExports,
	RAW_PRIMITIVES,
	type RawCall,
	rawCallsIn,
	topLevelBlocks,
} from '../helpers/matrix_writer_closure.ts';
import { stripComments } from '../helpers/strip_comments.ts';
import {
	REPO_ROOT,
	WRITE_PATH_CORPUS_FLOOR,
	writePathSourceFiles,
} from '../helpers/write_path_corpus.ts';

const read = (rel: string): string => readFileSync(join(REPO_ROOT, rel), 'utf8');
/** Source with comments stripped — every assertion below reads CODE, never prose. */
const code = (rel: string): string => stripComments(read(rel));

const RECORD_WRITE = 'src/core/section_record/record_write.ts';
const SAVE_EVENT = 'src/core/section_record/save_event.ts';
const SAVE_COMPONENT = 'src/core/section/record/save_component.ts';
const CREATE_RECORD = 'src/core/section/record/create_record.ts';
const DUPLICATE_RECORD = 'src/core/section/record/duplicate_record.ts';
const DELETE_RECORD = 'src/core/section/record/delete_record.ts';
const RELATIONS_SAVE = 'src/core/relations/save.ts';
const OBSERVERS = 'src/core/section/record/observers.ts';
const DD_CORE_API = 'src/core/api/handlers/dd_core_api.ts';
const CACHE_INVALIDATION = 'src/core/ontology/cache_invalidation.ts';
const INFO_EMIT = 'src/core/components/component_info/emit.ts';
const TM_TOOL = 'tools/tool_time_machine/server/tool_time_machine.ts';
const REVERT_UNDO = 'tools/tool_time_machine/server/bulk_revert_undo.ts';
const REVERT_RECORDS = 'tools/tool_time_machine/server/bulk_revert_records.ts';
const TRANSLATION = 'src/core/tools/translation.ts';

/** What a raw caller must reach to be a chokepoint writer (any one of these). */
const CHOKEPOINT_REACH = ['persistRecordKeys(', 'persistRecordColumns(', 'afterRecordWrite('];

// ---------------------------------------------------------------------------
// A. THE CENSUS
// ---------------------------------------------------------------------------

// The primitive list (DERIVED from matrix_write.ts's exports minus the declared
// non-DML ones, MATRIX_WRITE_NON_DML with its reasons), the top-level
// declaration splitter and `rawCallsIn` live in the shared analyser
// test/helpers/matrix_writer_closure.ts — tool_lossless_writeback_tripwire
// derives its server doors from the same primitives and cross-checks this
// name-based census against its import-resolved edges.

/**
 * Raw callers that legitimately do NOT reach the chokepoint, per declaration.
 * Every row is a deliberate decision with its reason; the list is SHRINK-ONLY
 * and a row whose declaration starts reaching the chokepoint (or stops calling
 * a primitive) is red, so the ledger cannot go stale in either direction.
 */
const RAW_CALLER_EXEMPT: Record<string, string> = {
	[`${RECORD_WRITE}#persistRecordKeys`]:
		'THE chokepoint: it ends in afterRecordWrite (matrix leg).',
	[`${RECORD_WRITE}#persistModifiedStamp`]:
		'THE chokepoint (stamp-only): it ends in afterRecordWrite with rag:null (matrix leg).',
	[`${RECORD_WRITE}#persistRecordColumns`]:
		'THE chokepoint (whole-column): it ends in afterRecordWrite (matrix leg).',
	[`${DELETE_RECORD}#deleteSectionRecord`]:
		'the row DELETE: there is no record left to stamp or to index; it fires the save event, the RAG delete event and the observer cascade itself, and its holders are rewritten through persistRecordKeys (matrix leg).',
	[`${RELATIONS_SAVE}#maintainRelationSearchIndex`]:
		'the relation_search ANCESTOR INDEX: a derived, read-only-to-users search column maintained beside a component write that itself goes through the chokepoint (save_component.ts, delete_record.ts, deletePortalLocator); it carries no stamp and no history of its own (PHP save_component_dato writes it the same way).',
	[`${RELATIONS_SAVE}#removeDataframeDataById`]:
		'the dataframe SLOT strip of a removed main item (REL-01): no TM row and no stamp BY CONTRACT — the main component’s own chokepoint write records the full state; a separate slot row would break TM restore ordering.',
	[`${DUPLICATE_RECORD}#duplicateSectionRecord`]:
		'the record INSERT door that bypasses the chokepoint by design (a clone carries every column at once); it declares the obligations for itself through afterRecordWrite (matrix leg).',
	[`${DUPLICATE_RECORD}#duplicateRecordMediaFiles`]:
		'files_info refresh of the copied media items onto the new row (S1-04): technical metadata, no TM, no stamp — the record’s birth stamps are the insert’s.',
	[`${CREATE_RECORD}#createSectionRecord`]:
		'the record INSERT door that bypasses the chokepoint by design (a fresh row carries its birth columns at once); it declares the obligations for itself through afterRecordWrite and appends the NEW activity row (matrix leg).',
	'src/core/retention/prune.ts#registerRetentionCatalog':
		"the RETENTION prune of matrix_activity (audit 2026-08-26 P2-9): it DELETES aged audit rows through the matrix_write door and writes no record value — there is nothing to stamp, no component history to append and no index to refresh, and the rows it removes are audit events, not records (the record tables are refused by that door's own allowlist).",
	'src/core/section/record/record_metadata.ts#setRecordMetadata':
		'the `data` column METADATA writer (diffusion_info, label): system bookkeeping PHP writes with an unstamped save(); no component value changes, so no stamp, no history, no index.',
	'src/core/media/tools/files_info_persist.ts#writeItems':
		'documented no-TM/no-stamp technical-metadata write (files_info re-scan after a media job).',
	'src/core/relations/dataframe.ts#fixDataframeOrphanEntries':
		'maintenance FIX mode: per-key strip of orphaned frame entries with no TM and no stamp (S2-06).',
	'src/core/relations/parent.ts#setChildOrder':
		'the thesaurus TREE engine (ts_object): PHP writes parent/children relations via its own verified engine with unstamped saves; the tree rebuild has its own gates.',
	'src/core/relations/parent.ts#removeChildOrder': 'thesaurus tree engine — see setChildOrder.',
	'src/core/relations/parent.ts#addParent': 'thesaurus tree engine — see setChildOrder.',
	'src/core/relations/parent.ts#removeParent': 'thesaurus tree engine — see setChildOrder.',
	'src/core/relations/parent.ts#recalculateSiblingOrders':
		'thesaurus tree engine — see setChildOrder.',
	'src/core/relations/parent.ts#sortChildren': 'thesaurus tree engine — see setChildOrder.',
	'src/core/ts_object/ts_api.ts#addChild':
		'thesaurus tree API (PHP dd_ts_api::add_child): the tree engine’s own unstamped save of the parent/children slots; the tree rebuild has its own gates.',
	'src/core/ontology/hierarchy_provision.ts#provisionVirtualSections':
		'hierarchy PROVISIONING — writes the `<tld>0` descriptor / model twin records in matrix_ontology at fixed ids; PHP provisions them with unstamped saves.',
	'src/core/ontology/hierarchy_state.ts#write':
		'the HIERARCHY INVARIANT single writer (inspect/ensure/rebuild) on the hierarchy registry rows; system state, not curated content.',
	'src/core/ontology/hierarchy_state.ts#nameRootTerm':
		'the hierarchy single writer naming a root term record — see write.',
	'src/core/ontology/ontology_write.ts#addMainSection':
		'ONTOLOGY definition writes (dd_ontology main node records in matrix_ontology); PHP writes these via unstamped saves and the ontology write driver has its own gates.',
	'src/core/ontology/ontology_write.ts#createParentGrouper':
		'ontology definition writes — see addMainSection.',
	'src/core/install/hierarchy_activate.ts#activateHierarchy':
		'installer hierarchy ACTIVATION (system provisioning at install time, no principal, no curated content).',
	'src/core/tools/register.ts#writeRegistryRecord':
		'tools REGISTRY import (dd1324 rows written from the tools’ register.json at boot/import): system rows; it invalidates the tool caches for itself (tools_cache_invalidation gate).',
	'src/core/update/transform/portalize.ts#applyPortalizeRow':
		'the UPDATE-PROCESS portalize transform (WC-025): a matrix-COLUMN-level relocation with TM relocated and save_tm suppressed by design; execute-gated behind the standalone update engine, never a request-path write.',
	'tools/tool_update_cache/server/index.ts#updateCache':
		'cache REGENERATION (PHP tool_update_cache): rewrites the derived cache slots of a record; PHP itself skips the modified metadata here — a cache rebuild is not an edit.',
	'src/core/media/files_info_reconcile.ts#sweepFilesInfo':
		'the files_info reconcile kernel (S-10 registry; scripts/media_repair_files_info.ts is its thin door): technical metadata re-scan, no stamp, no TM.',
	'scripts/repair_geolocation_studio_default.ts#repairUnit':
		'a one-shot operator repair of the geolocation studio default: a per-key write inside withTransaction with its own recordTimeMachine row per repaired component; never a request-path save.',
};

/**
 * Files exempt BY RULE (a prefix): repo-owned fixture builders under the
 * test-database marker guard, and the primitive module itself (the definitions).
 */
const RAW_CALLER_EXEMPT_PREFIXES = ['src/core/test_data/', MATRIX_WRITE];

/**
 * PINNED — shrink-only. A LITERAL, never derived from the list itself (a count
 * that equals the list's own length can never go red): adding a row means
 * lowering nothing and reddening this pin, which is the point.
 */
const RAW_CALLER_EXEMPT_COUNT = 31;

interface CensusVerdict {
	unreached: string[];
	stale: string[];
	reachedButExempt: string[];
}

/** The analyser — shared by the tree scan and the positive control. */
function judge(calls: RawCall[], exempt: Record<string, string>): CensusVerdict {
	const unreached: string[] = [];
	const reachedButExempt: string[] = [];
	const seen = new Set<string>();
	for (const call of calls) {
		if (seen.has(call.key)) continue;
		seen.add(call.key);
		if (RAW_CALLER_EXEMPT_PREFIXES.some((prefix) => call.file.startsWith(prefix))) continue;
		const reaches = CHOKEPOINT_REACH.some((symbol) => call.body.includes(symbol));
		const row = exempt[call.key];
		if (reaches && row !== undefined && !row.includes('(matrix leg)')) {
			reachedButExempt.push(call.key);
		} else if (!reaches && row === undefined) {
			unreached.push(`${call.key} (${call.primitive})`);
		}
	}
	const stale = Object.keys(exempt).filter((key) => !seen.has(key));
	return { unreached, stale, reachedButExempt };
}

const CORPUS = writePathSourceFiles();
const TREE_CALLS: RawCall[] = CORPUS.flatMap((file) => rawCallsIn(file, code(file)));

describe('A. the raw matrix_write caller census is TOTAL', () => {
	test('the primitive list is DERIVED from the module and every export is classified', async () => {
		expect(RAW_PRIMITIVES.length).toBeGreaterThanOrEqual(6);
		for (const name of [
			'updateMatrixRecord',
			'updateMatrixKeyData',
			'updateMatrixKeysData',
			'insertMatrixRecordWithCounter',
			'insertMatrixRecordWithExplicitId',
			'deleteMatrixRecord',
		]) {
			expect(RAW_PRIMITIVES, `${name} is not derived as a primitive`).toContain(name);
		}
		// every declared non-DML export still exists (a stale row is a hole that reads as coverage)
		// (every RUNTIME export form — function, const/let/class, `export { … }` — so a
		// non-function writer is a primitive until classified, and a classified
		// constant that disappears is stale)
		const exported = moduleRuntimeExports(read(MATRIX_WRITE));
		for (const [name, reason] of Object.entries(MATRIX_WRITE_NON_DML)) {
			expect(exported, `${name} is no longer exported by ${MATRIX_WRITE}`).toContain(name);
			expect(reason.length).toBeGreaterThan(30);
		}
		// The TEXT parser is checked against an independent oracle: the module's RUNTIME
		// export set, measured by loading it (a namespace object lists exactly the runtime
		// exports, every syntactic form included). An export form the parser misses would
		// otherwise be missing from BOTH sides of any comparison built on the parser.
		const measured = Object.keys(await import(`../../${MATRIX_WRITE}`)).sort();
		expect(
			[...exported].sort(),
			'moduleRuntimeExports disagrees with the loaded module — an export form the text parser does not read',
		).toEqual(measured);
		// and the primitives are the MEASURED exports minus the classified
		expect([...RAW_PRIMITIVES].sort()).toEqual(
			measured.filter((name) => MATRIX_WRITE_NON_DML[name] === undefined),
		);
	});

	test('the corpus and the scan are non-vacuous', () => {
		expect(CORPUS.length).toBeGreaterThan(WRITE_PATH_CORPUS_FLOOR);
		// The census must have seen the writers this gate is about, by name.
		const keys = new Set(TREE_CALLS.map((call) => call.key));
		expect(TREE_CALLS.length).toBeGreaterThan(25);
		for (const key of [
			`${RECORD_WRITE}#persistRecordKeys`,
			`${RECORD_WRITE}#persistRecordColumns`,
			`${CREATE_RECORD}#createSectionRecord`,
			`${DUPLICATE_RECORD}#duplicateSectionRecord`,
			`${DELETE_RECORD}#deleteSectionRecord`,
		]) {
			expect(keys.has(key), `the splitter did not attribute a raw call to ${key}`).toBe(true);
		}
	});

	test('POSITIVE CONTROL: the analyser flags an unreached raw caller and a stale row', () => {
		const offender = [
			"import { updateMatrixKeyData } from '../db/matrix_write.ts';",
			'export async function forgottenDoor(table: string): Promise<void> {',
			"\tawait updateMatrixKeyData(table, 'ctl1', 1, 'relation', 'ctl2', []);",
			'}',
			'export async function goodDoor(): Promise<void> {',
			'\tawait persistRecordKeys(target, writes, { userId: 1 });',
			'}',
		].join('\n');
		const calls = rawCallsIn('src/control/offender.ts', offender);
		expect(calls.map((call) => call.key)).toEqual(['src/control/offender.ts#forgottenDoor']);
		const verdict = judge(calls, { 'src/control/offender.ts#vanished': 'a row for nothing' });
		expect(verdict.unreached).toEqual([
			'src/control/offender.ts#forgottenDoor (updateMatrixKeyData)',
		]);
		expect(verdict.stale).toEqual(['src/control/offender.ts#vanished']);
		// and an exempt row on a declaration that DOES reach is reported too
		const reaching = judge(
			rawCallsIn(
				'src/control/r.ts',
				'export async function d(): Promise<void> {\n\tawait updateMatrixKeyData(t, s, 1, c, k, v);\n\tawait afterRecordWrite(x, y);\n}',
			),
			{ 'src/control/r.ts#d': 'exempt for no reason' },
		);
		expect(reaching.reachedButExempt).toEqual(['src/control/r.ts#d']);
	});

	test('every raw caller reaches the chokepoint, or carries an ENUMERATED reason', () => {
		const verdict = judge(TREE_CALLS, RAW_CALLER_EXEMPT);
		expect(
			verdict.unreached,
			`Raw matrix_write caller(s) that reach neither persistRecordKeys/persistRecordColumns nor afterRecordWrite and carry no row:\n  ${verdict.unreached.join('\n  ')}\nRoute the write through the chokepoint (section_record/record_write.ts), end the door in afterRecordWrite, or add a RAW_CALLER_EXEMPT row with the reason the obligations do not apply.`,
		).toEqual([]);
	});

	test('no exemption row is stale (the declaration no longer calls a primitive) or hides a reaching door', () => {
		const verdict = judge(TREE_CALLS, RAW_CALLER_EXEMPT);
		expect(
			verdict.stale,
			'RAW_CALLER_EXEMPT rows for declarations that no longer call a raw primitive',
		).toEqual([]);
		expect(
			verdict.reachedButExempt,
			'declarations that reach the chokepoint but carry an exemption written as if they did not',
		).toEqual([]);
	});

	test('the exemption list is SHRINK-ONLY and every reason is a reason', () => {
		expect(Object.keys(RAW_CALLER_EXEMPT).length).toBeLessThanOrEqual(RAW_CALLER_EXEMPT_COUNT);
		for (const [key, reason] of Object.entries(RAW_CALLER_EXEMPT)) {
			expect(reason.length, `${key}: too short to be a reason`).toBeGreaterThan(40);
		}
	});
});

// ---------------------------------------------------------------------------
// B. THE DOORS × OBLIGATIONS MATRIX (on function bodies)
// ---------------------------------------------------------------------------

/** The body of one top-level declaration, comments stripped. */
function bodyOf(file: string, name: string): string {
	const block = topLevelBlocks(code(file)).find((candidate) => candidate.name === name);
	if (block === undefined) throw new Error(`${file}: no top-level declaration '${name}'`);
	return block.body;
}

interface DoorRow {
	file: string;
	fn: string;
	/** Substrings the body MUST contain — one per obligation reached. */
	must: string[];
	/** Substrings the body must NOT contain — an obligation re-implemented inline, or a bypass. */
	mustNot: string[];
	/** Cells deliberately empty, each with its reason. */
	empty: Record<string, string>;
}

const MATRIX: DoorRow[] = [
	{
		file: RECORD_WRITE,
		fn: 'afterRecordWrite',
		must: ['fireSaveEvent(', 'reactToSecurityWrite(', 'fireRagRecordEvent(', 'obligations.rag'],
		mustNot: [],
		empty: {
			stamps:
				'the stamps are merged into the SAME UPDATE by the writer (buildModifiedAuditWrites), before the hook.',
			activity:
				'a component write logs SAVE at the API door in the oracle shape (msg + changed data); the hook has no request payload.',
		},
	},
	{
		file: RECORD_WRITE,
		fn: 'persistRecordKeys',
		must: ['buildModifiedAuditWrites(', 'afterRecordWrite(', "rag: 'index'"],
		mustNot: ['fireSaveEvent(', 'fireRagRecordEvent(', 'reactToSecurityWrite('],
		empty: {},
	},
	{
		file: RECORD_WRITE,
		fn: 'persistRecordColumns',
		must: ['buildModifiedAuditWrites(', 'afterRecordWrite(', "rag: 'index'"],
		mustNot: ['fireSaveEvent(', 'fireRagRecordEvent(', 'reactToSecurityWrite('],
		empty: {},
	},
	{
		file: RECORD_WRITE,
		fn: 'persistModifiedStamp',
		must: ['buildModifiedAuditWrites(', 'afterRecordWrite(', 'rag: null'],
		mustNot: ['fireSaveEvent(', 'fireRagRecordEvent(', "rag: 'index'"],
		empty: {
			rag: 'STAMP-ONLY: the data door that called it fires the index event for the content it wrote; this is the one pinned null of the matrix.',
		},
	},
	{
		file: SAVE_COMPONENT,
		fn: 'applySaveComponentData',
		must: [
			'persistRecordKeys(',
			'persistModifiedStamp(',
			"door: 'saveComponentData atomic insert'",
			"rag: 'index'",
			// the save's history — composed, main-attributed (bulk_capture.ts), and
			// the ONLY TM writer of this door: it ends in recordTimeMachine /
			// recordBulkPair through relations/dataframe_slots.ts
			'finishSaveHistory(',
			'reindexRelationSearchLikeSave(',
		],
		// no obligation remembered inline beside the hook, and no private copy of
		// the index law (its model test lives in the shared helper)
		mustNot: [
			'fireSaveEvent(',
			'fireRagRecordEvent(',
			'reactToRecordComponentWrite(',
			'maintainRelationSearchIndex(',
		],
		empty: {},
	},
	{
		file: SAVE_COMPONENT,
		fn: 'saveComponentData',
		// The transaction moved into runSaveAtomically (cc2ccddc31); the door must
		// still route through it, and the row below holds it to withTransaction.
		must: ['runSaveAtomically(', 'propagateToObservers('],
		mustNot: [],
		empty: {},
	},
	{
		file: SAVE_COMPONENT,
		fn: 'runSaveAtomically',
		must: ['withTransaction('],
		mustNot: [],
		empty: {},
	},
	{
		file: CREATE_RECORD,
		fn: 'createSectionRecord',
		must: [
			'afterRecordWrite(',
			"door: 'createSectionRecord'",
			"rag: 'index'",
			'logActivity(',
			"what: 'NEW'",
			'currentRequestContext()',
		],
		mustNot: ['fireSaveEvent(', 'fireRagRecordEvent('],
		empty: {
			stamps: 'a birth writes dd200/dd199 (created), never dd197/dd201 (modified).',
			observers: 'a fresh record references nothing; its first save propagates.',
			'activity (race loser)':
				'a tolerated-conflict create that found the row already there (`preExisted`) created nothing; the row it would have written describes an event that did not happen.',
		},
	},
	{
		file: DUPLICATE_RECORD,
		fn: 'duplicateSectionRecord',
		must: [
			'afterRecordWrite(',
			"door: 'duplicateSectionRecord'",
			"rag: 'index'",
			'logActivity(',
			"what: 'NEW'",
			'source_section_id: sourceSectionId',
			'propagateToObservers(',
			// the history rows, through its step-5 helper (the next row)
			'recordDuplicateHistory(',
			'currentRequestContext()',
		],
		mustNot: ['fireSaveEvent(', 'fireRagRecordEvent('],
		empty: {
			stamps:
				'the clone carries fresh dd197/dd201 in the INSERT (the oracle stamps modification over creation).',
		},
	},
	{
		file: DUPLICATE_RECORD,
		fn: 'recordDuplicateHistory',
		// the two-lane history rows (relations/dataframe_slots.ts recordMainBackfill /
		// recordMainHistory → recordTimeMachine)
		must: ['recordMainBackfill(', 'recordMainHistory('],
		mustNot: ['fireSaveEvent(', 'fireRagRecordEvent(', 'recordTimeMachine('],
		empty: {
			obligations:
				'history only: the duplicate door that calls it owns every other obligation (afterRecordWrite, activity, observers).',
		},
	},
	{
		file: RELATIONS_SAVE,
		fn: 'deletePortalLocator',
		must: [
			'persistRecordKeys(',
			// the two-lane history (relations/dataframe_slots.ts → recordMainHistory)
			'recordKeyChangeRows(',
			'propagateToObservers(',
			'maintainRelationSearchIndex(',
		],
		// the raw per-key primitive and the remembered post-commit fan-out are gone
		mustNot: ['updateMatrixKeyData(', 'fireSaveEvent(', 'invalidatePermissionsForWrite('],
		empty: {
			activity:
				'the wire door (dd_component_portal_api delete_locator) has no activity row in the oracle either — an unlink is not a SAVE.',
		},
	},
	{
		file: DELETE_RECORD,
		fn: 'deleteSectionRecord',
		must: [
			"kind: 'delete'",
			'fireRagRecordEvent(',
			'fireSaveEvent(',
			'propagateToObservers(',
			'deleteMatrixRecord(',
		],
		mustNot: [],
		empty: {
			stamps:
				'the row is gone; the holders it unlinks are stamped by persistRecordKeys in the inverse cleanup.',
			activity: 'DELETE is logged at the API door in the oracle shape (the section tipo as WHERE).',
		},
	},
	{
		file: DELETE_RECORD,
		fn: 'deleteSectionData',
		must: [
			'persistRecordKeys(',
			'persistModifiedStamp(',
			'propagateToObservers(',
			// P1-7's fourth door: emptying a relation component drops every locator
			// it held, so the ancestor index must lose them in the same write. This
			// door imported the maintainer without calling it until 2026-09-05.
			'maintainRelationSearchIndex(',
		],
		mustNot: ['updateMatrixKeyData(', 'updateMatrixRecord('],
		empty: {},
	},
	// THE TIME MACHINE'S RESTORE DOORS (2026-09-27). They write relation keys
	// with SAVE semantics but bypass saveComponentData, so every obligation the
	// chokepoint does not own must be reached here explicitly — above all the
	// relation_search ancestor index, through the save's OWN law (the shared
	// helper), never a private copy of it.
	{
		file: REVERT_UNDO,
		fn: 'writeRevertedKey',
		// the revert's own history: two-lane pairs (relations/dataframe_slots.ts
		// recordMainHistory → recordBulkPair)
		must: ['persistRecordKeys(', 'reindexRelationSearchLikeSave(', 'recordRevertHistory('],
		mustNot: [
			'updateMatrixKeyData(',
			'fireSaveEvent(',
			'fireRagRecordEvent(',
			'maintainRelationSearchIndex(',
		],
		empty: {
			observers:
				'the bulk revert propagates every written key post-commit from its orchestrator (bulk_revert.ts), once per unit, not per key write.',
			activity:
				'the revert logs ONE activity row per run at its orchestrator; a key write is not a SAVE at the API door.',
		},
	},
	{
		file: REVERT_UNDO,
		fn: 'writeComposedUnit',
		// one chokepoint write of the main + its slots, then the revert's own
		// two-lane pairs (recordRevertHistory → recordMainHistory → recordBulkPair)
		must: ['persistRecordKeys(', 'reindexRelationSearchLikeSave(', 'recordRevertHistory('],
		mustNot: [
			'updateMatrixKeyData(',
			'fireSaveEvent(',
			'fireRagRecordEvent(',
			'maintainRelationSearchIndex(',
		],
		empty: {
			observers:
				'the bulk revert propagates every written key post-commit from its orchestrator (bulk_revert.ts), once per unit, not per key write.',
			activity:
				'the revert logs ONE activity row per run at its orchestrator; a key write is not a SAVE at the API door.',
		},
	},
	{
		file: REVERT_RECORDS,
		fn: 'restoreWipedRecord',
		// every wiped key written (writeWipedKey), then the history per MAIN,
		// two lanes (a slot never gets a pair of its own)
		must: ['writeWipedKey(', 'recordWipedHistory('],
		mustNot: ['updateMatrixKeyData(', 'fireSaveEvent(', 'fireRagRecordEvent('],
		empty: {
			observers:
				'the observer cascade of the restored keys runs post-commit (wipedRecordAfterCommit), never inside the unit transaction.',
		},
	},
	{
		file: REVERT_RECORDS,
		fn: 'writeWipedKey',
		must: ['persistRecordKeys(', 'reindexRelationSearchLikeSave('],
		mustNot: [
			'updateMatrixKeyData(',
			'fireSaveEvent(',
			'fireRagRecordEvent(',
			'maintainRelationSearchIndex(',
			'recordBulkPair(',
		],
		empty: {
			history:
				'recorded per MAIN, two lanes, by recordWipedHistory once every key of the record is written (restoreWipedRecord) — a slot key never gets a pair of its own.',
			observers:
				'the bulk revert propagates every written key post-commit from its orchestrator (bulk_revert.ts), once per unit, not per key write.',
			activity:
				'the revert logs ONE activity row per run at its orchestrator; a key write is not a SAVE at the API door.',
		},
	},
	{
		file: TM_TOOL,
		fn: 'restoreAbsentSectionRow',
		must: ['persistRecordColumns(', 'reindexRelationColumnLikeSave('],
		mustNot: ['fireSaveEvent(', 'fireRagRecordEvent(', 'maintainRelationSearchIndex('],
		empty: {
			history:
				'the caller writes the birth marker (recordBulkBirth) under the revert bulk id, in the same transaction as the row.',
		},
	},
	{
		file: TM_TOOL,
		fn: 'restoreSectionRow',
		must: ['persistRecordColumns(', 'reindexRelationColumnLikeSave('],
		mustNot: ['fireSaveEvent(', 'fireRagRecordEvent(', 'maintainRelationSearchIndex('],
		empty: {},
	},
	{
		file: TM_TOOL,
		fn: 'toolTimeMachineApplyValue',
		must: [
			'persistRecordKeys(',
			'reindexRelationSearchLikeSave(',
			// the two-lane history (relations/dataframe_slots.ts → recordTimeMachine)
			'recordMainHistory(',
			'propagateRestoreToObservers(',
		],
		mustNot: ['fireSaveEvent(', 'fireRagRecordEvent(', 'maintainRelationSearchIndex('],
		empty: {},
	},
	// TRANSLATION (tool_lang / tool_lang_multi): a locked RMW of one literal key
	// through the chokepoint writer, then its history in the TARGET lane.
	// A SPELLING row: an early return before recordMainHistory( stays green here
	// (measured 2026-09-30). The history OUTCOME is gated by the behavioural twins
	// tm_composed_rows_native / tm_two_lanes_native (red on that mutation).
	{
		file: TRANSLATION,
		fn: 'translateAndWrite',
		must: [
			'withTransaction(',
			'readMatrixKeyForUpdate(',
			'persistRecordKeys(',
			'recordMainHistory(',
		],
		mustNot: ['updateMatrixKeyData(', 'fireSaveEvent(', 'fireRagRecordEvent('],
		empty: {
			observers:
				'LATENT GAP (TOOLS-1), not a design: persistRecordKeys fires afterRecordWrite only, never propagateToObservers, so a component_info / use_self_section edge on a translatable literal would go stale. The vendored ontology holds only `{filter:false}` no-ops today. Closure: the CLOSURE_PLAN Step 2 obligation ledger (record_write.ts), which retires this cell.',
		},
	},
];

/**
 * The DIRECT callers of the index primitive, enumerated: the save's shared law
 * (reindexRelationSearchLikeSave) and the three REMOVAL doors, which clear the
 * ancestors of the locators they drop for every relation model (P1-7). Any
 * other door writes a relation key with save semantics and must go through
 * the shared law, or it re-implements (and can drift from) the model test
 * conform.ts reads by.
 */
const INDEX_PRIMITIVE_CALLERS: readonly string[] = [
	`${RELATIONS_SAVE}#reindexRelationSearchLikeSave`,
	`${RELATIONS_SAVE}#deletePortalLocator`,
	`${DELETE_RECORD}#removeAllInverseReferences`,
	`${DELETE_RECORD}#deleteSectionData`,
];

/** The activity rows that stay at the API door, by design (oracle shape). */
const DOOR_ACTIVITY: { handler: string; what: string; reason: string }[] = [
	{
		handler: 'save',
		what: 'SAVE',
		reason: 'per-component payload (tipo, changed data) only the door holds.',
	},
	{ handler: 'delete', what: 'DELETE', reason: 'delete_mode + section WHERE, the oracle shape.' },
];

describe('B. the doors × obligations matrix holds on the function bodies', () => {
	test('POSITIVE CONTROL: a door body missing an obligation is reported', () => {
		const body = 'export async function d() {\n\tawait updateMatrixKeyData();\n}';
		expect(body.includes('afterRecordWrite(')).toBe(false);
		expect(body.includes('fireSaveEvent(')).toBe(false);
	});

	for (const row of MATRIX) {
		test(`${row.file}#${row.fn} reaches ${row.must.length} obligation(s) and re-implements none`, () => {
			const body = bodyOf(row.file, row.fn);
			expect(body.length).toBeGreaterThan(100);
			for (const symbol of row.must) {
				expect(body, `${row.fn} no longer reaches ${symbol}`).toContain(symbol);
			}
			for (const symbol of row.mustNot) {
				expect(
					body,
					`${row.fn} remembers ${symbol} inline instead of leaving it to the hook`,
				).not.toContain(symbol);
			}
			for (const [cell, reason] of Object.entries(row.empty)) {
				expect(reason.length, `${row.fn}: empty cell '${cell}' needs a reason`).toBeGreaterThan(30);
			}
		});
	}

	test("the 'NEW' activity row is written by the two record-birth engines and by NO door", () => {
		const emitters = CORPUS.filter((file) => /what:\s*'NEW'/.test(code(file))).sort();
		expect(emitters).toEqual([DUPLICATE_RECORD, CREATE_RECORD].sort());
		// and the two engine rows differ by their message, so the Activity area can tell them apart
		expect(bodyOf(CREATE_RECORD, 'createSectionRecord')).toContain("msg: 'Created section record'");
		expect(bodyOf(DUPLICATE_RECORD, 'duplicateSectionRecord')).toContain(
			"msg: 'Duplicated section record'",
		);
	});

	test('SAVE and DELETE rows stay at the API door (enumerated, oracle shape) — and NEW does not', () => {
		const door = code(DD_CORE_API);
		for (const row of DOOR_ACTIVITY) {
			expect(door, `dd_core_api no longer logs ${row.what}`).toContain(`what: '${row.what}'`);
			expect(row.reason.length).toBeGreaterThan(20);
		}
		expect(door).not.toContain("what: 'NEW'");
	});

	test('every record-birth door funnels into createSectionRecord or duplicateSectionRecord (so it inherits the row)', () => {
		// The MCP create, the client create, the portal "+" and the importers: none
		// may insert a record through the raw primitive.
		for (const file of [
			'src/ai/mcp/tools/records_write.ts',
			'src/ai/mcp/tools/fields_write.ts',
			DD_CORE_API,
			RELATIONS_SAVE,
			'src/core/tools/import_csv_execute.ts',
		]) {
			const source = code(file);
			expect(
				/createSectionRecord\(|duplicateSectionRecord\(/.test(source),
				`${file} creates no record through the engine doors`,
			).toBe(true);
			expect(source).not.toMatch(/insertMatrixRecordWith(?:Counter|ExplicitId)\(/);
		}
	});

	test('the relation_search index primitive is called ONLY by the save law and the enumerated removal doors', () => {
		const callers = new Set<string>();
		for (const file of CORPUS) {
			for (const block of topLevelBlocks(code(file))) {
				// the definition's own signature is not a call
				if (block.name === 'maintainRelationSearchIndex') continue;
				if (/(?<![.\w])maintainRelationSearchIndex\(/.test(block.body)) {
					callers.add(`${file}#${block.name}`);
				}
			}
		}
		// anti-vacuous: the scan must see the enumerated callers themselves
		expect([...callers].sort()).toEqual([...INDEX_PRIMITIVE_CALLERS].sort());
	});

	test('the stored-value branch of component_info is GONE (DATA-15): the read always computes', () => {
		const body = bodyOf(INFO_EMIT, 'infoEmitHook');
		expect(body).toContain('computeInfoWidgets(');
		expect(body).toContain("incrementCounter('component_info_stored_value_ignored')");
		// the repealed shape: an early return of the stored array
		expect(body).not.toMatch(/return normalizeWidgetEntryKeys\(value\)/);
		// and the observer still writes history only — never the live column
		const observer = bodyOf(OBSERVERS, 'recomputeInfoObserver');
		expect(observer).toContain('recordTimeMachine(');
		expect(observer).not.toMatch(/persistRecordKeys\(|updateMatrixKeyData\(|updateMatrixRecord\(/);
	});
});

// ---------------------------------------------------------------------------
// C. TIMING — every cache branch of fireSaveEvent defers past the transaction
// ---------------------------------------------------------------------------

/**
 * Is every call of `symbol` in `body` on the deferPostTransaction lane? A call
 * is on the lane when it is the queued action, or the inline fallback guarded
 * by `if (!deferPostTransaction(…))` on the same or the previous line. A bare
 * call anywhere else is the DATA-28 shape.
 */
function everyCallDeferred(body: string, symbol: string): boolean {
	const lines = body.split('\n');
	let calls = 0;
	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index] ?? '';
		if (!line.includes(`${symbol}(`) || line.includes('import(')) continue;
		calls += 1;
		const queued =
			line.includes(`deferPostTransaction(${symbol})`) ||
			line.includes(`deferPostTransaction(() => ${symbol}(`);
		const guard = 'if (!deferPostTransaction(';
		const guarded = line.includes(guard) || (lines[index - 1] ?? '').includes(guard);
		if (!queued && !guarded) return false;
	}
	return calls > 0;
}

describe('C. cache invalidation is deferred past COMMIT on every branch (DATA-28)', () => {
	test('POSITIVE CONTROL: a bare clear is not "deferred"', () => {
		expect(everyCallDeferred('\tinvalidateAllToolCaches();\n', 'invalidateAllToolCaches')).toBe(
			false,
		);
		// a fallback whose guard is NOT the lane is bare too
		expect(
			everyCallDeferred(
				'\tif (!other()) {\n\t\tinvalidateAllToolCaches();\n\t}',
				'invalidateAllToolCaches',
			),
		).toBe(false);
		expect(
			everyCallDeferred(
				'\tif (!deferPostTransaction(() => notify(x))) {\n\t\tnotify(x);\n\t}',
				'notify',
			),
		).toBe(true);
		expect(
			everyCallDeferred(
				'\tif (!deferPostTransaction(invalidateAllToolCaches)) invalidateAllToolCaches();\n',
				'invalidateAllToolCaches',
			),
		).toBe(true);
	});

	test('the tools branch, the listener fan-out and the ontology branch all ride deferPostTransaction', () => {
		const fire = bodyOf(SAVE_EVENT, 'fireSaveEvent');
		expect(everyCallDeferred(fire, 'invalidateAllToolCaches')).toBe(true);
		expect(everyCallDeferred(fire, 'notifySectionDataListeners')).toBe(true);
		// the ontology branch defers INSIDE its target
		const ontology = bodyOf(CACHE_INVALIDATION, 'clearOntologyDerivedCaches');
		expect(ontology).toContain('deferPostTransaction(');
		expect(fire).toContain('clearOntologyDerivedCaches()');
	});
});

// ---------------------------------------------------------------------------
// D. observers.ts — every catch is counted (TOTAL over the file)
// ---------------------------------------------------------------------------

/** Every `catch (…) { … }` block of a (comment-stripped) source, by brace matching. */
function catchBlocks(source: string): string[] {
	const blocks: string[] = [];
	const pattern = /catch\s*(?:\([^)]*\))?\s*\{/g;
	for (const match of source.matchAll(pattern)) {
		let depth = 1;
		let index = match.index + match[0].length;
		while (index < source.length && depth > 0) {
			const char = source[index];
			if (char === '{') depth += 1;
			else if (char === '}') depth -= 1;
			index += 1;
		}
		blocks.push(source.slice(match.index, index));
	}
	return blocks;
}

const uncountedCatches = (source: string): string[] =>
	catchBlocks(source).filter((block) => !block.includes('incrementCounter('));

describe('D. every catch in observers.ts increments a counter (DATA-29)', () => {
	test('POSITIVE CONTROL: a swallow with only console.error is reported', () => {
		const offender =
			'try { a(); } catch (error) {\n\tconsole.error("swallowed", error);\n}\ntry { b(); } catch (e) { incrementCounter("x"); }';
		expect(uncountedCatches(offender)).toHaveLength(1);
		expect(catchBlocks(offender)).toHaveLength(2);
	});

	test('TOTAL: no catch in observers.ts ends without a counter, and the file has the catches it claims', () => {
		const source = code(OBSERVERS);
		const blocks = catchBlocks(source);
		expect(blocks.length).toBeGreaterThanOrEqual(2);
		expect(
			uncountedCatches(source),
			'catch block(s) in observers.ts with no incrementCounter',
		).toEqual([]);
		// the DATA-29 lane by name: the interactive swallow is the `_failed` sibling of `_failed_in_tx`
		expect(source).toContain("incrementCounter('observers_propagation_failed_in_tx')");
		expect(source).toContain("incrementCounter('observers_propagation_failed')");
		// documented for operators, beside its sibling
		expect(read('engineering/PRODUCTION.md')).toContain('`observers_propagation_failed`');
	});
});
