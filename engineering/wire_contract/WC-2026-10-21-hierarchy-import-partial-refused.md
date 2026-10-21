# WC-2026-10-21-hierarchy-import-partial-refused — a thesaurus with a listed section left empty beside a populated one is refused naming Reset, never "already installed"

- **Date:** 2026-10-21 (W4 cross-ops:r1, review-diff finding "classifyListedSections reports a
  tld 'already installed' when one listed section is populated and another is completely
  absent"). Amends `WC-2026-10-10-hierarchy-json-manifest` ("Already imported" is judged on
  the LISTED sections).
- **Decision:** DEC-12 (the rule is gated: `hierarchy_import_atomic_native` (l) + the pure
  `classifyListedSections` case).
- **Shape before (TS):** `installHierarchies` (the installer's step, the `add_hierarchy`
  maintenance widget without `replace`) judged a tld imported as soon as ONE listed section
  held a row. A tld whose `<tld>1` terms were present and whose listed `<tld>2` models
  section held nothing — while `<tld>2.copy.gz` carries rows — answered
  `{tld, ok: true, skipped: true, msg: 'already installed — import skipped and activated'}`;
  the models never landed, on that run or any later one.
- **Shape after (TS):** that tld is refused like the root-only case:
  `{tld, ok: false, msg: 'data available, not imported: <tld>2 hold(s) none of its rows while
  the rest of the thesaurus is there (an earlier import did not land whole) — use "Reset to
  seed" to import its terms; nothing imported'}` — nothing written, not activated by this
  run. Both causes in one tld are named in one sentence, `; `-joined (the root-only clause
  first, its text unchanged). A listed section whose FILE is empty is not missing (nothing
  to land). `replace: true` (Reset to seed) imports the whole tld as before. The pure
  classifier's state `root_only` became `partial` with `rootOnly` / `missing` lists
  (internal; not on the wire).
- **Reason:** "already installed" over a thesaurus missing its models leaves term records
  pointing at typologies that do not exist, with no line telling the operator; a raw
  additive `\copy` of the missing section is not safe either (the present section may come
  from another release), so the destructive, confirmed door is the one named.
- **Gate reconciliation:** TS-only (the install/maintenance hierarchy door has no oracle
  shape; no re-harvest). `test/unit/hierarchy_import_atomic_native.test.ts` (l) on the
  scratch `zzhia` tld through the real psql path; its (d) now builds a PRESENT tld (both
  listed sections populated); the pure `classifyListedSections` case covers the empty-file
  exception.
