# WC-061 — `tool_tc::change_all_timecodes`: atomic slice write, slice-indexed audit map, `lang` required

Three divergences from `class.tool_tc.php`, closed together.

1. **The write is ATOMIC per component.** PHP built the whole rewritten element set and
   issued ONE `set_data_lang($new_data, $lang)` + `save()`. The port called
   `saveComponentData` once PER ITEM — each its own transaction, each its own Time
   Machine row — so a failure part-way through a multi-paragraph transcription COMMITTED
   a half-offset document and returned a success-shaped envelope for the prefix that
   landed. Nothing on the wire distinguished it from a complete run, and every committed
   prefix is indistinguishable from a legitimate edit in the TM UI. The handler now
   issues a single `set_data` carrying the rebuilt lang slice.
2. **`options.key` and the returned map are keyed by the LANG-SLICE index**, not the
   full stored-array index (PHP `get_data_lang` → `array_values`). On a multi-lang
   component the old indexing selected and reported the WRONG element. Latent in
   practice — the client always sends `key: null` — but the returned `changesByKey`
   keys change shape for any caller that does send one.
3. **`lang` is now REQUIRED** (PHP `empty($lang)`) instead of silently defaulting to
   `lg-nolan`, and `result` is the audit map on every successful path instead of
   `false`. (The map-instead-of-`false` half is parity RESTORATION, not a divergence —
   PHP assigns and returns it unconditionally.)

One deliberate new divergence: a request that changes nothing skips the write entirely,
so it mints no Time Machine row and no falsified `modified` stamp — the same
formulation as WC-059.

Gate: `test/unit/media_timecode.test.ts` (atomicity pinned as a TM row count on a
scratch `test2` record seeded so slice index 0 ≠ array index 0).
