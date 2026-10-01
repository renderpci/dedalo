# TODO

## Search

- [x] Deep-path filters are slow (count and list): the join runs FORWARD from every main record (numisdata4: 184k records, 175k Tipo links unnested per search), and the trigram prefilter is disabled on joined leaves (src/core/search/conform.ts, searchStoreCovered). A valueless `@? '$.<tipo>[*]'` leaf is unindexable -> full matrix scan. Measured monedaiberica, 3-hop Tipo>Ceca>name 'ikalesken': 2906 ms now vs 33 ms reversed via matrix_relation_index + prefilter (same count). Fix must keep negation/empty semantics and group same-path conditions onto one related record (items below). DONE: src/core/search/deep_path.ts reverses only provably-exact units (3049 -> 14 ms, same ids); gate test/unit/search_deep_path_reverse_native.test.ts.
- [x] Negation over a deep path gives wrong results. On mdcat, "does not contain NIF" returned 38,749 records; the right answer is 18,635. Users can reach this from the search UI through -, != and !*. Because it returns rows instead of failing, nobody would notice. (2026-09-29: a deep leaf is now a semi-join over the related records — negation = NOT EXISTS over the positive twin, `!=` = some value AND none equal; mdcat `-NIF` measures 18,635. WC-2026-09-29-search-deep-leaf-mixed-rule; gate test/unit/search_deep_semantics_native.test.ts.)
- [x] Two conditions on the same deep path must match the same related record. Final PHP fixed this on 2026-06-15; TS lost the fix in the port. (2026-09-29: owner chose the MIXED rule — positive conditions on DIFFERENT fields share one related record; the SAME field repeated is matched independently (the PHP 2518d2059c conjunction); a negation never shares. Same WC + gate.)
- [x] Searching several sections at once with a deep path returns duplicate rows (WC-2026-09-24-multi-section-search-identity-dedup).
- [x] SECURITY: a filter whose root is `$or` escaped the record ACL and the section pin (`pin AND A OR B AND acl`); a scoped user saw records of projects she does not hold. (2026-09-29: every WHERE part is parenthesized where the parts meet. WC-2026-09-29-search-where-parts-parenthesized; gate test/unit/search_path_acl_native.test.ts, root-$or case.)
- [x] Search: verify count empty values (MDCAT case)
- [x] Search: The UI count panel has a delay when calculating and returning, which creates a moment of confusion for the user (who views the old value as the new one).
- [x] Check Activity (dd542) and Time machine (dd15) searches in list. Both are special matrix variants, and needs specific handling.
- [ ] Deep `!=`: its "has a value" half runs the reversed (index) shape over the WHOLE related section — the dominant cost on a large one. Force it to the correlated form (the `reverse` field of DeepClause makes it a one-line policy). Measure first.
- [ ] Deep `!!` ACL lookup (`aggAcl`, conform.ts) runs `recordPredicate` for EVERY deep string/json leaf, not only `!!` ones. Compute it only when a unit classifies `duplicated`.
- [ ] Deep search gates: add a multi-section (UNION) search with a deep leaf to test/unit/search_deep_semantics_native.test.ts (only hand-probed so far).
- [ ] Deep reversed shape: an intermediate hop's source is constrained to neither the declared step table nor its section_tipo when that hop has no ACL; and the index skips non-int4 locator ids that the correlated form still casts. Both pre-existing; decide whether the reversed shape should match the correlated one exactly.
- [ ] Search: verify multiple left join issues (MDCAT case)
- [ ] Search presets: clean up all presets to prevent issues. Important.
- [ ] Search: improve search panel design (see 'CSS search panel design' session)

## UI & Responsive

- [x] Modal headers and buttons restyling (contrast limitation issues)
- [x] pages where the logged user has not access: Currently, the page shows this message: "Not retry-able HTTP error 403". It should show a more user-friendly message like "You don't have permission to access this page". (2026-08-12: three causes, all fixed. (1) denied(403,…) put the human sentence in `errors`, the machine channel — the WC-051 defect, now notAuthorized() with `errors:['not_authorized']` at all 31 refusal sites, and `denied(403` is refused by a source-scan gate. (2) the client's fetch layer classified every non-401 non-ok status as a transport failure and threw before .json() — 403 now rides 401's exemption in both layers. (3) `start` is the first call, so a refusal left the client with no get_label: the refusal now carries the environment block the success path already builds, and page.js injects it before rendering. Measured in a real non-admin browser session: the panel went from 6 lines of "Not retry-able HTTP error 403 / see your server log" + 5 console errors to "No tienes permiso para acceder a esta página" + Home, 0 console errors. Label no_access_page (master + 17 catalogs). WC-2026-08-12-authorization-denial-token; gate test/unit/authorization_denial_native.test.ts.)
- [x] Component password : improve user experience. Currently, the component password is very opaque to users.
  This could be improved by adding helpers to clearly inform users what is expected and identify problems with the value entered, such as a string that is too short or contains invalid characters.
  The process of accepting or rejecting values must be very clear to the user.
- [ ] Responsive CSS. Improve the current mobile view: buttons, layout, list, etc.
- [ ] Responsive design: ensure all main tools are responsive
- [x] Messages from request when the server takes more time than expected: valorate the improve the messges manager policy to be less intrusive. (2026-10-01: the per-request "Awaiting for busy server.." bubble (raised by the /health probe at timeout/2, one per request, lingering on its own timer) is replaced by ONE page state — common/js/request_activity.js, painted by page/js/request_activity_indicator.js: nothing <1.5 s, a thin top bar after, + one sentence (label server_slow_response) after 8 s, gone when the last request settles; background polls (lock heartbeat/status, job tray) and declared long operations (timeout > 60 s) excluded by default, busy_notice opts in/out; a CSRF resend keeps the same wait; the status text is an always-present live region. Identical page bubbles merge into one ×N (prepend_bubble). Gates test/unit/request_activity_native + client suite test_request_activity. Left: label awaiting_busy_server now unreferenced — removal is a WC-034-class edit.)

## Ontology

- [ ] Overwritting Ontology nodes (with localontlogy definitions -localontlogy0-) (see https://github.com/renderpci/dedalo/blob/v7_php_frozen/docs/core/ontology/ontology_class.md). Ensure the functionality is implemented in v7 ts. Note that the overwrite is made on parse the ontology (creating dd_ontology resolved records) and is not calculated never again until a new parse.
- [ ] Ontology: Default lang will be english. Review the entire workflow to ensure it works correctly, especially publication (current definition is only in spanish).

## Deploy & Migration

- [x] Documentation: Build entire flow to publish v7 doc + v6 doc. (2026-09-21: one permanent prefix per major — dedalo.dev/docs/v7/ and /docs/v6/ — with /docs/ redirecting to the latest and legacy flat URLs 301'd to v7, which is a path-compatible superset of v6 (46 of its 52 pages exist at the identical path; the 3 that do not are a closed exception list). `bun run docs:publish` IS the gate: content tripwires + `mkdocs build --strict`, then a --delete rsync scoped inside the version prefix; hard refusal, no --force, no CI and no vendor in the path (.github/workflows/docs.yml is advisory only). v6 is off the shared site_dir symlink, wears slate blue-grey instead of the Dédalo orange so readers can tell the manuals apart, and carries the version switcher plus an 'older version' banner. v8 = build into /docs/v8/, add a versions.json row, flip one redirect. Gate test/unit/docs_versioning_tripwire.test.ts, including the rename gate that refuses to publish a page deleted without a redirect_maps entry; routing in deploy/docs/htaccess.)
- [ ] Master: Ontology and Code client update v6 compatibility from v7 (paths, etc.)
- [ ] MHT: Deploy and migrate to v7
- [ ] mdcat DB (dedalo7_mdcat) lacks migration 0009 (`f_regex_literal` / `f_like_literal`): every text search fails there. Apply the migration before using it as a perf/validation DB (schema change — needs authorisation).
- [ ] area_maintenance widget 'unit_test' make sense in production mode?

## Messaging

- [ ] Messages system for users communication (see Agora https://agora.dedalo.dev/d/364-proposal-to-include-a-message-thread).

## Components & Sections

- [x] component_filter_records (dd128 -> dd478) does not work correctly. (2026-08-12: three defects. (1) the edit form rendered zero rows — the section read stubbed `datalist: []` and only the direct get_data door computed it; the datalist now rides the model emit hook, PHP's single json builder, and `list`/`tm` omit the key like PHP. (2) a search-panel filter row emitted NO item at all (synthetic `search_<n>` id → literal no-record branch returned []), so the unguarded `data.datalist.length` threw; the literal branch now serves the search shell like the relation branch. (3) the saved allow-list was never enforced — PHP gates it on a dropped constant AND its lookup is dead code; the row-level ACL is now a real predicate in the search assembler, inherited by list/count/UNION/per-record probe. WC-2026-08-12-filter-records-enforced; gate test/unit/filter_records_native.test.ts.)
- [x] component_info (dd128 -> dd1537) user stats does not work correctly. It only shows the last activity, not the expected whole user activity history. (2026-08-12: the user_activity window was hardcoded to today-1y, so user 1 showed 21 of 284743 events while 705 pre-aggregated stats days sat unread since 2015. The span now comes from the data — savedStatsDayBounds() min/max dd1530 day — and the raw log is aggregated only for the tail after the last saved day; a user with NO saved rows keeps the 365d bound (the one imposed bound, against an unbounded scan of a multi-million-row actor) and logs a warning. Uncovered a second defect fixed here: a day aggregated twice was summed twice (191 duplicated days inflated user 2 to 41051 events over a 35123-row log) — crossUsersRangeData now folds one row per day, newest run wins. WC-2026-08-12-user-activity-full-history; gates user_activity_totals_native + user_stats_range_native. STILL OPEN: mid-history days the catch-up never aggregated stay invisible (the tail starts after the last saved day, it does not fill holes), and the duplicate ROWS are still in the store — both are writer/rebuild side.)
- [x] Check component_date strange behavior when editing in list (modal) saves values different from the displayed one (e.g. rsc75 -> rsc89).
- [x] Review client test TS_OBJECT source (change ts1 by a safe thesaurus tipo).

## Tools & Labels

- [x] Review all tools labels (get_tool_label) and translations. (2026-07-27: 63 undefined keys defined + 1241 translation entries → 309 keys × 10 app langs at 100%; fixed tool_assistant/tool_sitebuilder reaching for the wrong resolver and the `Columns`/`columns` case mismatch; deleted get_tool_label's unreachable 3-tier lang chain and gated the single-lang serving contract — engineering/TOOLS_SPEC.md § Tool labels.)
- [x] Review tool_import_dedalo_csv importing from v6 raw data (v7_php_frozen it works, but v7 not)
