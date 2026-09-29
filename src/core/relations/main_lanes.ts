/**
 * THE TWO LANES OF A MAIN'S HISTORY (2026-09-28,
 * WC-2026-09-27-bulk-revert-undo-log, addendum "two lanes"). Pure: no I/O, no ontology lookup — the
 * caller hands the LaneLaw it read (laneLaw: the model's `isLangSlicedModel`
 * answer and, for a sliced model only, the ontology `translatable` flag), so
 * the capture and every reader cut the same key with the same law.
 *
 * Every history row of a main (and of its dataframes) is stored under the
 * MAIN's tipo, in one of two kinds of lane:
 *   - a LANGUAGE lane (lg-spa, lg-ell…): ONLY that language's value, no frame;
 *   - the lg-nolan lane: the main's lg-nolan VALUE plus ALL frames of ALL its
 *     dataframe slots — the SHARED FRAME LANE.
 * Which value each lane holds is the one rule below (laneHoldsValue). A
 * LANG-SLICED model (input_text, iri…): every item is filed under its own
 * `lang` — the lg-nolan value is exactly the items tagged lg-nolan, whatever
 * the main's flags:
 *   - a NON-translatable main: every item is lg-nolan — one row per save =
 *     value + frames, as it always was;
 *   - a TRANSLITERABLE one (`with_lang_versions`, e.g. rsc85 in rsc197): its
 *     lg-nolan base beside language items (Augustus lg-nolan, Αύγουστος
 *     lg-ell) — those are language lanes like any other: no flag is needed,
 *     the items' own `lang` places them;
 *   - a TRANSLATABLE main: its lg-nolan value is normally EMPTY (the lg-nolan
 *     lane is then its shared frame lane); a PHP-era lg-nolan item on it is
 *     recorded like any other (a restore reads such a main's lg-nolan row for
 *     its frames only — tm_record/lane_state.ts rowRestoresValue).
 * An UNSLICED model (every relation — portal, select, check_box, radio,
 * filter, relation_* — and number, date…) holds its WHOLE key in ONE lane, the
 * lg-nolan lane: one row = the whole value + every frame. ALWAYS, whatever the
 * ontology `translatable` flag says and whatever the request language
 * (decision 2026-09-29: the lane depends on the model's DATA SHAPE only; a
 * relation holds locators, which are never translatable — laneLaw drops the
 * flag of an unsliced model). Every language's timeline lists that one lane.
 *
 * REGIONS. The undo law (`laneRegion`, concepts/lang_region.ts regionOf —
 * lang-less orphans kept, absence = undefined; a translatable main's lg-nolan
 * lane strictly its lg-nolan-tagged items, isStrictFrameLane) cuts undo pairs
 * and is what a revert restores; the visible law (`laneVisible` — exactly the lane's tagged
 * items) cuts the ordinary history row, as the plain save row always did.
 */

import { regionOf, restoreRegion } from '../concepts/lang_region.ts';

/** The lang tag of the shared frame lane (and of a non-translatable value). */
export const NOLAN = 'lg-nolan';

/** What decides how a main's key splits into lanes (build it with laneLaw). */
export interface LaneLaw {
	/** `isLangSlicedModel(model)` — the save path's answer: the model's DATA SHAPE. */
	sliced: boolean;
	/**
	 * A LANG-SLICED main whose ontology node is `translatable` (its lg-nolan lane
	 * is then its shared frame lane). Always false for an unsliced model.
	 */
	translatable: boolean;
}

/**
 * THE ONE CONSTRUCTOR of a lane law (decision 2026-09-29): the lane of a main
 * depends on its data shape only. The ontology `translatable` flag is kept
 * for a lang-sliced model and DROPPED for an unsliced one — a relation's
 * locators are never translatable, so a "translatable portal" is an
 * ontology accident the history ignores.
 */
export function laneLaw(sliced: boolean, ontologyTranslatable: boolean): LaneLaw {
	return { sliced, translatable: sliced && ontologyTranslatable };
}

/** Whether `lane` carries a VALUE of the main: every lane of a sliced model; only lg-nolan for an unsliced one. */
export function laneHoldsValue(lane: string, law: LaneLaw): boolean {
	return law.sliced || lane === NOLAN;
}

/** A stored value as its item list (absent / null → none; a non-array is the one item it is). */
function itemsOf(value: unknown): unknown[] {
	if (Array.isArray(value)) return value;
	return value === undefined || value === null ? [] : [value];
}

/** An item's `lang`, or '' when it has none (a lang-less orphan). */
function itemLang(item: unknown): string {
	const lang = (item as { lang?: unknown } | null)?.lang;
	return typeof lang === 'string' ? lang : '';
}

/**
 * The UNDO region of one lane of a stored key: `undefined` when the lane holds
 * no value of this main or nothing of it (the one absence law), else the
 * region (a sliced model: every item that is not another language's — orphans
 * kept; an unsliced one: the whole key).
 */
export function laneRegion(value: unknown, lane: string, law: LaneLaw): unknown {
	if (!laneHoldsValue(lane, law)) return undefined;
	if (isStrictFrameLane(lane, law)) {
		const tagged = itemsOf(value).filter(isNolanItem);
		return tagged.length === 0 ? undefined : tagged;
	}
	return regionOf(value, lane, law.sliced);
}

/**
 * The lg-nolan lane of a TRANSLATABLE sliced main is its shared FRAME lane:
 * its value is only the items tagged exactly lg-nolan (a PHP-era copy), never
 * a lang-less orphan — orphans ride the language lanes (the capture cuts the
 * frame lane FIRST, so a region that kept orphans would claim them there and
 * file a translatable main's orphan under lg-nolan).
 */
function isStrictFrameLane(lane: string, law: LaneLaw): boolean {
	return lane === NOLAN && law.sliced && law.translatable;
}

/** An item tagged exactly lg-nolan. */
const isNolanItem = (item: unknown): boolean => itemLang(item) === NOLAN;

/**
 * Put back the lg-nolan-tagged items of a strict frame lane (isStrictFrameLane)
 * where the first live one stood (appended when none); every other item stays
 * in place, and a key holding none with nothing to restore is left as it is.
 */
function restoreStrictNolan(current: unknown, region: unknown): unknown {
	const items = itemsOf(current);
	const restored = itemsOf(region);
	const at = items.findIndex(isNolanItem);
	if (restored.length === 0 && at < 0) return current;
	const kept = items.filter((item) => !isNolanItem(item));
	const index = at < 0 ? kept.length : at;
	const out = [...kept.slice(0, index), ...restored, ...kept.slice(index)];
	return out.length === 0 ? undefined : out;
}

/**
 * The VISIBLE value of one lane (the ordinary history row's main part): a
 * sliced model's items tagged exactly `lane` (`[]` when none; `null` for an
 * absent key — the PHP row of an emptied component); an unsliced model's whole
 * key (`null` when absent) in the lane that holds it, `null` elsewhere.
 * `withOrphans`: the DOOR's lane also carries the key's lang-less items (a
 * PHP-era orphan belongs to no language; the lane of the write that holds it
 * records it, so a wipe or a save dropping it is never an invisible change).
 */
export function laneVisible(
	value: unknown,
	lane: string,
	law: LaneLaw,
	withOrphans = false,
): unknown {
	const holds = laneHoldsValue(lane, law);
	if (!law.sliced) return wholeVisible(value, holds);
	if (value === undefined || value === null) return null;
	return holds ? laneTagged(itemsOf(value), lane, withOrphans) : [];
}

/** An unsliced key's visible value: the whole key in the lane that holds it (`null` when absent), `null` elsewhere. */
function wholeVisible(value: unknown, holds: boolean): unknown {
	return holds && value !== undefined ? value : null;
}

/** The items tagged `lane` (and, `withOrphans`, the lang-less ones). */
function laneTagged(items: readonly unknown[], lane: string, withOrphans: boolean): unknown[] {
	return items.filter((item) => {
		const lang = itemLang(item);
		return lang === lane || (withOrphans && lang === '');
	});
}

/**
 * Put a recorded lane region back over `current` (concepts/lang_region.ts
 * restoreRegion — the other lanes' items stay in place). A lane that holds no
 * value of this main leaves `current` as it is.
 */
export function restoreLane(
	current: unknown,
	lane: string,
	region: unknown,
	law: LaneLaw,
): unknown {
	if (!laneHoldsValue(lane, law)) return current;
	if (isStrictFrameLane(lane, law)) return restoreStrictNolan(current, region);
	return restoreRegion(current, lane, region, law.sliced);
}

/**
 * The LANGUAGE lanes (never lg-nolan — the frame lane is its own step) a set of
 * values speaks, in first-seen order: `doorLane` first when it is one, then
 * every item language (a sliced model), each only when it holds a value.
 */
export function valueLanesOf(values: readonly unknown[], law: LaneLaw, doorLane: string): string[] {
	const lanes: string[] = [];
	const add = (lane: string) => {
		if (lane !== '' && lane !== NOLAN && laneHoldsValue(lane, law) && !lanes.includes(lane)) {
			lanes.push(lane);
		}
	};
	add(doorLane);
	if (law.sliced)
		for (const value of values) for (const item of itemsOf(value)) add(itemLang(item));
	return lanes;
}

/**
 * The items of a history row's MAIN part that belong to `lane` — what "the
 * value for its lane" reads from a row whatever wrote it: items tagged `lane`,
 * plus lang-less items (they belong to the lane the row is filed under). A PHP
 * row carrying several languages (a v6 dataframe save of a main, tagged
 * lg-nolan, holding the main in every language) is read for its lane only —
 * the other languages' items are ignored. An unsliced model's main part is the
 * lane's value whole.
 */
export function rowLaneItems(main: unknown, lane: string, law: LaneLaw): unknown {
	if (!law.sliced) return main;
	// A snapshot that is not an item array (SQL NULL, a bare PHP scalar) is the
	// EMPTY value of its lane: its shape may decide how much of ONE language is
	// restored, never write a non-item into the key (DATA-03).
	if (!Array.isArray(main)) return [];
	return main.filter((item) => {
		if (item === null || typeof item !== 'object') return false;
		const lang = itemLang(item);
		return lang === lane || lang === '';
	});
}
