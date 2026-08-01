# WC-058 — tool_ontology::set_records_in_dd_ontology takes its scope from the request

The list-mode counterpart of WC-043, found by the 2026-07-28 tools audit and closed
the same way.

PHP list mode rebuilt the SQO from the session
(`$_SESSION['dedalo']['config']['sqo'][$sqo_id]`) and **failed CLOSED** when it was
absent — `'Not sqo_session found from id: …'`, writing nothing
(`class.tool_ontology.php:186-200`). The TS port has no session-SQO twin and filled
the gap with an unbounded `SELECT section_id FROM "<table>" WHERE section_tipo = $1`,
i.e. it rewrote **every record of the section**. That is fail-OPEN where PHP was
fail-CLOSED. Measured reach on the audited install: 4,654 records from one button
(`mdcat0`), 12,172 across `mdcat0`/`dmm0`/`dd0`/`rsc0` — foreground, not
background-runnable, no progress frames, no abort signal, behind a client that gives
up at 60 s while the server keeps writing.

- **List mode REQUIRES `options.sqo`.** Absent, `null`, non-object or array fails
  closed with `invalid_request` and the WC-043 wording. The v7 client now sends a
  deep clone of the caller list's LIVE sqo
  (`tools/tool_ontology/js/tool_ontology.js` — it previously sent none, which is
  what armed the fallback), so the run's scope is by construction the scope the list
  displays; an unfiltered list matches the whole section EXPLICITLY. Pagination is
  stripped server-side (PHP `set_order([])` / `set_limit(0)` / `set_offset(0)`), so
  the whole MATCHED set is processed, not the visible page.
- **Edit mode is unchanged** — an explicit `section_id` is its own scope.
- **`setRecordsInDdOntology` no longer has a whole-section default.** `SetRecordsTarget`
  gains `sectionIds` (an explicit id list) and `wholeSection` (opt-in, greppable,
  for internal rebuild callers only — `ontology_update.ts`'s full-TLD re-derive
  after an ontology-file import declares it). With none of the three stated the
  call refuses loudly rather than guessing "all".

**The generalisation, now stated in TOOLS_SPEC:** a batch tool action takes its
scope from the REQUEST or refuses. An absent scope parameter must never widen into
"everything".

Gated by `test/unit/tool_ontology_scope.test.ts` (9 tests, nothing written — every
case is a refusal or a zero-match resolve, and the dd_ontology row count is asserted
unchanged in `afterAll`). Mutation-proved: reintroducing the fallback turns it red.
