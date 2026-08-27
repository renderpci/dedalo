/**
 * DUPLICATE × DATAFRAME — a duplicate may never SHARE the original's frame
 * TARGET records (DATA-05, S1, audit 2026-08-26; fix
 * WC-2026-08-27-duplicate-reminted-dataframe-targets).
 *
 * THE FAILURE CLASS THIS GATE CLOSES. `duplicateSectionRecord` copies the
 * relation column verbatim, stripping only the four audit tipos and the
 * covered-observer mirror slots. A dd490 pairing locator is NOT a reference
 * like the portal locators beside it: it OWNS the record it addresses — the
 * frame's fields live there, one target per data item. Copied verbatim, ONE
 * frame target ended up pointed at by two main items on two records, so a
 * curator correcting the COPY's frame silently rewrote the ORIGINAL's, and
 * under `properties.dataframe.delete_policy: "delete_target"` removing the
 * copy's main item EMPTIED the original's frame. Unconditional, silent, on an
 * everyday cataloguing action, over 84 `component_dataframe` nodes.
 *
 * WHY THE EXISTING GATE MISSES IT. `duplicate_record_native.test.ts` (the
 * DEC-14b twin) asserts what the duplicate's own columns CONTAIN — audit
 * stamps, copied values, meta counters, TM rows. Sharing a frame target is
 * invisible to every one of those assertions, because the bytes are correct:
 * what is wrong is the RECORD THEY POINT AT. This gate asserts the addresses.
 *
 * WHAT IT ASSERTS, and how it cannot go quietly green:
 *  - CENSUS TOTAL over the duplicate's whole bag — every jsonb column, every
 *    tipo, every entry, never a sampled tipo or the `relation` column alone;
 *  - the ANTI-VACUITY FLOOR runs first (test 1): the slot really is a
 *    `component_dataframe`, the source really carries paired dd490 frames, the
 *    targets really exist as records. A moved fixture or a shrunken corpus
 *    reddens the gate instead of satisfying it emptily;
 *  - the REFERENCE locators beside the frames must stay SHARED (test 5) — the
 *    fix must re-mint ownership edges and nothing else;
 *  - the corruption itself is reproduced behaviourally (test 4): the copy's
 *    frame is edited and the ORIGINAL's frame is re-read.
 *
 * TWO MORE FAILURE CLASSES, both introduced BY the fix and found by review:
 *  - THE CROSS-SECTION WRITE (test 8). Re-minting creates records in a section
 *    NO duplicate request names, and the only permission gate on the door is
 *    level 2 on the HOST section — so a curator with write on the host and
 *    READ-ONLY on the frame target section minted rows there by duplicating.
 *    Asserted with a REAL non-admin principal built here (band 943100-943199),
 *    holding exactly level 2 on the host and level 1 on the target, against a
 *    root positive control that proves the refusal is the grant and not a
 *    broken fixture;
 *  - THE PRE-FLIGHT (test 9). Every target is checked before the FIRST mint,
 *    so a refusal on target 2 does not leave target 1 already copied. Asserted
 *    by counting the copies of a live target across a refusal caused by its
 *    deleted sibling: moving the check inside the mint loop is otherwise a
 *    gate-green regression back to the half-mint the wire-contract entry calls
 *    the worst of the three outcomes.
 *
 * FOUR MORE, from the third adversarial round (2026-08-27) — each one a hole a
 * plausible refactor walked through while all nine tests above stayed green:
 *  - THE AUTHORIZATION HALF-MINT (test 10). Test 8's host carries ONE frame
 *    target, so moving ONLY the grant check into the mint loop keeps tests 8
 *    and 9 green and re-opens the half-mint: target 1 minted, target 2 refused
 *    on the grant. Catching it needs TWO targets in TWO sections the actor
 *    holds DIFFERENT levels on, and `test6744` declares exactly one target
 *    section (the engine refuses an off-target frame — `relation.insert_refused`
 *    / `off_target`, measured 2026-08-27), so this test builds its situation on
 *    the ONE host shape that can express it: `testmint1`, whose portal main
 *    `testmint1014` carries two dataframe slots with different target sections
 *    (`testmint1035` → `rsc1370`, `testmint1036` → `rsc1379`). Test 8 keeps its
 *    single-target fixture rather than being rebuilt on that host — the
 *    assertion the round asked for is here, whole;
 *  - THE CYCLE GUARD (test 11). `remintChain` + `chain.has(target.key)` is what
 *    stops a mutual frame pair from recursing forever on an ordinary duplicate.
 *    Deleting it left all nine earlier tests green;
 *  - THE DISCLOSURE ORDER (test 12). The grant is asked BEFORE the target
 *    record is read, so a principal without it cannot use the refusal as an
 *    existence oracle. Swapping the two blocks was green and silently turned a
 *    403 into "that record does not exist";
 *  - THE NARROWING (test 13). A dd490 entry whose `section_id` names no record
 *    address — absent, or an external remote id — OWNS nothing, so it shares
 *    nothing: it is copied verbatim, exactly as before the fix. The first cut
 *    refused it and made such a record permanently unduplicable for no
 *    integrity gain.
 *
 * The situation is BUILT, never found: a fresh host record in the generic
 * `test` TLD (test6099 / main test6117 / slot test6744), frame targets minted
 * at runtime in the slot's own declared target section, and every frame
 * written through the engine's own write path (dispatchRqo → save →
 * mergeCallerEntries → normalizeDataframeEntry), so the pairings under test
 * are real ones the server stamped, not hand-built dd490 literals.
 *
 * ONE HALF IS NOT GENERIC-`test`, and says so: the frame target section and its
 * literal are `rsc1242`/`rsc1248`, reached through the `seed()` helper. That is
 * the sanctioned carve-out — `generic_tld_tripwire` names `rsc` among the
 * SEED-SHIPPED TLDs every install carries, and `dataframe_idkey_native.test.ts`
 * is the precedent — not a generic-TLD situation: `test6744`'s own
 * `request_config` declares that section as its target, so the alternative is
 * not a `test` twin but a different slot testing a different contract.
 *
 * Scratch hygiene: every record this file mints — hosts, duplicates, frame
 * targets and the re-minted copies discovered in the duplicate's own bag —
 * is swept with its TM and dd542 activity rows in afterAll. Names are
 * assignment-unique (`dupdf`) because sibling agents write scratch records
 * into this same suite database concurrently.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { dataframeEntryMatches, isDataframeEntry } from '../../src/core/concepts/subdatum.ts';
import { encodeForJsonb } from '../../src/core/db/json_codec.ts';
import { MATRIX_JSONB_COLUMNS } from '../../src/core/db/matrix.ts';
import { deleteMatrixRecord } from '../../src/core/db/matrix_write.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { toErrorEnvelope } from '../../src/core/errors/convert.ts';
import { isDedaloError } from '../../src/core/errors/dedalo_error.ts';
import { getMatrixTableFromTipo, getModelByTipo } from '../../src/core/ontology/resolver.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import { duplicateSectionRecord } from '../../src/core/section/record/duplicate_record.ts';
import { saveComponentData } from '../../src/core/section/record/save_component.ts';
import {
	clearPermissionsCache,
	clearPrincipalCache,
	clearUserProjectsCache,
	getSectionPermissions,
	resolvePrincipal,
} from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';
import { registerSessionCleanup } from '../helpers/session_cleanup.ts';
import { cleanScratchRecord } from '../helpers/test_data.ts';

registerSessionCleanup();

/** Seed-shipped ontology, spelled out of the install-TLD census's token grammar. */
const seed = <T extends string, N extends number>(tld: T, id: N): `${T}${N}` => `${tld}${id}`;

const HOST_SECTION = 'test6099';
const MAIN = 'test6117'; // component_autocomplete — the main whose items get framed
const FRAME = 'test6744'; // its component_dataframe slot
/** The MAIN autocomplete's own target section: a REFERENCE edge, must stay shared. */
const MAIN_TARGET = 'test6810';
/** The frame slot's declared target section — test6744's own request_config. */
const FRAME_SECTION = seed('rsc', 1242);
/** A literal on the frame target record, so a copy can be proven independent. */
const FRAME_NOTE = seed('rsc', 1248); // component_text_area, non-translatable
const USER_ID = -1; // root

/**
 * THE SCRATCH IDENTITY (band 943100-943199, unique to this file — sibling
 * agents write into this same suite database concurrently).
 *
 * A REAL non-admin principal, because the authorization gap under test is only
 * expressible with one: `resolvePrincipal(-1)` is the superuser and clears
 * every grant, and the suite database's three installed users hold NO grant on
 * anything, so a "the curator is refused" assertion against them would pass at
 * zero-versus-zero — the green-suite trap in its ambient form. Shapes copied
 * from `test/helpers/acl_identity_fixture.ts` (dd244 flag locator, dd1725
 * profile locator, the `misc.dd774` grant matrix `getPermissionsTable` reads);
 * not that helper itself, because its profile grants `test3` and this gate
 * needs two DIFFERENT levels on two OTHER sections.
 */
const READER_USER_ID = 943101;
const READER_PROFILE_ID = 943111;
/** Level 2 on the HOST: this curator may legitimately duplicate the record. */
const READER_HOST_LEVEL = 2;
/** Level 1 on the FRAME TARGET section: read-only. The whole point. */
const READER_FRAME_LEVEL = 1;

/**
 * THE TWO-SECTION HOST (test 10). One duplicate can only reach two sections the
 * actor holds DIFFERENT grants on when the ontology declares two dataframe
 * slots with two different target sections: the engine refuses an off-target
 * frame outright (`validateRelationInsert` → `relation.insert_refused`,
 * constraint `off_target`), so a frame pointing anywhere else cannot be written
 * through the write path this file insists on using.
 *
 * `testmint1` is that shape, and it is repo-owned generic `test`-TLD ontology
 * (`src/core/test_data/test_tld_ontology.json`), not an install's: portal main
 * `testmint1014` carries `testmint1035` → `rsc1370` and `testmint1036` →
 * `rsc1379`. The target sections are seed-shipped `rsc`, the same sanctioned
 * carve-out the frame section below is.
 */
const CROSS_HOST = 'testmint1';
const CROSS_MAIN = 'testmint1014'; // component_portal — the two slots' main
const CROSS_FRAME_GRANTED = 'testmint1035'; // → CROSS_GRANTED, reader holds 2
const CROSS_FRAME_DENIED = 'testmint1036'; // → CROSS_DENIED, reader holds 1
const CROSS_GRANTED = seed('rsc', 1370);
const CROSS_DENIED = seed('rsc', 1379);
/** A literal on the GRANTED target section, so its copies can be counted. */
const CROSS_NOTE = seed('rsc', 1377); // component_input_text, translatable
/** The identity rows this file owns, in sweep order. */
const IDENTITY_ROWS: [string, string, number][] = [
	['matrix_users', 'dd128', READER_USER_ID],
	['matrix_profiles', 'dd234', READER_PROFILE_ID],
];

/** Resolved, never named: the ontology decides which table each section lives in. */
let HOST_TABLE = '';
let FRAME_TABLE = '';
let CROSS_HOST_TABLE = '';
let CROSS_GRANTED_TABLE = '';
let CROSS_DENIED_TABLE = '';
/** The jsonb column FRAME_NOTE is stored in — DERIVED from a real stored row. */
let NOTE_COLUMN = '';
/** Same, for CROSS_NOTE — derived the first time a cross target is minted. */
let CROSS_NOTE_COLUMN = '';

/**
 * Two MAIN items, so the per-item pairing is exercised — and so the "two items
 * framing the SAME record" topology below is expressible at all.
 */
const MAIN_SEED = [
	{ id: 1, type: 'dd151', section_id: 1, section_tipo: MAIN_TARGET, from_component_tipo: MAIN },
	{ id: 2, type: 'dd151', section_id: 2, section_tipo: MAIN_TARGET, from_component_tipo: MAIN },
];

/** One dd490 pairing found anywhere in a stored row, with where it was found. */
interface FrameCensusEntry {
	column: string;
	tipo: string;
	address: string;
	entry: Record<string, unknown>;
}

let tsContext: Record<string, unknown>;
/** Every record minted here, swept in afterAll: [section_tipo, section_id, table]. */
const minted: [string, number, string][] = [];

let hostId = 0;
let dupId = 0;
let targetA = 0;
let targetB = 0;
let sourceFrames: FrameCensusEntry[] = [];
let dupFrames: FrameCensusEntry[] = [];

/** Read one stored row as a plain column → value map. */
async function readRow(
	table: string,
	sectionTipo: string,
	sectionId: number,
): Promise<Record<string, unknown> | undefined> {
	const columns = MATRIX_JSONB_COLUMNS.map((column) => `"${column}"`).join(', ');
	const rows = (await sql.unsafe(
		`SELECT ${columns} FROM "${table}" WHERE section_tipo = $1 AND section_id = $2`,
		[sectionTipo, sectionId],
	)) as Record<string, unknown>[];
	return rows[0];
}

/**
 * CENSUS TOTAL: every dd490 entry in EVERY jsonb column of a row. Not the
 * `relation` column alone and not a listed tipo — the defect is about what a
 * locator ADDRESSES, and a census narrower than the bag would report green
 * over the half it never looked at.
 */
function censusFrames(row: Record<string, unknown> | undefined): FrameCensusEntry[] {
	const found: FrameCensusEntry[] = [];
	for (const column of MATRIX_JSONB_COLUMNS) {
		const columnData = row?.[column];
		if (columnData === null || typeof columnData !== 'object') continue;
		for (const [tipo, items] of Object.entries(columnData as Record<string, unknown>)) {
			if (!Array.isArray(items)) continue;
			for (const entry of items as Record<string, unknown>[]) {
				if (!isDataframeEntry(entry)) continue;
				found.push({
					column,
					tipo,
					address: `${String(entry.section_tipo)}/${String(entry.section_id)}`,
					entry,
				});
			}
		}
	}
	return found;
}

/**
 * ONE host/main/slot/target quadruple — the situation a frame is written into.
 * Parameterised because test 10 needs a SECOND one: two slots on one host,
 * declaring two different target sections (see CROSS_HOST above).
 */
interface FrameSituation {
	host: string;
	main: string;
	slot: string;
	target: string;
}

/** The situation the first nine tests build on. */
const BASE_SITUATION: FrameSituation = {
	host: HOST_SECTION,
	main: MAIN,
	slot: FRAME,
	target: FRAME_SECTION,
};
/** testmint1's two slots: the reader may write the first target's section only. */
const CROSS_GRANTED_SITUATION: FrameSituation = {
	host: CROSS_HOST,
	main: CROSS_MAIN,
	slot: CROSS_FRAME_GRANTED,
	target: CROSS_GRANTED,
};
const CROSS_DENIED_SITUATION: FrameSituation = {
	host: CROSS_HOST,
	main: CROSS_MAIN,
	slot: CROSS_FRAME_DENIED,
	target: CROSS_DENIED,
};

/** The frame-save RQO the client sends: a raw picker locator + the pairing. */
function frameSaveRqo(
	sectionId: number,
	idKey: number,
	targetId: number,
	situation: FrameSituation,
): Rqo {
	return {
		action: 'save',
		dd_api: 'dd_core_api',
		prevent_lock: true,
		source: {
			typo: 'source',
			type: 'component',
			model: 'component_dataframe',
			tipo: situation.slot,
			section_tipo: situation.host,
			section_id: String(sectionId),
			mode: 'edit',
			lang: 'lg-nolan',
			action: null,
			caller_dataframe: {
				section_tipo: situation.host,
				section_id: String(sectionId),
				main_component_tipo: situation.main,
				id_key: idKey,
			},
		},
		data: {
			section_id: String(sectionId),
			section_tipo: situation.host,
			tipo: situation.slot,
			lang: 'lg-nolan',
			from_component_tipo: situation.slot,
			changed_data: [
				{
					action: 'insert',
					id: null,
					// RAW client shape on purpose: no `type`, numeric section_id.
					// The server stamps dd490 + the pairing, which is what makes
					// this a genuine frame and not a hand-built literal.
					value: { section_id: targetId, section_tipo: situation.target, paginated_key: 0 },
				},
			],
		},
	} as unknown as Rqo;
}

/** Frame `targetId` from main item `idKey` through the engine's write path. */
async function frameThroughEngine(
	sectionId: number,
	idKey: number,
	targetId: number,
	situation: FrameSituation = BASE_SITUATION,
): Promise<void> {
	const dispatched = await dispatchRqo(
		frameSaveRqo(sectionId, idKey, targetId, situation),
		tsContext as never,
	);
	if (dispatched.status !== 200 || dispatched.body.ok === false) {
		throw new Error(`frame save failed: ${JSON.stringify(dispatched.body)}`);
	}
}

/** A frame target record carrying one readable note. */
async function mintFrameTarget(note: string): Promise<number> {
	const id = await createSectionRecord(FRAME_SECTION, USER_ID);
	minted.push([FRAME_SECTION, id, FRAME_TABLE]);
	const saved = await saveComponentData({
		componentTipo: FRAME_NOTE,
		sectionTipo: FRAME_SECTION,
		sectionId: id,
		lang: 'lg-nolan',
		changedData: [{ action: 'insert', id: null, value: { value: note } }],
		userId: USER_ID,
	});
	if (saved.ok !== true) throw new Error(`frame target seed failed: ${saved.message}`);
	return id;
}

/** Insert one identity row at an EXPLICIT id — no counter, no advisory lock. */
async function insertIdentityRow(
	table: string,
	sectionTipo: string,
	sectionId: number,
	columns: Record<string, unknown>,
): Promise<void> {
	const names = ['"section_tipo"', '"section_id"'];
	const placeholders = ['$1', '$2'];
	const params: (string | number)[] = [sectionTipo, sectionId];
	let index = 3;
	for (const [column, value] of Object.entries(columns)) {
		names.push(`"${column}"`);
		placeholders.push(`$${index}::text::jsonb`);
		params.push(encodeForJsonb(value));
		index++;
	}
	await sql.unsafe(
		`INSERT INTO "${table}" (${names.join(', ')}) VALUES (${placeholders.join(', ')})`,
		params,
	);
}

/** A locator of the shape the real dd128 user records carry (dd151 = list). */
function identityLocator(componentTipo: string, sectionTipo: string, sectionId: number) {
	return {
		id: 1,
		type: 'dd151',
		section_id: sectionId,
		section_tipo: sectionTipo,
		from_component_tipo: componentTipo,
	};
}

/**
 * Mint the reader identity: a profile granting HOST=2 / FRAME_SECTION=1, and a
 * user whose dd244 global-admin flag is PRESENT BUT "No" (dd64/2) — a reader
 * testing `!== null` instead of `=== 1` would hand this identity the superuser
 * bypass and the gate would go green over the very hole it exists to close.
 */
async function installReaderIdentity(): Promise<void> {
	await removeReaderIdentity(); // a crashed previous run leaves rows behind
	await insertIdentityRow('matrix_profiles', 'dd234', READER_PROFILE_ID, {
		string: { dd237: [{ id: 1, lang: 'lg-eng', value: 'dupdf reader profile' }] },
		misc: {
			dd774: [
				{ id: 1, tipo: HOST_SECTION, section_tipo: HOST_SECTION, value: READER_HOST_LEVEL },
				{ id: 2, tipo: FRAME_SECTION, section_tipo: FRAME_SECTION, value: READER_FRAME_LEVEL },
				// The two-section host (test 10): write on the host AND on the FIRST
				// frame target's section, read-only on the second's — the half-mint is
				// only expressible with the first target WRITABLE.
				{ id: 3, tipo: CROSS_HOST, section_tipo: CROSS_HOST, value: READER_HOST_LEVEL },
				{ id: 4, tipo: CROSS_GRANTED, section_tipo: CROSS_GRANTED, value: READER_HOST_LEVEL },
				{ id: 5, tipo: CROSS_DENIED, section_tipo: CROSS_DENIED, value: READER_FRAME_LEVEL },
			],
		},
	});
	await insertIdentityRow('matrix_users', 'dd128', READER_USER_ID, {
		string: { dd132: [{ id: 1, lang: 'lg-nolan', value: 'dupdf_reader' }] },
		relation: {
			dd131: [identityLocator('dd131', 'dd64', 1)],
			dd244: [identityLocator('dd244', 'dd64', 2)],
			dd515: [identityLocator('dd515', 'dd64', 2)],
			dd1725: [identityLocator('dd1725', 'dd234', READER_PROFILE_ID)],
		},
	});
	// The three per-user security caches are keyed by user_id and TTL'd: a
	// principal resolved before this mint (by another file in the same process)
	// would otherwise be served stale.
	clearPrincipalCache();
	clearUserProjectsCache();
	clearPermissionsCache();
}

/** Sweep the reader identity. Leniently: nothing to delete is a normal state. */
async function removeReaderIdentity(): Promise<void> {
	for (const [table, sectionTipo, sectionId] of IDENTITY_ROWS) {
		if (sectionId < 900000)
			throw new Error(`refusing to delete ${table}/${sectionId}: below the scratch floor`);
		await deleteMatrixRecord(table, sectionTipo, sectionId);
	}
	clearPrincipalCache();
	clearUserProjectsCache();
	clearPermissionsCache();
}

/**
 * How many records of the frame target section carry `note`.
 *
 * The measurement the pre-flight assertion needs is "did the engine mint a copy
 * of MY target", and a raw row count of FRAME_TABLE cannot answer it: a sibling
 * agent writes scratch records into this same suite database at the same
 * moment. A deep copy carries the source's literal verbatim, so the seeded note
 * identifies every copy of a given target exactly, whoever else is writing.
 */
async function copiesOfNote(note: string): Promise<number> {
	return countLiteral({ table: FRAME_TABLE, sectionTipo: FRAME_SECTION, tipo: FRAME_NOTE }, note);
}

/** Where a countable literal lives; its COLUMN is resolved, never named. */
interface LiteralHome {
	table: string;
	sectionTipo: string;
	tipo: string;
}

/** The jsonb column of a LiteralHome, derived from a row the engine wrote. */
function columnOf(home: LiteralHome): string {
	return home.tipo === FRAME_NOTE ? NOTE_COLUMN : CROSS_NOTE_COLUMN;
}

/**
 * How many records of `home` carry `note`, matched by jsonb CONTAINMENT so a
 * translatable literal (which stores a `lang` key beside the value) counts the
 * same as a non-translatable one.
 */
async function countLiteral(home: LiteralHome, note: string): Promise<number> {
	const rows = (await sql.unsafe(
		`SELECT count(*)::int AS n FROM "${home.table}"
		 WHERE section_tipo = $1 AND "${columnOf(home)}"->($2::text) @> $3::text::jsonb`,
		[home.sectionTipo, home.tipo, JSON.stringify([{ value: note }])],
	)) as { n: number }[];
	return rows[0]?.n ?? 0;
}

/**
 * Track a duplicate for the sweep — the host row AND every frame target the
 * engine minted under it, read off the duplicate's own bag rather than assumed.
 *
 * Used in the success branch of every REFUSAL test, i.e. the branch that only
 * runs when the gate has already failed. A red gate must still leave the shared
 * suite database as it found it: the mutation runs that proved these assertions
 * leaked two frame-target copies before this existed.
 */
async function trackDuplicate(
	sectionId: number,
	sectionTipo: string = HOST_SECTION,
	table: string = HOST_TABLE,
): Promise<void> {
	minted.push([sectionTipo, sectionId, table]);
	for (const frame of censusFrames(await readRow(table, sectionTipo, sectionId))) {
		// The target's table is the ontology's answer: ONE duplicate can carry
		// frames into two different sections (test 10), and a frame that names no
		// record address at all (test 13) addresses no row to sweep.
		const targetTipo = String(frame.entry.section_tipo);
		const targetId = Number(frame.entry.section_id);
		if (!Number.isSafeInteger(targetId) || targetId < 1) continue;
		minted.push([targetTipo, targetId, (await getMatrixTableFromTipo(targetTipo)) ?? '']);
	}
}

/**
 * Sweep every record carrying `note` except `keepId` — the copies a HALF-MINT
 * left behind.
 *
 * A half-mint's copy is UNREFERENCED by construction: the duplicate that would
 * have pointed at it was never inserted, so no bag names it and
 * {@link trackDuplicate} cannot reach it. This gate is the only thing that
 * knows the note, so it is the only thing that can clean up after its own RED
 * run — and a red run that poisons the shared suite database for the next one
 * is how a gate stops being trustworthy.
 */
async function sweepExtraCopies(
	note: string,
	keepId: number,
	home: LiteralHome = { table: FRAME_TABLE, sectionTipo: FRAME_SECTION, tipo: FRAME_NOTE },
): Promise<void> {
	const rows = (await sql.unsafe(
		`SELECT section_id FROM "${home.table}"
		 WHERE section_tipo = $1 AND "${columnOf(home)}"->($2::text) @> $3::text::jsonb
		   AND section_id <> $4`,
		[home.sectionTipo, home.tipo, JSON.stringify([{ value: note }]), keepId],
	)) as { section_id: number }[];
	for (const row of rows) await cleanScratchRecord(home.sectionTipo, row.section_id, home.table);
}

/** A host record carrying the two-item main seed, ready to be framed. */
async function mintHost(): Promise<number> {
	const id = await createSectionRecord(HOST_SECTION, USER_ID);
	minted.push([HOST_SECTION, id, HOST_TABLE]);
	await sql.unsafe(
		`UPDATE "${HOST_TABLE}" SET relation = COALESCE(relation, '{}'::jsonb)
			|| jsonb_build_object($1::text, $2::text::jsonb)
		 WHERE section_tipo = $3 AND section_id = $4`,
		[MAIN, JSON.stringify(MAIN_SEED), HOST_SECTION, id],
	);
	return id;
}

/**
 * The two-slot host's own main seed (test 10). Same shape as MAIN_SEED: plain
 * reference locators, so the census below sees only the dd490 frames.
 */
const CROSS_MAIN_SEED = [
	{
		id: 1,
		type: 'dd151',
		section_id: 1,
		section_tipo: CROSS_GRANTED,
		from_component_tipo: CROSS_MAIN,
	},
	{
		id: 2,
		type: 'dd151',
		section_id: 2,
		section_tipo: CROSS_GRANTED,
		from_component_tipo: CROSS_MAIN,
	},
];

/** A CROSS_HOST record carrying that seed, ready for its two slots to frame. */
async function mintCrossHost(): Promise<number> {
	const id = await createSectionRecord(CROSS_HOST, USER_ID);
	minted.push([CROSS_HOST, id, CROSS_HOST_TABLE]);
	await sql.unsafe(
		`UPDATE "${CROSS_HOST_TABLE}" SET relation = COALESCE(relation, '{}'::jsonb)
			|| jsonb_build_object($1::text, $2::text::jsonb)
		 WHERE section_tipo = $3 AND section_id = $4`,
		[CROSS_MAIN, JSON.stringify(CROSS_MAIN_SEED), CROSS_HOST, id],
	);
	return id;
}

/**
 * A frame target in the section the reader MAY write, carrying a countable
 * note. The note's storage column is derived here from the row the engine just
 * wrote — naming it would be a second, drifting copy of the component's
 * storage contract.
 */
async function mintCrossGrantedTarget(note: string): Promise<number> {
	const id = await createSectionRecord(CROSS_GRANTED, USER_ID);
	minted.push([CROSS_GRANTED, id, CROSS_GRANTED_TABLE]);
	const saved = await saveComponentData({
		componentTipo: CROSS_NOTE,
		sectionTipo: CROSS_GRANTED,
		sectionId: id,
		lang: 'lg-eng',
		changedData: [{ action: 'insert', id: null, value: { value: note } }],
		userId: USER_ID,
	});
	if (saved.ok !== true) throw new Error(`cross target seed failed: ${saved.message}`);
	const probe = await readRow(CROSS_GRANTED_TABLE, CROSS_GRANTED, id);
	CROSS_NOTE_COLUMN =
		MATRIX_JSONB_COLUMNS.find(
			(column) => (probe?.[column] as Record<string, unknown> | null)?.[CROSS_NOTE] !== undefined,
		) ?? '';
	return id;
}

/**
 * Where the countable cross-section note lives. A FUNCTION, not a const: the
 * table is resolved from the ontology in beforeAll, and the column from the
 * first row the engine writes there.
 */
function grantedHome(): LiteralHome {
	return { table: CROSS_GRANTED_TABLE, sectionTipo: CROSS_GRANTED, tipo: CROSS_NOTE };
}

/** A frame target in the section the reader may only READ. */
async function mintCrossDeniedTarget(): Promise<number> {
	const id = await createSectionRecord(CROSS_DENIED, USER_ID);
	minted.push([CROSS_DENIED, id, CROSS_DENIED_TABLE]);
	return id;
}

/**
 * Re-point ONE stored frame at another record, keeping every server-stamped
 * field (dd490, id_key, the pairing tipos) and changing only the address.
 *
 * The engine's own write path cannot produce a frame pointing outside the
 * slot's declared target section — `validateRelationInsert` refuses it
 * (`relation.insert_refused`, constraint `off_target`, measured 2026-08-27) —
 * so the CYCLE the guard exists for (test 11) is unwritable through it today.
 * It is not unwritable in a DATABASE: a PHP-era row, a repair script or an
 * ontology that declares mutually-framing slots all carry exactly this shape.
 * Writing a server-stamped frame and moving only its address is the closest
 * honest reproduction.
 */
async function repointFrame(
	hostId: number,
	targetTipo: string,
	targetId: number,
	slot: string = FRAME,
): Promise<void> {
	await sql.unsafe(
		`UPDATE "${HOST_TABLE}"
		    SET relation = jsonb_set(relation, ARRAY[$1::text, '0'],
		        (relation->($1::text)->0) || jsonb_build_object('section_tipo', $2::text, 'section_id', $3::int))
		  WHERE section_tipo = $4 AND section_id = $5`,
		[slot, targetTipo, targetId, HOST_SECTION, hostId],
	);
}

/** The note stored on a frame target record (the value the copy must not share). */
async function noteOf(sectionId: number): Promise<unknown> {
	const row = await readRow(FRAME_TABLE, FRAME_SECTION, sectionId);
	const column = row?.text ?? row?.string;
	const items = (column as Record<string, unknown[]> | undefined)?.[FRAME_NOTE];
	return (items?.[0] as Record<string, unknown> | undefined)?.value;
}

beforeAll(async () => {
	// This file writes dd128/dd234 IDENTITY rows. The database must say it is
	// disposable before the first one lands.
	await assertTestDatabase('duplicate_record_dataframe_native');
	const token = createSession(USER_ID, 'root', true);
	const session = getSession(token);
	tsContext = {
		requestId: 'duplicate_record_dataframe_test',
		clientIp: '127.0.0.1',
		session,
		csrfCandidate: session?.csrfToken ?? null,
		principal: await resolvePrincipal(USER_ID),
	};

	// Tables RESOLVED from the ontology, never named: a literal table would seed
	// and assert rows the engine itself never writes.
	HOST_TABLE = (await getMatrixTableFromTipo(HOST_SECTION)) ?? '';
	FRAME_TABLE = (await getMatrixTableFromTipo(FRAME_SECTION)) ?? '';
	CROSS_HOST_TABLE = (await getMatrixTableFromTipo(CROSS_HOST)) ?? '';
	CROSS_GRANTED_TABLE = (await getMatrixTableFromTipo(CROSS_GRANTED)) ?? '';
	CROSS_DENIED_TABLE = (await getMatrixTableFromTipo(CROSS_DENIED)) ?? '';

	await installReaderIdentity();

	targetA = await mintFrameTarget('dupdf-target-A');
	targetB = await mintFrameTarget('dupdf-target-B');

	// WHICH COLUMN the note lives in is the ontology's answer, read off a row
	// the engine itself wrote — a named column would be a second, drifting copy
	// of the component's storage contract.
	const probe = await readRow(FRAME_TABLE, FRAME_SECTION, targetA);
	NOTE_COLUMN =
		MATRIX_JSONB_COLUMNS.find(
			(column) => (probe?.[column] as Record<string, unknown> | null)?.[FRAME_NOTE] !== undefined,
		) ?? '';

	hostId = await mintHost();

	// The topology under test: target A framed from BOTH main items (legitimate —
	// id_key is part of frame identity), target B framed from item 1 only.
	await frameThroughEngine(hostId, 1, targetA);
	await frameThroughEngine(hostId, 2, targetA);
	await frameThroughEngine(hostId, 1, targetB);

	sourceFrames = censusFrames(await readRow(HOST_TABLE, HOST_SECTION, hostId));

	dupId = await duplicateSectionRecord(HOST_SECTION, hostId, USER_ID);
	minted.push([HOST_SECTION, dupId, HOST_TABLE]);
	dupFrames = censusFrames(await readRow(HOST_TABLE, HOST_SECTION, dupId));
	// The duplicate's own frame targets are scratch records too — sweep whatever
	// the engine minted, read off the duplicate's bag rather than assumed.
	for (const frame of dupFrames) {
		minted.push([String(frame.entry.section_tipo), Number(frame.entry.section_id), FRAME_TABLE]);
	}
}, 60000);

afterAll(async () => {
	await removeReaderIdentity();
	for (const [sectionTipo, sectionId, table] of minted) {
		if (sectionId > 0 && table !== '') await cleanScratchRecord(sectionTipo, sectionId, table);
	}
	// Activity rows are swept PER RECORD THIS FILE MINTED — by the (section_tipo,
	// section_id) the row itself names, never by component tipo: sibling agents
	// write into this same suite database at the same moment, and a tipo-wide
	// DELETE would reach rows this file never wrote. Keyed on the reference the
	// row carries, it also covers the second host's slots (test 10) without
	// listing them.
	for (const [sectionTipo, sectionId] of minted) {
		await sql.unsafe(
			`DELETE FROM matrix_activity
			 WHERE section_tipo = 'dd542'
			   AND misc->'dd551'->0->'value'->>'section_tipo' = $1
			   AND misc->'dd551'->0->'value'->>'section_id' = $2`,
			[sectionTipo, String(sectionId)],
		);
	}
});

describe('duplicate × dataframe — the copy owns its frames, or the duplicate is refused', () => {
	test('ANTI-VACUITY: the fixture is a real dataframe slot with real paired frames', async () => {
		// Every later assertion is worthless if any of this is untrue — a moved
		// fixture, a shrunken corpus or a silently failed seed must redden HERE.
		expect(await getModelByTipo(FRAME)).toBe('component_dataframe');
		expect(HOST_TABLE).not.toBe('');
		expect(FRAME_TABLE).not.toBe('');
		expect(hostId).toBeGreaterThan(0);
		expect(dupId).toBeGreaterThan(0);
		expect(dupId).not.toBe(hostId);
		// Three frames, written by the SERVER (dd490 is stamped, never sent).
		expect(sourceFrames.length).toBe(3);
		expect(sourceFrames.every((frame) => frame.tipo === FRAME)).toBe(true);
		// They address two DISTINCT, EXISTING target records.
		expect(new Set(sourceFrames.map((frame) => frame.address)).size).toBe(2);
		expect(await noteOf(targetA)).toBe('dupdf-target-A');
		expect(await noteOf(targetB)).toBe('dupdf-target-B');
		// And each one is READABLE by the pairing predicate, i.e. a real frame.
		for (const frame of sourceFrames) {
			expect(dataframeEntryMatches(frame.entry, MAIN, frame.entry.id_key as number, FRAME)).toBe(
				true,
			);
		}
	});

	test('CENSUS TOTAL: no dd490 entry in the duplicate addresses a source frame target', () => {
		const sourceAddresses = new Set(sourceFrames.map((frame) => frame.address));
		expect(sourceAddresses.size).toBeGreaterThan(0); // floor: something to violate
		expect(dupFrames.length).toBe(sourceFrames.length); // no frame silently dropped
		// THE ASSERTION. Every entry of the duplicate's whole bag, not a sample.
		const shared = dupFrames.filter((frame) => sourceAddresses.has(frame.address));
		expect(
			shared.map((frame) => `${frame.column}.${frame.tipo} → ${frame.address}`),
			'the duplicate shares a frame target with its source (DATA-05)',
		).toEqual([]);
	});

	test('the copy keeps the SOURCE topology: one shared target stays one record', () => {
		// Target A was framed from two main items — one frame record, two
		// pairings. Minting per locator would silently split that in two.
		const addresses = dupFrames.map((frame) => frame.address);
		expect(new Set(addresses).size).toBe(2);
		const perAddress = new Map<string, number>();
		for (const address of addresses) perAddress.set(address, (perAddress.get(address) ?? 0) + 1);
		expect([...perAddress.values()].sort()).toEqual([1, 2]);
	});

	test('the pairing survives the re-mint: only the ADDRESS is new', () => {
		// id / id_key / main_component_tipo / from_component_tipo are untouched:
		// the duplicate copies the main component's items verbatim, ids included,
		// so a re-mint that broke the pairing would leave an unreadable frame.
		const identity = (frames: FrameCensusEntry[]) =>
			frames
				.map((frame) =>
					[
						frame.entry.type,
						frame.entry.id_key,
						frame.entry.main_component_tipo,
						frame.entry.from_component_tipo,
					].join('|'),
				)
				.sort();
		expect(identity(dupFrames)).toEqual(identity(sourceFrames));
		for (const frame of dupFrames) {
			expect(frame.entry.type).toBe('dd490');
			expect(dataframeEntryMatches(frame.entry, MAIN, frame.entry.id_key as number, FRAME)).toBe(
				true,
			);
		}
	});

	test('REFERENCE locators beside the frames stay SHARED (the fix re-mints ownership only)', async () => {
		// A portal/autocomplete locator points at a record it does not own —
		// copying it is CORRECT. A fix that re-minted everything would be a
		// different, equally serious defect.
		const row = await readRow(HOST_TABLE, HOST_SECTION, dupId);
		const mainItems = (row?.relation as Record<string, unknown[]>)[MAIN];
		expect(mainItems).toEqual(MAIN_SEED);
	});

	test('the corruption itself: editing the COPY frame leaves the ORIGINAL untouched', async () => {
		// The unconditional arm of DATA-05, reproduced end to end. Pre-fix the
		// two addresses were byte-identical and this write landed on the source's
		// own frame record.
		const copyTarget = Number(dupFrames[0]?.entry.section_id);
		const sourceTarget = Number(sourceFrames[0]?.entry.section_id);
		expect(copyTarget).toBeGreaterThan(0);
		expect(copyTarget).not.toBe(sourceTarget);
		// The re-mint is a real deep copy: the note came across.
		expect(await noteOf(copyTarget)).toBe(await noteOf(sourceTarget));
		const saved = await saveComponentData({
			componentTipo: FRAME_NOTE,
			sectionTipo: FRAME_SECTION,
			sectionId: copyTarget,
			lang: 'lg-nolan',
			changedData: [
				{ action: 'update', id: 1, value: { id: 1, value: 'dupdf-corrected-on-the-copy' } },
			],
			userId: USER_ID,
		});
		expect(saved.ok).toBe(true);
		expect(await noteOf(copyTarget)).toBe('dupdf-corrected-on-the-copy');
		expect(
			await noteOf(sourceTarget),
			"the copy's frame edit reached the ORIGINAL's frame record",
		).not.toBe('dupdf-corrected-on-the-copy');
	});

	test('an ORPHAN pairing is REFUSED, never shared', async () => {
		// Re-minting is impossible when the target no longer exists. The only two
		// answers are refusal and a dangling shared pointer; the engine must
		// refuse, loudly, naming the slot the curator has to repair.
		const orphanTarget = await mintFrameTarget('dupdf-orphan');
		const orphanHost = await createSectionRecord(HOST_SECTION, USER_ID);
		minted.push([HOST_SECTION, orphanHost, HOST_TABLE]);
		await sql.unsafe(
			`UPDATE "${HOST_TABLE}" SET relation = COALESCE(relation, '{}'::jsonb)
				|| jsonb_build_object($1::text, $2::text::jsonb)
			 WHERE section_tipo = $3 AND section_id = $4`,
			[MAIN, JSON.stringify(MAIN_SEED), HOST_SECTION, orphanHost],
		);
		await frameThroughEngine(orphanHost, 1, orphanTarget);
		expect(censusFrames(await readRow(HOST_TABLE, HOST_SECTION, orphanHost)).length).toBe(1);
		// The target is removed under the pairing (what a delete leaves behind).
		await cleanScratchRecord(FRAME_SECTION, orphanTarget, FRAME_TABLE);

		const refusal = await duplicateSectionRecord(HOST_SECTION, orphanHost, USER_ID).then(
			async (id) => {
				await trackDuplicate(id);
				return null;
			},
			(error: unknown) => error,
		);
		expect(refusal, 'the duplicate was NOT refused — a dangling frame was copied').not.toBeNull();
		expect(isDedaloError(refusal)).toBe(true);
		expect((refusal as { code: string }).code).toBe('record.dataframe_unduplicable');
		expect(String((refusal as Error).message)).toContain(FRAME);
		// THE WIRE the curator actually receives. The refusal is a CONFLICT the
		// curator can act on, not a server unavailability: the first cut of this
		// fix reused `engine.uncovered_scope` (503, operator disclosure), which
		// told the client "retry later" about a refusal no retry can change and
		// swallowed the slot name the repair needs.
		const wire = toErrorEnvelope(refusal, { requestId: 'dupdf' });
		expect(wire.status, 'the refusal must not read as a 503 server unavailability').toBe(409);
		const body = wire.body.error;
		expect(body.category).toBe('conflict');
		expect(body.retryable).toBe(false);
		// PUBLIC disclosure: the slot AND the reason survive the ladder, so the
		// client can render an actionable sentence instead of a generic one.
		expect(body.details?.component_tipo).toBe(FRAME);
		expect(String(body.details?.reason)).toContain('does not exist');
		expect(body.message).toContain(FRAME);
	});

	test('a curator who may write the HOST but only READ the frame target section is REFUSED', async () => {
		// THE NEW AUTHORIZATION GAP the re-mint opened. `duplicateSectionRecord`
		// now CREATES records in the frame target's section, which no duplicate
		// request names: the door gates level 2 on the HOST section and nothing
		// re-asks it on the target. So a level-2-on-host / level-1-on-target
		// curator minted rows in a section they may only read — with their own
		// audit stamps on them.
		const reader = await resolvePrincipal(READER_USER_ID);
		// ANTI-VACUITY, and the whole contrast: without these the refusal below
		// would be satisfiable at zero-versus-zero (no grant anywhere), which is
		// exactly how the suite's other non-admin assertions went green over
		// nothing before the ACL fixture existed.
		expect(reader.isGlobalAdmin, 'the reader is not the superuser in disguise').toBe(false);
		expect(await getSectionPermissions(reader, HOST_SECTION)).toBe(READER_HOST_LEVEL);
		expect(await getSectionPermissions(reader, FRAME_SECTION)).toBe(READER_FRAME_LEVEL);

		const permTarget = await mintFrameTarget('dupdf-perm-target');
		const permHost = await mintHost();
		await frameThroughEngine(permHost, 1, permTarget);
		expect(censusFrames(await readRow(HOST_TABLE, HOST_SECTION, permHost)).length).toBe(1);
		expect(await copiesOfNote('dupdf-perm-target')).toBe(1);

		const refusal = await duplicateSectionRecord(HOST_SECTION, permHost, READER_USER_ID).then(
			async (id) => {
				await trackDuplicate(id);
				return null;
			},
			(error: unknown) => error,
		);
		expect(
			refusal,
			'a read-only-on-the-target curator MINTED a record there by duplicating',
		).not.toBeNull();
		expect(isDedaloError(refusal)).toBe(true);
		// The same code the duplicate door throws for the host section, so an
		// authorization denial reads identically wherever the gap is.
		expect((refusal as { code: string }).code).toBe('perm.denied');
		expect(toErrorEnvelope(refusal, { requestId: 'dupdf' }).status).toBe(403);
		expect(String((refusal as Error).message)).toContain(FRAME_SECTION);
		// AND NOTHING WAS WRITTEN: the refusal is not a rollback story, it fires
		// before the first mint.
		expect(await copiesOfNote('dupdf-perm-target'), 'a row was minted anyway').toBe(1);

		// POSITIVE CONTROL: the SAME duplicate as root succeeds. Without it a
		// broken fixture (a host that cannot be duplicated at all) would satisfy
		// every assertion above, and the gate would prove nothing about grants.
		await trackDuplicate(await duplicateSectionRecord(HOST_SECTION, permHost, USER_ID));
		expect(await copiesOfNote('dupdf-perm-target'), 'root could not duplicate either').toBe(2);
	});

	test('PRE-FLIGHT: one unduplicable target refuses BEFORE any sibling target is minted', async () => {
		// The refusal must be all-or-nothing across the record's frames. With
		// the pre-flight moved inside the mint loop, the live target below is
		// copied and THEN the deleted one refuses: a stray unreferenced record
		// plus a duplicate that never existed — the half-mint outcome the
		// wire-contract entry calls the worst of the three, and invisible to
		// every other assertion in this file.
		const liveTarget = await mintFrameTarget('dupdf-preflight-live');
		const doomedTarget = await mintFrameTarget('dupdf-preflight-doomed');
		const preflightHost = await mintHost();
		// ORDER IS LOAD-BEARING: the live target is framed FIRST, so it is the
		// first entry of the census and the first the mint loop would reach.
		await frameThroughEngine(preflightHost, 1, liveTarget);
		await frameThroughEngine(preflightHost, 2, doomedTarget);
		const hostFrames = censusFrames(await readRow(HOST_TABLE, HOST_SECTION, preflightHost));
		// ANTI-VACUITY: two frames, two DISTINCT targets, the live one first.
		expect(hostFrames.length).toBe(2);
		expect(new Set(hostFrames.map((frame) => frame.address)).size).toBe(2);
		expect(hostFrames[0]?.address).toBe(`${FRAME_SECTION}/${liveTarget}`);

		// The second target is deleted out from under its pairing.
		await cleanScratchRecord(FRAME_SECTION, doomedTarget, FRAME_TABLE);
		expect(await copiesOfNote('dupdf-preflight-live')).toBe(1);

		const refusal = await duplicateSectionRecord(HOST_SECTION, preflightHost, USER_ID).then(
			async (id) => {
				await trackDuplicate(id);
				return null;
			},
			(error: unknown) => error,
		);
		expect(refusal, 'the duplicate was NOT refused — a dangling frame was copied').not.toBeNull();
		expect((refusal as { code: string }).code).toBe('record.dataframe_unduplicable');
		// THE ASSERTION. Counted by the seeded literal, never as raw rows in the
		// table: sibling agents write into this suite database concurrently.
		// MEASURE, SWEEP, THEN assert — the copy a half-mint leaves is
		// unreferenced, so a failing expect here would strand it forever.
		const copies = await copiesOfNote('dupdf-preflight-live');
		await sweepExtraCopies('dupdf-preflight-live', liveTarget);
		expect(copies, 'a frame target was minted before the refusal (half-mint)').toBe(1);
	});

	test('AUTHORIZATION PRE-FLIGHT: the refused SECOND target leaves the FIRST unminted', async () => {
		// THE AUTHORIZATION HALF-MINT. Test 8's host carries ONE frame target, so
		// moving only the grant check into the mint loop keeps it — and the
		// orphan pre-flight, test 9 — green: with a single target there is no
		// "already minted" sibling to leave behind. This host carries TWO, in two
		// sections the reader holds DIFFERENT levels on, with the WRITABLE one
		// framed FIRST. Grant-inside-the-loop mints it and then refuses on the
		// second: a stray unreferenced record plus a duplicate that never existed.
		const reader = await resolvePrincipal(READER_USER_ID);
		// ANTI-VACUITY: the whole point is a first target the reader MAY write.
		expect(reader.isGlobalAdmin, 'the reader is not the superuser in disguise').toBe(false);
		expect(await getSectionPermissions(reader, CROSS_HOST)).toBe(READER_HOST_LEVEL);
		expect(await getSectionPermissions(reader, CROSS_GRANTED)).toBe(READER_HOST_LEVEL);
		expect(await getSectionPermissions(reader, CROSS_DENIED)).toBe(READER_FRAME_LEVEL);

		const grantedTarget = await mintCrossGrantedTarget('dupdf-cross-granted');
		const deniedTarget = await mintCrossDeniedTarget();
		const crossHost = await mintCrossHost();
		// ORDER IS LOAD-BEARING: the writable target is framed FIRST, so it is the
		// first entry of the census and the first the mint loop would reach.
		await frameThroughEngine(crossHost, 1, grantedTarget, CROSS_GRANTED_SITUATION);
		await frameThroughEngine(crossHost, 2, deniedTarget, CROSS_DENIED_SITUATION);
		const frames = censusFrames(await readRow(CROSS_HOST_TABLE, CROSS_HOST, crossHost));
		expect(frames.length).toBe(2);
		expect(frames[0]?.address).toBe(`${CROSS_GRANTED}/${grantedTarget}`);
		expect(frames[1]?.address).toBe(`${CROSS_DENIED}/${deniedTarget}`);
		expect(CROSS_NOTE_COLUMN).not.toBe('');
		expect(await countLiteral(grantedHome(), 'dupdf-cross-granted')).toBe(1);

		const refusal = await duplicateSectionRecord(CROSS_HOST, crossHost, READER_USER_ID).then(
			async (id) => {
				await trackDuplicate(id, CROSS_HOST, CROSS_HOST_TABLE);
				return null;
			},
			(error: unknown) => error,
		);
		expect(refusal, 'a read-only-on-the-target curator MINTED a record there').not.toBeNull();
		expect(isDedaloError(refusal)).toBe(true);
		expect((refusal as { code: string }).code).toBe('perm.denied');
		expect(String((refusal as Error).message)).toContain(CROSS_DENIED);
		// THE ASSERTION. MEASURE, SWEEP, THEN assert — the copy a half-mint leaves
		// is unreferenced, so a failing expect here would strand it forever.
		const copies = await countLiteral(grantedHome(), 'dupdf-cross-granted');
		await sweepExtraCopies('dupdf-cross-granted', grantedTarget, grantedHome());
		expect(copies, 'the WRITABLE target was minted before the refusal (half-mint)').toBe(1);

		// POSITIVE CONTROL: the same duplicate as root succeeds and re-mints BOTH
		// targets — so the refusal above is the grant, not an unduplicable fixture.
		const rootDuplicate = await duplicateSectionRecord(CROSS_HOST, crossHost, USER_ID);
		await trackDuplicate(rootDuplicate, CROSS_HOST, CROSS_HOST_TABLE);
		expect(await countLiteral(grantedHome(), 'dupdf-cross-granted'), 'root was refused too').toBe(
			2,
		);
		const rootFrames = censusFrames(await readRow(CROSS_HOST_TABLE, CROSS_HOST, rootDuplicate));
		expect(rootFrames.length).toBe(2);
		expect(rootFrames.map((frame) => frame.address).some((a) => frames[0]?.address === a)).toBe(
			false,
		);
	});

	test('a CYCLE of frames is REFUSED, never recursed', async () => {
		// THE CYCLE GUARD (remintChain + chain.has). A mutual pair — A frames B,
		// B frames A — re-enters this writer forever on an ordinary duplicate:
		// unbounded recursion, and the mint of every record it passes. Nothing
		// else in this file exercises it: with the guard deleted the other tests
		// stay green, because none of their frame chains comes back.
		const cycleSeed = await mintFrameTarget('dupdf-cycle-seed');
		const cycleA = await mintHost();
		const cycleB = await mintHost();
		// Each frame is written by the SERVER and then re-pointed at the sibling
		// host (see repointFrame: the engine refuses an off-target frame, so this
		// is the honest reproduction of a shape a database can hold).
		await frameThroughEngine(cycleA, 1, cycleSeed);
		await frameThroughEngine(cycleB, 1, cycleSeed);
		await repointFrame(cycleA, HOST_SECTION, cycleB);
		await repointFrame(cycleB, HOST_SECTION, cycleA);
		// ANTI-VACUITY: the pair really is mutual, and both entries are frames.
		const framesA = censusFrames(await readRow(HOST_TABLE, HOST_SECTION, cycleA));
		const framesB = censusFrames(await readRow(HOST_TABLE, HOST_SECTION, cycleB));
		expect(framesA.length).toBe(1);
		expect(framesB.length).toBe(1);
		expect(framesA[0]?.address).toBe(`${HOST_SECTION}/${cycleB}`);
		expect(framesB[0]?.address).toBe(`${HOST_SECTION}/${cycleA}`);
		expect(framesA[0]?.entry.type).toBe('dd490');

		const refusal = await duplicateSectionRecord(HOST_SECTION, cycleA, USER_ID).then(
			async (id) => {
				await trackDuplicate(id);
				return null;
			},
			(error: unknown) => error,
		);
		expect(refusal, 'a mutual frame pair was duplicated instead of refused').not.toBeNull();
		expect(isDedaloError(refusal)).toBe(true);
		expect((refusal as { code: string }).code).toBe('record.dataframe_unduplicable');
		expect(String((refusal as Error).message)).toContain('cycle');
		// The refusal names the record the chain came back to, so the curator can
		// see WHICH pair to break.
		expect(String((refusal as Error).message)).toContain(`${HOST_SECTION}/${cycleA}`);
		const wire = toErrorEnvelope(refusal, { requestId: 'dupdf' });
		expect(wire.status).toBe(409);
		expect(String(wire.body.error.details?.reason)).toContain('cycle');
	});

	test('DISCLOSURE ORDER: no grant on the target section answers perm.denied even when the target is GONE', async () => {
		// The grant is asked BEFORE the target record is read, so a principal who
		// may not write that section cannot use the duplicate door as an EXISTENCE
		// ORACLE for records in it. Swapping the two blocks is green everywhere
		// else and turns this 403 into "that record does not exist".
		const reader = await resolvePrincipal(READER_USER_ID);
		expect(await getSectionPermissions(reader, FRAME_SECTION)).toBe(READER_FRAME_LEVEL);
		const goneTarget = await mintFrameTarget('dupdf-disclosure');
		const disclosureHost = await mintHost();
		await frameThroughEngine(disclosureHost, 1, goneTarget);
		expect(censusFrames(await readRow(HOST_TABLE, HOST_SECTION, disclosureHost)).length).toBe(1);
		await cleanScratchRecord(FRAME_SECTION, goneTarget, FRAME_TABLE);

		// POSITIVE CONTROL, and the thing that must not leak: for a principal who
		// HOLDS the grant the engine really does answer "it does not exist".
		const rootRefusal = await duplicateSectionRecord(HOST_SECTION, disclosureHost, USER_ID).then(
			async (id) => {
				await trackDuplicate(id);
				return null;
			},
			(error: unknown) => error,
		);
		expect(rootRefusal).not.toBeNull();
		expect((rootRefusal as { code: string }).code).toBe('record.dataframe_unduplicable');
		expect(String((rootRefusal as Error).message)).toContain('does not exist');

		// THE ASSERTION: the same request, from a principal without the grant,
		// learns nothing about the target beyond the refusal it would have got
		// whether the record existed or not.
		const refusal = await duplicateSectionRecord(HOST_SECTION, disclosureHost, READER_USER_ID).then(
			async (id) => {
				await trackDuplicate(id);
				return null;
			},
			(error: unknown) => error,
		);
		expect(refusal).not.toBeNull();
		expect(
			(refusal as { code: string }).code,
			'the refusal disclosed that the frame target was deleted',
		).toBe('perm.denied');
		const wire = toErrorEnvelope(refusal, { requestId: 'dupdf' });
		expect(wire.status).toBe(403);
		expect(String((refusal as Error).message)).not.toContain('does not exist');
		expect(JSON.stringify(wire.body)).not.toContain('does not exist');
	});

	test('a frame that names NO record address is copied VERBATIM, never refused', async () => {
		// THE NARROWING. `section_id` on a dd490 entry is not always an address:
		// `normalizeDataframeEntry` passes a non-address value through verbatim
		// (external remote ids), and `dataframe_control` renders `section_id ??
		// unknown`, so a target-less frame is a shape this engine STORES. Such a
		// frame owns no record, so the copy shares nothing — refusing it would
		// make the whole record permanently unduplicable for no integrity gain.
		const narrowHost = await mintHost();
		const narrowSeed = await mintFrameTarget('dupdf-narrow-seed');
		await frameThroughEngine(narrowHost, 1, narrowSeed);
		const stamped = censusFrames(await readRow(HOST_TABLE, HOST_SECTION, narrowHost))[0]?.entry;
		expect(stamped, 'the server-stamped frame this test derives its shapes from').toBeDefined();
		// The three non-address shapes, each keeping every server-stamped pairing
		// field: an external remote id, an explicit null, and an absent key.
		const external = { ...(stamped as Record<string, unknown>), id: 1, section_id: 'Q42' };
		const nulled = { ...(stamped as Record<string, unknown>), id: 2, id_key: 2, section_id: null };
		// The ABSENT shape is built by omission, never by `delete`: the entry must
		// carry no `section_id` key at all, which is what a legacy frame that never
		// had a target looks like on disk.
		const { section_id: _noAddress, ...absent } = {
			...(stamped as Record<string, unknown>),
			id: 3,
		} as Record<string, unknown> & { section_id?: unknown };
		const variants = [external, nulled, absent];
		await sql.unsafe(
			`UPDATE "${HOST_TABLE}" SET relation = relation || jsonb_build_object($1::text, $2::text::jsonb)
			 WHERE section_tipo = $3 AND section_id = $4`,
			[FRAME, JSON.stringify(variants), HOST_SECTION, narrowHost],
		);
		// ANTI-VACUITY: all three are still FRAMES (dd490) as far as the census is
		// concerned — this is not a test that the entries were silently ignored.
		expect(censusFrames(await readRow(HOST_TABLE, HOST_SECTION, narrowHost)).length).toBe(3);

		const narrowDuplicate = await duplicateSectionRecord(HOST_SECTION, narrowHost, USER_ID);
		await trackDuplicate(narrowDuplicate);
		const dupRow = await readRow(HOST_TABLE, HOST_SECTION, narrowDuplicate);
		// THE ASSERTION: verbatim, key for key — nothing re-minted, nothing
		// re-pointed, nothing dropped.
		expect((dupRow?.relation as Record<string, unknown>)[FRAME]).toEqual(variants);
		expect(
			Object.keys(((dupRow?.relation as Record<string, unknown[]>)[FRAME] as never[])[2] ?? {}),
		).not.toContain('section_id');
	});
});
