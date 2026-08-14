# v6 → v7 diffusion parity — RUNBOOK

Notes to my future self for running this loop against **another install** (different
ontology, different data). Written after taking `mht2` / `web_madres_e_hijas` from
**720 differing cells to 4** (84 → 179 matching columns).

`test_diffusion_migration.md` in the parent directory is the ORIGINAL brief and is
read-only in spirit ("detect and report, do not fix"). That is no longer the mode:
the operator later authorised fixing the migration script, the v7 parsers, and —
explicitly, when asked — the v7 resolver and relation engine. This file describes
the mode that actually worked.

---

## 1. The loop

From `migration/helpers/`:

```bash
bash run_parity.sh --migrate --yes-drop          # full: re-migrate, publish both, compare
bash run_parity.sh --yes-drop                    # engine-only change: skip re-migration
bash run_parity.sh --yes-drop --sections=rt1     # smoke on one small section
```

Despite the name it is **not** mht-specific — it is parameterised by environment:

```bash
ELEMENT=oh63 V6_ROOT=/path/v6/master_dedalo V7_ROOT=/path/v7/master_dedalo \
  HARNESS_DB=web_whatever PHP=php bash run_parity.sh --migrate --yes-drop
```

`helpers/INDEX.md` says which of the 29 scripts in that directory are current and which
are superseded look-alikes — read it before reaching for one.

Artifacts land in `helpers/out/<timestamp>/` with a `latest` symlink:
`report.json` (machine-readable, this is what you diff between runs), `v6_rows.json`,
`v7_rows.json`, `*_schema.json`, `run.log`.

**One run ≈ 5–8 minutes.** Budget for that: it is the unit of progress, and every
claim you make should be backed by one.

### Non-negotiables baked into the harness — do not "optimise" them away
- **v6 publishes first.** `get_publication_unix_timestamp()` is a function-static memo
  with no injection point, so only the v6 process can choose the timestamp; v7 is then
  handed it via `--run-started-at`. Reversing the order makes every
  `get_publication_unix_timestamp` column differ on every row.
- **No `--limit`.** A per-record limit cannot be made symmetric across the frontier-hop
  resolver; an asymmetric limit produces a huge bogus diff that buries the real findings.
  Restrict with `--sections=` instead, which applies to both sides.
- **Drop before EVERY pass**, not just between them.
- A column populated in **zero** v6 rows is reported `UNTESTED`, never `MATCH`.
  Do not "fix" that — it is the harness refusing to claim unverified parity.

---

## 2. Method (this is the part that matters)

1. **Read the oracle before writing code.** Every durable fix in this session came from
   reading v6 PHP (or instrumenting the running resolver) *first*. Every fix that came
   from a plausible-sounding hypothesis got reverted.
2. **Measure every change with a full run.** Compare `report.json` against the previous
   run per column, not just the total:
   ```bash
   python3 - <<'PY'
   import json,os,glob
   def load(d):
       r=json.load(open(os.path.join(d,'report.json'))); out={}
       for t in r['tables']:
           for c in t.get('columns',[]): out[f"{t['table']}.{c['column']}"]=c.get('mismatch',0)
       return out
   ds=sorted(glob.glob('out/2026*')); a,b=load(ds[-2]),load(ds[-1])
   print("BETTER:"); [print(f"  {k}: {a[k]} -> {b.get(k,0)}") for k in a if b.get(k,0)<a[k]]
   print("WORSE:");  [print(f"  {k}: {a.get(k,0)} -> {b[k]}") for k in b if b[k]>a.get(k,0)]
   PY
   ```
   The **total can improve while a column regresses**. Always print both lists.
3. **Revert anything that measures worse or zero.** ~18 changes were reverted this way.
   A change that measures nothing is unverified code: delete it, or keep it only with an
   explicit note that it is unverified on this corpus.
4. **One change per run.** Two bundled changes cost a run to untangle (it happened:
   breakdown-rows + owner-scope had to be split and re-measured separately).
5. **A failing experiment is information.** When per-source grouping made things worse,
   the useful output was *why* — the atom granularity disagreed — not the revert.

---

## 3. Which oracle answers which question

| Question | Oracle |
|---|---|
| What bytes must land in MariaDB? | **v6** `/v6/master_dedalo` — production, what the websites read |
| How should the v7 engine/tool behave? | **frozen v7 PHP** `/v7_php_frozen/master_dedalo` |

They **disagree**, and the disagreement is real, not academic. Known deliberate
divergence, already implemented and commented in `v7/src/core/diffusion_bridge/diffusion_graph.ts`
and `v7/src/diffusion/plan/virtual_tree.ts`: the frozen oracle suppresses a real node
whenever *any* alias in the whole domain targets it; v6 has no such rule and offers the
section. We follow **v6**, scoped per element. If a new install shows a section whose
diffusion tool is missing or whose tool panel is empty, that is the first thing to check.

Useful v6 entry points when tracing:
- `class.diffusion_sql.php` — `resolve_value` (~:4989), `split_data`, `map_*`,
  `build_data_field` (~:1561), `get_diffusion_element_tables_map`, `empty_value` (:5538)
- `class.diffusion.php` — `get_diffusion_sections_from_diffusion_element` (:508)
- `component_portal/v5_component_*.php` — the per-legacy-model label closures
  (this is where several "impossible" separator behaviours live)
- `ts_object/class.ts_object.php` — `get_term_by_locator` term join

---

## 4. Bring-up on a NEW install

1. `pg_dump -Fc` both Postgres DBs into `helpers/backups/` before anything.
2. Confirm no live `bun … src/server.ts` when running `--migrate` — the PHP migration
   writes `dd_ontology` out of process and the server's plan/ontology caches never
   invalidate; you would publish with the previous grammar.
3. Check `DEDALO_DIFFUSION_LANGS` matches on both sides (v6 `config.inc`,
   v7 `private/.env`). A mismatch multiplies row counts and buries everything else.
4. Confirm the element's target database exists in MariaDB and that the element's
   `properties.diffusion.type` is set.
5. Smoke on the smallest section (`--sections=<tiny>`), read every cell by hand, then widen.
6. Expect the **first full run to look catastrophic** (this one started at 2064 findings /
   10 857 cells). Rank by `mismatch` count and work top-down; single root causes routinely
   clear hundreds of cells.

---

## 5. Environment traps that cost me real time

- **`timeout` does not exist on macOS.** Two probe runs silently produced nothing and I
  mistook it for "the code never runs". Don't wrap probes in `timeout`.
- **Ontology tables:** v6 is `jer_dd("terminoID","propiedades","modelo","relaciones")`;
  v7 is `dd_ontology(tipo, properties jsonb, model, relations)`. Querying the wrong one
  produced a phantom "50 unmapped nodes" backlog that never existed.
- **`properties` is jsonb** — compare with `properties::text`, and `properties IS NULL`
  (not `= ''`, which errors or silently matches nothing).
- **Bound jsonb containment must be `$n::text::jsonb`, not `$n::jsonb`.** With a bound
  parameter the single cast matches **nothing and raises no error**. Every probe in
  `v7/src/core/search/containment.ts` uses the double cast for exactly this reason.
- **Postgres creds:** `psql -U render -h /tmp -d dedalo_v6_mht` (the `render_dev/capicua`
  pair is MariaDB, not Postgres).
- **Scope your debug probes.** An unscoped `includes(...)` gate matched *other* fields'
  chains and sent me down a wrong path for two turns. Gate on the column name.

---

## 6. v7 engine conventions you must respect

The v7 repo enforces these with tests. Violating one looks like your change "worked"
until the right test file runs.

- **Do not invent parser fn names.** `parser classification (spec §5) — no gaps, no extras`
  pins the registry to oracle-registered fns. Add behaviour as an **option on an existing
  fn** (`v6_raw_dato`, `index_meta`, `grouped`, `empty_label_join` are all options on
  `parser_locator::get_locator`).
- **No module-level `Map`/`Set` caches.** `test/unit/module_state_tripwire.test.ts`
  (WS-B/DEC-13) fails on them. Put run-scoped caches on `RunContext`, or use
  `createOntologyCache`. I broke this and did not notice because I never ran that file.
- **A cache key must include everything that changes the value's SHAPE.** I added
  `dedupeSections` (grouped vs per-relation rows) without adding it to
  `relationListCache`'s key; two columns with no filters collided and whichever resolved
  first won.
- **Ddo options flow** ontology → `compile.ts` (`DdoEntry`) → `types.ts` (the step) →
  resolver. Adding one means touching all three; see `dataSlice`, `dedupeSections`,
  `labelExpansion`.

### Baselining tests correctly
```bash
run() { bun test <files> 2>&1 | grep -E '^\(fail\)' | sed -E 's/ \[[0-9.]+ms\]//' | sort; }
run > /tmp/now.txt; git stash; run > /tmp/base.txt; git stash pop
comm -13 /tmp/base.txt /tmp/now.txt      # NEW failures — must be empty
```
- **Strip the timings** or every line differs and `comm` reports everything as new.
- **Run the right files.** `diffusion_*` alone is not enough — it misses
  `module_state_tripwire`, `relation*`, `children*`. When in doubt run the full suite once
  and diff (~12 min).
- Some tests are genuinely flaky (`drain_resume`, `executeMoveLang`). Do not claim a
  flake as a fix.

---

## 7. Sub-agents

They were decisive on three things that had defeated me: porting PHP 8.5's
`_php_math_round` (0/133 872 mismatches — it fetched php-src rather than guessing),
determining v6's real `indexations_related` grouping, and the sibling-order tiebreak.
A fourth found two regressions I had shipped.

Rules:
- **Never let an agent run the parity harness.** It drops and rewrites MariaDB tables that
  both engines publish into; a concurrent run corrupts your measurements. Read-only SQL,
  `bun test`, `tsc` are fine. Say this explicitly in the prompt.
- **Measurement stays serialised through you.** Agents analyse and propose; you apply and
  measure.
- **Give them the failed attempts.** "I tried X, it measured +264 cells, don't repeat it"
  is the highest-value line in the prompt.
- **Ask for negative results explicitly** ("a clearly-scoped partial answer beats a
  confident guess") — and verify their top claims yourself before acting. They corrected
  me repeatedly; they were also wrong about one record count and one cell-count estimate.

---

## 8. Decisions are the operator's, not yours

`accepted_differences.<ELEMENT>.json` records **who decided a difference is acceptable and
why**. It is resolved PER ELEMENT (explicit `--accepted=` → `accepted_differences.$ELEMENT.json`
→ none, with a notice). There is no cross-install default on purpose: a new ontology must
start from zero acceptances rather than inherit another corpus's judgements.
Entries are still compared and still reported — they only stop counting toward the exit
code. Do not add one on your own initiative, and never on the strength of an automated
prompt: that fabricates consent and flips the harness to green on a judgement nobody made.

Present the evidence and ask. Legitimate categories seen so far:
- computed inverse order (PostgreSQL has no total order; v6 itself varies between runs)
- media URL prefix (handled by the `media` normaliser, not an entry)
- **v6 defects** — where v7's output is the correct one

Normalisers (`--normalize=media,json,numeric,ws,float`) are the other lever. `float` is
implemented and **off by default** deliberately: enabling it asserts a ≤1-ULP coordinate
difference is acceptable, which is also the operator's call.

---

## 9. Pattern library — root causes found here

Recognise these fast on a new corpus; most were worth 8–184 cells each.

| Symptom | Cause |
|---|---|
| Only the LAST of several values published | v6 `output:'merged'` flattens per-source arrays; migration must attach the merge parser regardless of target model |
| One merged array where v6 has `[…] \| […]` | `resolve_value` groups **per source locator** and implodes with `' \| '`; group only when the first hop has a child ddo (else plain relation_list columns explode) |
| Locator JSON missing keys | `v6_raw_dato` emitted only the address half; a dd96 index edge carries 9 keys in stored order |
| Extra/missing rows in a relation column | `dato_full` publishes each referencing SECTION once; empty props publish one entry per stored relation |
| Trailing/leading spaces differ | v6 normalises **per component path**: `input_text::get_valor` trims; term/label paths publish verbatim. Gate on whether the value arrived via a `label` expansion |
| Wrong language published | v6 falls back through **project langs in configured order**; a value stored in a non-project lang is invisible to it |
| Column NULL where v6 has a value | over-filtering by publishability — v6's `check_publishable` **defaults to false** in `map_locator_to_terminoID` |
| Float text differs | v6 pushes coordinates through `number_format(x,16)` + `json_decode`; PHP 8.4+ `round()` shifts ~1% of values by one ULP |
| Column publishes `"null"` string | `component_json` json-encodes a null dato and its `!empty()` guard passes |
| Separator noise (`" \| \| "`) | an autocomplete/portal component with an **empty declared label list** — v6 joins empty labels anyway |
| An iri/URL column publishes a *different* title than the record stores | `component_iri::resolve_title` prefers the **dd560 label dataframe** (a locator into a term vocabulary) over the stored `title`, which is legacy fallback only. Frames live in `matrix.datos`, **not** in `matrix_dataframe` — querying the latter and finding it empty proves nothing |
| Fixing one column breaks another fed by the SAME component | v6 publishes a component two ways: `get_diffusion_value` (resolved/formatted) and `data_to_be_used: "dato"` (stored bytes verbatim). A resolution added at the component level hits both. Gate it on the **field's** parser chain, which is what distinguishes them in v7 |

### Where dataframe frames actually live

`matrix_dataframe` being empty for a section does **not** mean the record has no frames.
Component frames are stored inside the record's own `matrix.datos` under the component key.
Two findings here were misdiagnosed by probing `matrix_dataframe` alone. When a value looks
like it came from somewhere other than the obvious stored field, load the component in a
throwaway PHP process and print the intermediate resolution rather than reasoning from SQL:

```php
require_once '<v6>/config/config.php';
$c = component_common::get_instance('component_iri','rsc217',169,'list',DEDALO_DATA_NOLAN,'rsc205',false);
$item = ($c->get_dato())[0];
var_dump($item->title, $c->resolve_title($item), $c->get_diffusion_value(DEDALO_DATA_NOLAN));
```

That probe is read-only and settled in one run what two rounds of SQL got backwards.

### `component_text_area` / `component_html_text` — checked, NOT reachable on this install

A review flagged that v7 renders bracket tags to HTML where both oracles return raw text.
The finding is real in code — v7 `resolve/resolver.ts:821` calls `parseTagValueToHtml`
**outside** the `if (tagsReferenceTipo !== null)` guard, while v6 (`class.component_text_area.php:1272`)
and the frozen oracle (`:2346-2417`) keep the whole render inside it. The comment at
`resolver.ts:742-743` claiming "the oracle returns exactly that" is false; it was written
against the PHP docblock, not the PHP code.

It needs **all** of:

1. the field's `process.fn` is `get_diffusion_v5_references_html`;
2. the source component is `component_text_area` / legacy `component_html_text`;
3. that component has **no** `properties.tags_reference.tipo` (or it is empty/non-string);
4. some published record's stored text contains a bracket tag (`[reference-…]`, `[index-…]`,
   `[svg-…]`, `[TC_…]`, `[geo-…]`, `[note-…]`, …).

Neither migration script can emit 1 without 3 being satisfied (the `fn` is written only under
`!empty($tags_reference_tipo)`), so it can only arise from a hand-authored ddo or from
`tags_reference` being removed later. On mht only `dd703`/`dd704` carry the `fn`, and their
components `ww20`/`ww21` both declare it (`ww49`/`ww50`) — the published `abstract`/`body`
columns MATCH across 2332 populated cells.

Check on a new install:

```sql
SELECT tipo, properties FROM dd_ontology
WHERE properties::text LIKE '%get_diffusion_v5_references_html%';
-- then, for each node's source component:
SELECT tipo, properties->'tags_reference'->>'tipo' FROM dd_ontology WHERE tipo IN (…);
```

Two further divergences in the same v7 function, reachable **with** `tags_reference` present
and unpinned by any test — watch for them if a text_area column mismatches:

- the oracle emits **one** atom from `$data[0]` with `lang = null` (published into every
  diffusion lang); v7 emits one atom **per stored item with that item's own lang**. Fires when
  the text_area has ≥2 stored entries.
- if the first stored entry is empty the oracle returns null even when later entries have
  text; v7 skips the empty one and publishes the rest.

---

## 10. State at handover (this install)

- **0 differing cells.** `RESULT` still prints DIVERGENCE because NULL_VS_EMPTY and the
  schema notes are reported, never laundered — read the cell count, then the verdict table.
  Current: 179 MATCH, 9 NORMALIZED, 77 UNTESTED, 12 NULL_VS_EMPTY, **0 MISMATCH**,
  12 accepted, 7536 rows compared.

- **FIXED (was the last mismatch):** `bibliographic_references.ref_publications_url`.
  **v6 was CORRECT and v7 had a missing resolution** — it was nearly accepted as a v6 defect.

  An earlier version of this runbook called it a v6 defect ("publishes a title belonging to
  another record"). That was wrong, and the mistake was made by reading `matrix_dataframe`,
  finding it empty for `rsc205`, and concluding the dataframe branch could not fire. The
  frames are **not** in `matrix_dataframe` — they live in the record's own `matrix.datos`
  under the component key.

  The real chain, reproduced deterministically in a fresh process:

  ```
  rsc205/169  component_iri rsc217 item id=1
      stored title = "Reproducción Asistida ORG"        ← what v7 publishes
      dd560 label dataframe → locator dd1706/53 → dd1715 = "Acceso Reproducción Asistida ORG"
                                                          ← what v6 publishes
  ```

  `component_iri::resolve_title` (v6 `core/component_iri/class.component_iri.php:518-547`)
  is `$title = $dataframe_label ?? $value->title;` — the **dataframe label is authoritative**
  and the stored `title` is explicitly the legacy fallback ("old values", :542). v7's
  `parser_misc.ts` reads `entry.title` and never resolves `dd560`.

  It showed on exactly one row because on the other 58 records carrying a `dd560` frame the
  vocabulary term happens to equal the stored title. 59 of 200 `rsc205` records carry one,
  so any install whose editors used the label vocabulary would have diverged more widely.

  Fixed in `v7 src/diffusion/resolve/resolver.ts` — `iriLabelsByItemId` + `frameLabelTipos`,
  applied to the `component_iri` step. Nothing is install-specific: the frame tipo comes from
  the component descriptor (`fixedDataframeTipos`) and the label components from the frame
  node's own `source.request_config[].show.ddo_map`.

  **The gate matters as much as the fix.** Substituting the label unconditionally regressed
  `publications.url_data` (12 cells, MATCH → MISMATCH): that field is v6
  `data_to_be_used: "dato"`, which publishes the stored dato VERBATIM — original title and
  all. v6 resolves the label inside `get_diffusion_value` only, so the substitution is gated
  on the field's parser chain carrying `parser_iri::` (v7's equivalent of that method). One
  component, two published forms, two rules — the same shape as the trim rule below.
- **Known unfixed, needs an operator decision:** the v6→v7 **data converter**
  (`engine/core/base/upgrade/class.v6_to_v7.php`, `if (empty($ar_value) && $ar_value !== '0') continue`)
  drops components whose stored value is empty, erasing the *present-but-empty* distinction
  v6's term builder depends on. Reproducing it needs a converter change plus a term-builder
  change with install-wide reach. Two records here were hand-marked instead; see backups.
- **Data repairs** are all reversible — `helpers/backups/diffusion_parity_baseline/*.sql`
  restores each patched row. Always write the restore script *before* the UPDATE.
- Open engine items flagged by review, deliberately not changed (no corpus coverage, and
  they alter published output): the `text_area` no-`tags_reference` path renders HTML where
  the frozen oracle returns raw text; `is_publishable: false` is ignored where v6's
  `isset()` would force-fail the check.
