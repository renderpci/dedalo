/**
 * LANG REGION — the part of a stored component key ONE language's write owns.
 *
 * A save to a lang-sliced model (save_component.ts `isLangSlicedModel`:
 * classSupportsTranslation && !resolveData) replaces one language's slice of
 * the key and leaves every other language's items where they were. The undo
 * log (time_machine.ts `recordBulkPair`) records, for each such write, the
 * exact bytes it REPLACED and the exact bytes it LEFT — and a revert must put
 * back exactly that part and touch nothing else. "That part" is the REGION:
 *
 *   - sliced model:   every item that is NOT another language's. That keeps a
 *                     lang-less ORPHAN (a PHP-era item with no `lang`) inside
 *                     the region — the save path drops orphans when it writes
 *                     a slice, so an orphan is part of what the write replaced,
 *                     and the revert must be able to bring it back.
 *   - unsliced model, or a dataframe slot: the WHOLE key.
 *
 * `restoreRegion` is the inverse: the live key's other-language items (the part
 * no write of this language touched) kept in order, with the recorded region
 * back in the place the live region occupies (see spliceRegion).
 *
 * (!) NOT `mergeRestoredLangSlice` (tool_time_machine.ts). That door replays a
 * single-language TM snapshot and deliberately KEEPS live orphans, because its
 * snapshot does not own them. The undo log's region DOES own them (they are in
 * the BEFORE image), so keeping the live ones as well would duplicate them.
 *
 * ABSENCE — THE ONE LAW, both sides (capture and revert cut every image here):
 * a region that holds NOTHING is `undefined`. Three stored shapes are nothing:
 *   - an absent key;
 *   - a stored JSON `null` (the write chokepoint cannot even express one:
 *     `updateMatrixKeysData` reads a null value as "remove the key", so a
 *     region recorded as `null` could never be put back byte-exact, and its
 *     restore — a removal — would read as a post-run change on the next revert);
 *   - for a SLICED model, a key holding no item of this language's region
 *     (only other languages' items, or `[]`): the region itself is empty, and
 *     whether the KEY is present is decided by the other languages, not by it
 *     (restoreRegion removes the key when none survive). Recording it as `[]`
 *     made the same pre-run state two images (`[]` when another language had
 *     written first, `undefined` when not), so a second revert read a key
 *     already at its pre-run state as changed.
 * An UNSLICED `[]` is a present, empty key and stays `[]` — the whole key is the
 * region, and the chokepoint writes `[]` exactly. canonicalJson keeps the two
 * apart. A pre-run SLICED `[]` therefore comes back ABSENT (semantically the
 * same empty key; WC …-bulk-revert-undo-log §2, REGION).
 *
 * PURE: no I/O, no model lookup. `sliced` is the caller's answer from
 * `isLangSlicedModel(model)` — asked by the caller so this module has no
 * dependency on the component registry, and so the capture and the revert are
 * forced to pass the SAME answer they wrote the key with.
 */

/**
 * An item that belongs to ANOTHER language than `lang`: an object whose `lang`
 * is a non-empty string different from `lang`. Everything else — non-objects,
 * `lang`-less orphans, items of `lang` itself — is not.
 *
 * The same test the save path applies when it keeps the other languages'
 * items aside during a lang-sliced `set_data` (save_component.ts).
 */
export function isOtherLangItem(item: unknown, lang: string): boolean {
	if (item === null || typeof item !== 'object') return false;
	const itemLang = (item as { lang?: unknown }).lang;
	return typeof itemLang === 'string' && itemLang !== '' && itemLang !== lang;
}

/**
 * The region of a stored key value that a write in `lang` owns (see the module
 * header). Nothing (absent key, JSON null, a sliced region with no item) →
 * `undefined`. A non-array value under a
 * sliced model is read the way the save path reads it — as the ONE item it is
 * (save_component.ts wraps it `[raw]` before slicing):
 *   - another language's item (a PHP-era key stored as a single
 *     `{lang:'lg-eng',…}` object) is NOT this language's region: the save KEEPS
 *     it among the other languages, so the region is `undefined` (nothing of
 *     `lang` was there). Recording it as the region would pair a BEFORE the
 *     write never replaced, and its revert could not put it back beside itself.
 *   - anything else (an item of `lang`, an orphan, a corrupt scalar) is the
 *     region WHOLE — a revert must restore it, never drop it as "not ours".
 */
export function regionOf(value: unknown, lang: string, sliced: boolean): unknown {
	if (value === null) return undefined;
	if (!sliced) return value;
	if (!Array.isArray(value)) return isOtherLangItem(value, lang) ? undefined : value;
	const region = value.filter((item) => !isOtherLangItem(item, lang));
	return region.length === 0 ? undefined : region;
}

/**
 * A whole-key image under the absence law (see the header): a stored JSON
 * `null` is `undefined`. For images cut without a region (a dataframe slot, the
 * raw sibling-slot captures) — `regionOf(value, lang, false)` without a lang.
 */
export function keyImage(value: unknown): unknown {
	return value === null ? undefined : value;
}

/**
 * The key value that puts `region` back under `lang` over the LIVE value:
 * the live other-language items with `region` spliced in place (spliceRegion)
 * for a sliced model, `region` itself otherwise. Returns `undefined` — remove the key — when the recorded
 * region is absent and nothing of another language survives.
 */
export function restoreRegion(
	live: unknown,
	lang: string,
	region: unknown,
	sliced: boolean,
): unknown {
	if (!sliced) return region;
	const others = otherLangItems(live, lang);
	if (region === undefined) return others.length === 0 ? undefined : others;
	if (Array.isArray(region)) return spliceRegion(live, lang, region, others);
	// A non-array region was recorded from a non-array key (a PHP-era single
	// item), which had no other language's items. With none on the live key
	// either, verbatim is the only exact answer. When other languages were
	// added since (a later edit to ANOTHER language, which never blocks this
	// language's revert — the conflict check compares only the region), read
	// the region the way the save path reads it: as the ONE item it is.
	if (others.length === 0) return region;
	return spliceRegion(live, lang, [region], others);
}

/**
 * Put `region` back IN PLACE: the live key's other-language items keep their
 * order, and the recorded region takes the position of the live region's FIRST
 * item (appended after them when the live key holds no region item). In place,
 * not `[...others, ...region]`: a lang-less orphan belongs to EVERY language's
 * region, so a revert of one language that moved it would make the next
 * language's live region differ from its recorded after-image by ORDER alone —
 * refused as `changed_since_run` though nothing changed.
 */
function spliceRegion(
	live: unknown,
	lang: string,
	region: readonly unknown[],
	others: readonly unknown[],
): unknown[] {
	if (!Array.isArray(live)) return [...others, ...region];
	const out: unknown[] = [];
	let placed = false;
	for (const item of live) {
		if (isOtherLangItem(item, lang)) {
			out.push(item);
		} else if (!placed) {
			out.push(...region);
			placed = true;
		}
	}
	if (!placed) out.push(...region);
	return out;
}

/**
 * The live key's items that belong to another language. A non-array live value
 * is the one item it is (the save path's `[raw]` reading, see regionOf): kept
 * when it is another language's, so a restore never drops it.
 */
function otherLangItems(live: unknown, lang: string): unknown[] {
	if (!Array.isArray(live)) return isOtherLangItem(live, lang) ? [live] : [];
	return live.filter((item) => isOtherLangItem(item, lang));
}
