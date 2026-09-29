/**
 * THE STATE OF A MAIN AT ONE HISTORY ROW — two lanes (2026-09-28,
 * WC-2026-09-27-bulk-revert-undo-log, addendum "two lanes"; the lane law is
 * relations/main_lanes.ts).
 *
 * A main's history is split into LANGUAGE lanes (a language's value, nothing
 * else) and the lg-nolan FRAME lane (the lg-nolan value + every frame of every
 * slot). A row is therefore not the whole state any more; the state AT row R
 * is reconstructed:
 *   - the value of lane X  = the newest lane-X row with id <= R;
 *   - the frames (and the lg-nolan value) = the newest FRAME-STATE row with
 *     id <= R — a row of the lg-nolan lane, or a row carrying frames whatever
 *     its tag (a PHP-era main save: PHP composed every row with the frames).
 * Exact, because every save of one record is serialised by the record's FOR
 * UPDATE row lock, so row ids follow the real order — timestamps are never
 * compared.
 *
 * ONE reader for the two doors that must agree — the tool's PREVIEW
 * (section/read.ts) and apply_value (tools/tool_time_machine): the row's own
 * lane and the frames are what a restore writes (the same restoredLaneValue,
 * the same frame state). ONE deliberate difference: the preview also shows the
 * timeline's OTHER lane as it stood at the row (previewLaneValue — the view
 * language for an lg-nolan row, the lg-nolan value for a language row), which
 * a restore leaves live.
 *
 * PHP-ERA ROWS read under the same law: a PHP main save (one language's value +
 * the frames) gives its lane's value AND is its own frame state; a PHP
 * dataframe save (tagged lg-nolan, the main in every language + the frames) is
 * the lg-nolan lane — its lg-nolan items and its frames, the other languages'
 * items ignored. The one structural limit: a PHP language row carrying NO frame
 * cannot be told from an engine language row, so it is read as the engine's
 * (no frame information — the frames come from the newest frame state below
 * it, `frameRowId`). A frame of an item that row had already dropped then
 * pairs no restored item: apply_value judges its pairing law at BOTH rows
 * (tool_time_machine.ts rowFrameSlice — the items known at the frame-state
 * row ∪ those at the restored row), so an item the frame state knew and the
 * restored value no longer holds is stale and its frame is never written back.
 */

import {
	type KeyLaneRow,
	readFrameStateRowAt,
	readKeyLanesAt,
	readLaneRowAt,
	type TmCoords,
} from '../db/time_machine.ts';
import { isFrameStateRow, isFramesOnlyImage, splitComposed } from '../relations/dataframe_slots.ts';
import { type LaneLaw, laneHoldsValue, NOLAN, rowLaneItems } from '../relations/main_lanes.ts';

/** One history row, as a reader holds it. */
export interface LaneRow {
	id: number;
	lang: string | null;
	data: unknown;
}

/** A lane's recorded value at the row: `recorded` false = the lane is not restored / shown from history. */
export interface LaneValue {
	lane: string;
	recorded: boolean;
	value: unknown;
}

/** The reconstructed state of a main at one of its rows. */
export interface RowLaneState {
	/** The lane the ROW itself is filed under. */
	rowLane: string;
	/**
	 * The row's OWN lane value — what apply_value restores: the row's items of
	 * its lane (its lg-nolan items for an lg-nolan row); not `recorded` for a
	 * frames-only row (a translatable main's lg-nolan row, or a PHP row whose
	 * items speak no language of its tag — isFramesOnlyImage).
	 */
	own: LaneValue;
	/**
	 * The frame state as of the row: the composed image of the newest
	 * frame-state row at or below it (`[]` = none: no frame then). Sound
	 * because the frame lane is COMPLETE: before any language row is written,
	 * a frame state that differs from the newest recorded one is recorded first
	 * (dataframe_slots.ts recordFrameLaneBaseline).
	 */
	frameImage: unknown;
	/** The id of the frame-state row `frameImage` came from (the row itself when it is one); null = none. */
	frameRowId: number | null;
}

/** What the reconstruction needs to know of the main. */
export interface LaneStateInput {
	coords: TmCoords;
	row: LaneRow;
	law: LaneLaw;
	/** The lane a row with no `lang` (pre-migration) is read under. */
	fallbackLang: string;
}

/** The lane a row is filed under (its tag; the fallback for an untagged pre-migration row). */
export function rowLaneOf(row: LaneRow, fallbackLang: string): string {
	return row.lang !== null && row.lang !== '' ? row.lang : fallbackLang;
}

/** The main part of a row as an item list. */
function mainItems(data: unknown): unknown[] {
	const { main } = splitComposed(data);
	return Array.isArray(main) ? main : [];
}

/**
 * Whether a row of `lane` restores a VALUE: never a frames-only row
 * (isFramesOnlyImage), never the lg-nolan lane of a translatable sliced main
 * (it holds no value). An unsliced main's row (always read as lg-nolan —
 * readRowLaneState) carries its whole value.
 */
export function rowRestoresValue(row: LaneRow, lane: string, law: LaneLaw): boolean {
	if (lane === NOLAN && law.translatable) return false;
	return !isFramesOnlyImage({
		sliced: law.sliced,
		translatable: law.translatable,
		rowLang: lane,
		mainItems: mainItems(row.data),
	});
}

/** A lane's value as a row records it (see rowLaneItems). */
function laneValueOf(row: LaneRow | null, lane: string, law: LaneLaw): LaneValue {
	if (row === null) return { lane, recorded: true, value: law.sliced ? [] : undefined };
	return { lane, recorded: true, value: rowLaneItems(splitComposed(row.data).main, lane, law) };
}

/** The frame state as of a row, and the row it came from: the row itself when it is one, else the newest one below it. */
async function frameStateAt(
	coords: TmCoords,
	row: LaneRow,
	lane: string,
): Promise<{ frameImage: unknown; frameRowId: number | null }> {
	if (isFrameStateRow(lane, row.data)) return { frameImage: row.data, frameRowId: row.id };
	const found = await readFrameStateRowAt(coords, row.id);
	return { frameImage: found?.data ?? [], frameRowId: found === null ? null : Number(found.id) };
}

/**
 * The state at a row (see the header): its own lane value, and the frame state
 * as of it. An UNSLICED main has one lane (main_lanes.ts laneLaw): its row is
 * read as lg-nolan whatever its tag.
 */
export async function readRowLaneState(input: LaneStateInput): Promise<RowLaneState> {
	const { coords, row, law } = input;
	const rowLane = law.sliced ? rowLaneOf(row, input.fallbackLang) : NOLAN;
	const own = rowRestoresValue(row, rowLane, law)
		? laneValueOf(row, rowLane, law)
		: { lane: rowLane, recorded: false, value: undefined };
	return { rowLane, own, ...(await frameStateAt(coords, row, rowLane)) };
}

/**
 * The value of lane `lane` AS OF row `rowId` (the newest lane row at or below
 * it; none = the lane was empty then) — the PREVIEW's other half: a row of one
 * lane previews the other lanes of the timeline as they stood. Not `recorded`
 * when the lane holds no value of this main (an unsliced main's language
 * lane), nor for a translatable main's lg-nolan lane — rowRestoresValue's law:
 * history never speaks for that value.
 */
export async function readLaneValueAt(
	coords: TmCoords,
	lane: string,
	rowId: number,
	law: LaneLaw,
): Promise<LaneValue> {
	if (!laneHoldsValue(lane, law) || (lane === NOLAN && law.translatable)) {
		return { lane, recorded: false, value: undefined };
	}
	return laneValueOf(await readLaneRowAt(coords, lane, rowId), lane, law);
}

/** What history says of one key AS OF a bound (componentValueAsOf). */
export interface KeyValueAsOf {
	/** false: history never recorded this key (silent) — the caller keeps the live value. */
	spoken: boolean;
	/** The value as of the bound (`null` = empty, for an unsliced key); meaningful only when `spoken`. */
	value: unknown;
}

/**
 * THE VALUE OF ONE KEY OF ANOTHER RECORD AS OF A BOUND — the TM preview's
 * frame children (tm_record/frame_as_of.ts;
 * WC-2026-09-29-tm-preview-frame-children-as-of). A frame target has no row
 * lane and nothing restores it, so its honest picture is EVERY lane as of
 * `boundId`:
 *   - UNSLICED (relations, numbers, dates…): one lane, lg-nolan, whatever the
 *     rows' tags (the readRowLaneState law): the newest visible row at or below
 *     the bound, its main part (splitComposed — a target that is itself a main
 *     carries frames in its rows). Rows only above the bound: EMPTY (null).
 *   - SLICED: each language lane judged on its own — a lane with a speaking
 *     row at or below the bound takes that row's items of the lane; a lane
 *     with rows only above it, or with only frames-only rows at or below it,
 *     is EMPTY; a lane never recorded keeps `base`'s items. A translatable key's lg-nolan lane never speaks (readLaneValueAt's
 *     law), an untagged pre-migration row speaks for nothing. The lang-less
 *     (orphan) items come from the newest speaking row, once — rowLaneItems
 *     would hand them to every lane. Merged over `base` by
 *     mergeRestoredLangSlice: exactly the spoken lanes are replaced.
 *   - NO visible row at all: not spoken (history silent: an import with the
 *     time machine off) — the caller keeps `base`.
 * `floorId` (> 0): `base` is the key's state AT that row — a whole-record
 * snapshot (an archive restore) that superseded every key row at or below it.
 * Those rows, and a lane whose rows all lie above the bound, then say nothing:
 * `base` stands for them. Not spoken = no key row in (floorId, boundId] speaks.
 * A key whose only rows lie above the bound (no floor) previews EMPTY even when
 * its pre-edit value was an unrecorded import (or a backfill pre-value row,
 * which cannot be told from an ordinary one): ledgered, never guessed.
 */
export async function componentValueAsOf(
	coords: TmCoords,
	base: unknown,
	boundId: number,
	law: LaneLaw,
	floorId = 0,
): Promise<KeyValueAsOf> {
	const lanes = await readKeyLanesAt(coords, boundId);
	if (lanes.length === 0) return { spoken: false, value: base };
	if (!law.sliced) return unslicedValueAsOf(lanes, law, base, floorId);
	const state: SlicedAsOf = { spokenLanes: new Set(), restored: [], orphanSource: null };
	for (const entry of lanes) await judgeLaneAsOf(state, coords, entry, law, floorId);
	if (state.spokenLanes.size === 0) return { spoken: false, value: base };
	const restored = [...state.restored, ...orphansOf(state.orphanSource)];
	return {
		spoken: true,
		value: mergeRestoredLangSlice(asItemList(base), restored, state.spokenLanes),
	};
}

/** The sliced lanes judged so far (componentValueAsOf). */
interface SlicedAsOf {
	spokenLanes: Set<string>;
	restored: unknown[];
	/** The newest speaking row — the one source of the lang-less items. */
	orphanSource: LaneRow | null;
}

/** Whether a tag is a language lane of the key that can speak (componentValueAsOf's lane law). */
function isSpeakableLane(lane: string | null, law: LaneLaw): lane is string {
	if (lane === null || lane === '' || !laneHoldsValue(lane, law)) return false;
	return !(lane === NOLAN && law.translatable);
}

/** One sliced lane as of the bound, folded into `state`. */
async function judgeLaneAsOf(
	state: SlicedAsOf,
	coords: TmCoords,
	entry: KeyLaneRow,
	law: LaneLaw,
	floorId: number,
): Promise<void> {
	const lane = entry.lang;
	if (!isSpeakableLane(lane, law)) return;
	const speaking = entry.atOrBelow
		? await speakingRowAtOrBelow(coords, lane, entry.row, law, floorId)
		: null;
	if (speaking === null) {
		// The lane is RECORDED but nothing at or below the bound speaks for a
		// value (rows only above it, or only frames-only rows at or below it):
		// the lane was empty at the bound — never its live (post-bound) items —
		// unless a floor's snapshot stands for it.
		if (floorId === 0) state.spokenLanes.add(lane);
		return;
	}
	state.spokenLanes.add(lane);
	state.restored.push(...laneItemsOf(speaking, lane, law));
	state.orphanSource = newerRow(state.orphanSource, speaking);
}

/** The newer of two rows (by id — the one TM order). */
function newerRow(current: LaneRow | null, row: LaneRow): LaneRow {
	return current === null || row.id > current.id ? row : current;
}

/** A speaking row's items of exactly `lane` (its main part). */
function laneItemsOf(row: LaneRow, lane: string, law: LaneLaw): unknown[] {
	return asItemList(rowLaneItems(splitComposed(row.data).main, lane, law)).filter(
		(item) => (item as { lang?: unknown } | null)?.lang === lane,
	);
}

/** The lang-less items of the newest speaking row (none without one). */
function orphansOf(row: LaneRow | null): unknown[] {
	return row === null ? [] : asItemList(splitComposed(row.data).main).filter(isLanglessObject);
}

/**
 * An unsliced key as of the bound: the newest row at or below it, any tag,
 * above the floor. None: EMPTY (null) — or, over a floor, not spoken (the
 * snapshot `base` stands).
 */
function unslicedValueAsOf(
	lanes: readonly KeyLaneRow[],
	law: LaneLaw,
	base: unknown,
	floorId: number,
): KeyValueAsOf {
	const newest = newestAtOrBelow(lanes);
	if (newest !== null && newest.id > floorId) {
		return {
			spoken: true,
			value: rowLaneItems(splitComposed(newest.data).main, NOLAN, law) ?? null,
		};
	}
	return floorId > 0 ? { spoken: false, value: base } : { spoken: true, value: null };
}

/** The newest row at or below the bound across every tag, or null. */
function newestAtOrBelow(lanes: readonly KeyLaneRow[]): LaneRow | null {
	let newest: LaneRow | null = null;
	for (const entry of lanes) {
		if (entry.atOrBelow && (newest === null || entry.row.id > newest.id)) newest = entry.row;
	}
	return newest;
}

/**
 * The newest row of `lane` at or below `row` and ABOVE `floorId` that SPEAKS
 * for a value (rowRestoresValue): a frames-only row is skipped for the next
 * older one.
 */
async function speakingRowAtOrBelow(
	coords: TmCoords,
	lane: string,
	row: LaneRow,
	law: LaneLaw,
	floorId: number,
): Promise<LaneRow | null> {
	let candidate: LaneRow | null = row;
	while (candidate !== null && candidate.id > floorId) {
		if (rowRestoresValue(candidate, lane, law)) return candidate;
		candidate = await olderLaneRow(coords, lane, candidate);
	}
	return null;
}

/** The next older visible row of `lane` below `row`, or null. */
async function olderLaneRow(coords: TmCoords, lane: string, row: LaneRow): Promise<LaneRow | null> {
	const older = await readLaneRowAt(coords, lane, Number(row.id) - 1);
	return older === null ? null : { id: Number(older.id), lang: older.lang, data: older.data };
}

/** A lang-less OBJECT item (an orphan of a sliced value; a non-object is never an item). */
function isLanglessObject(item: unknown): boolean {
	return item !== null && typeof item === 'object' && isLanglessItem(item);
}

/**
 * MERGE a restored snapshot OVER the live value instead of replacing the key
 * (DATA-03 — the divergence from PHP, ledgered in
 * `engineering/wire_contract/WC-2026-08-27-tm-lang-slice-restore-merge.md`).
 *
 * THE LAW, stated once: *a component restore never deletes a language the
 * snapshot does not carry.* PHP's apply_value wrote the one-language slice as
 * the whole component key, so restoring the Spanish version of a trilingual
 * literal DELETED the Basque and the English value — silently, with `ok:true`,
 * and the fresh TM row the restore wrote carried only the restored slice, so
 * the loss was invisible even in the history the restore itself created.
 * Sequential per-language restores ping-ponged, which is why the tool could not
 * reassemble a multilingual value at all.
 *
 * Survivors keep their stored object VERBATIM (same reference, therefore the
 * same key order through json_codec), so an untouched language is byte-identical
 * before and after. They come first and the restored items last, which is the
 * order `save_component.ts` already writes a lang-sliced save in
 * (`items = [...otherLangs, ...stamped]`, PHP set_data_lang :1052-1128) — the
 * restore must not invent a second array shape for the same component.
 *
 * DELIBERATELY MORE CONSERVATIVE than set_data_lang in one respect: a live item
 * with no `lang` (a lang orphan) is KEPT here, where the save path drops it.
 * This door's mandate is to replay a snapshot, not to garbage-collect data no
 * snapshot mentions — and an orphan deleted by a restore is deleted with no row
 * anywhere to recover it from.
 *
 * UNLESS THE SNAPSHOT OWNS ITS ORPHANS (2026-09-27, WC-…-bulk-revert-undo-log).
 * When the restored items themselves carry lang-less items, the snapshot is a
 * REGION image (concepts/lang_region.ts regionOf — every item that is not
 * another language's), not a strict one-language slice: a bulk run's visible
 * after-row is written that way, and it holds the orphans the write kept. Its
 * orphans ARE the live ones, so the live lang-less items are dropped from the
 * survivors — keeping them as well wrote every orphan twice. A snapshot with
 * no lang-less item leaves the live orphans exactly as above.
 *
 * SHARED with the legacy bulk revert (bulk_revert_legacy.ts) and the TM
 * PREVIEW (section/read.ts, through restoredLaneValue): both restore doors write the same shape from the
 * same per-language snapshots, so they merge through this one function. A second
 * copy would drift into a second notion of "the slice" — and the bulk door's
 * blast radius is a whole batch per click.
 */
export function mergeRestoredLangSlice(
	liveItems: readonly unknown[],
	restoredItems: readonly unknown[],
	restoredLangs: ReadonlySet<string>,
): unknown[] {
	const snapshotOwnsOrphans = restoredItems.some(isLanglessItem);
	const survivors = liveItems.filter((item) => {
		if (isLanglessItem(item)) return !snapshotOwnsOrphans;
		const itemLang = (item as { lang: string }).lang;
		return !restoredLangs.has(itemLang);
	});
	return [...survivors, ...restoredItems];
}

/** An item with no language of its own: a non-object, or an object without a non-empty string `lang`. */
function isLanglessItem(item: unknown): boolean {
	if (item === null || typeof item !== 'object') return true;
	const itemLang = (item as { lang?: unknown }).lang;
	return typeof itemLang !== 'string' || itemLang === '';
}

/**
 * The value a row restore WRITES over the live one (two lanes): the row's OWN
 * lane put back beside every other lane — a sliced main merges its lane's
 * items over the live other languages (mergeRestoredLangSlice, DATA-03: a
 * component restore never deletes a language the row does not speak for); an
 * unsliced one takes the row's value whole. A row that restores no value (a
 * frames-only row, a translatable main's lg-nolan row) leaves the live value.
 */
export function restoredLaneValue(
	live: unknown,
	state: RowLaneState,
	law: { sliced: boolean },
): unknown {
	if (!state.own.recorded) return live;
	if (!law.sliced) return state.own.value;
	const liveItems = asItemList(live);
	const items = Array.isArray(state.own.value) ? state.own.value : [];
	return mergeRestoredLangSlice(liveItems, items, new Set([state.rowLane]));
}

/**
 * THE VALUE A PREVIEW SHOWS for a row (section/read.ts): the row's own lane
 * exactly as apply_value writes it (restoredLaneValue over the live key), then
 * the timeline's OTHER lane as of the row (`asOf`, readLaneValueAt) put back
 * STRICTLY — only items tagged exactly that lane are replaced, so a lang-less
 * (PHP orphan) item stays where the own lane left it. An unsliced main has one
 * lane, lg-nolan: its row IS its whole value (no other lane to add).
 */
export function previewLaneValue(
	live: unknown,
	state: RowLaneState,
	asOf: LaneValue | null,
	law: { sliced: boolean },
): unknown {
	const own = restoredLaneValue(live, state, law);
	if (asOf === null || !asOf.recorded || !law.sliced) return own;
	const tagged = (item: unknown) => (item as { lang?: unknown } | null)?.lang === asOf.lane;
	return [
		...asItemList(own).filter((item) => !tagged(item)),
		...asItemList(asOf.value).filter(tagged),
	];
}

/** A stored value as its item list (absent / null → none; a non-array is the one item it is). */
function asItemList(value: unknown): unknown[] {
	if (Array.isArray(value)) return value;
	return value === undefined || value === null ? [] : [value];
}
