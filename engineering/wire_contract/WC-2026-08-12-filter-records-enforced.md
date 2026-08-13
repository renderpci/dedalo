# WC-2026-08-12-filter-records-enforced — component_filter_records is a LIVE row-level ACL, not a stored decoration

- **Date:** 2026-08-12 (engineering/TODO.md "component_filter_records (dd128 →
  dd478) does not work correctly").
- **Decision:** DEC-15 (deliberate divergence), DEC-12 (tripwire in the same
  change).

## What the component is

`component_filter_records` (`dd478`, on the USER record, `misc` column) is the
row-level access control that names INDIVIDUAL records a user may see, per
section — the finer-grained companion of the project-based `component_filter`:

```json
[ {"id":1,"tipo":"rsc170","value":[1,8,9]},
  {"id":2,"tipo":"numisdata3","value":[3]} ]
```

reading as *"in `rsc170` this user sees only records 1, 8 and 9"*.

Three separate things were wrong, all of them the same shape: the component
existed and the datum was stored, but NOTHING downstream consumed it.

## 1. The editor rendered ZERO rows (a bug, not a divergence)

PHP builds the item in one place for every door
(`core/component_filter_records/component_filter_records_json.php:117-152`):
`list`/`tm` emit `get_list_value()` and NO `datalist` key; every other mode emits
the stored entries **plus** `datalist` = `get_datalist()` — the sections the
LOGGED user administers (level ≥ 2), `{tipo, permissions, label}`, label-sorted.

TS emitted a hardcoded `datalist: []` in `section/read.ts` for every mode, and
computed the real list in ONE door only (`section/read_facade.ts`, the direct
component `get_data`). The section read — the door the edit form actually uses —
therefore always served the empty array, and both client renders that consume
the key are unguarded (`view_default_edit_filter_records.js:142` and
`render_search_component_filter_records.js:165` both do `datalist.length`), so
the component rendered its header row and nothing else.

**Shape after:** the datalist rides the model's emit hook
(`components/component_filter_records/emit.ts`), so the section read and
`get_data` serve the same key, and `list`/`tm` omit it exactly like PHP. The
hardcoded stub and the read_facade special case are both deleted — one writer.

## 2. A SEARCH-mode filter row emitted no item at all (a bug, not a divergence)

The search panel builds each filter component with a client-minted
`section_id` (`'search_<n>'`, `search.js get_section_id`) that addresses no
record. `readComponentData`'s LITERAL branch answered `[]` for a null record, so
`self.data` stayed `{}` and the unguarded `data.datalist.length` threw: the
`dd478` filter row never reached `rendered`. The relation branch and the
select/filter family already had the carve-out; the literal branch now shares
it — a search-mode no-record read serves the component's own item (`entries: []`
plus the model's decorations), which is what PHP's `get_json` does for any
component with permissions > 0, record or not. The synthetic id is echoed
VERBATIM (the client matches `String(el.section_id)===String(self.section_id)`)
and `row_section_id` is absent, there being no record row.

## 3. THE DIVERGENCE — the allow-list is now ENFORCED

**Shape before (PHP).** Two conditions, and BOTH refuse:

- `build_filter_by_user_records` (`core/search/trait.where.php:133-180`) returns
  immediately unless `DEDALO_FILTER_USER_RECORDS_BY_ID === true`. The constant
  defaults to false in `stub.php` and `sample.config.php`, and v7 classifies it
  `DROPPED` / `NO_CONSUMER` (`src/config/migration_map.ts`).
- Even with the constant ON the clause is DEAD. It tests
  `isset($filter_user_records_by_id[$section_tipo])` against
  `component_filter_records::get_user_filter_records()`, which returns
  `component_common::get_data()` — the raw, INTEGER-KEYED entries array, never
  the `section_tipo → ids` map its own docblock
  (`class.component_filter_records.php:73-79`) describes. The `isset` never
  matches, so the `IN` clause is never appended in any install.

**Shape after (TS).** `security/filter_records.ts` reads the datum as the
DOCUMENTED map, and `search/sql_assembler.ts buildUserRecordsFilter` ANDs one
predicate into the same `whereParts` the projects filter uses:

```sql
AND (rs170.section_id IN (1,8,9))
```

Because `record_scope.ts isRecordInScope` runs the real assembler, the list, the
count, every UNION branch, `get_data` and the per-record probe inherit it — the
"one rule, both doors" posture of WC-2026-08-09-users-section-record-scope.

**Why diverge.** An allow-list an administrator saves and the engine then ignores
is a security ILLUSION: the admin sees a configured restriction and the user sees
every record. Either the component enforces or it should not exist; a heritage
install must not carry a third option. There is no v7 constant to gate it on by
design (v7 has no dead config keys), and presence of the datum IS the intent —
the empty case is the overwhelming default and produces a byte-identical query.

**Precise semantics, and why each choice:**

- **Applies to global admins too.** PHP's clause has no admin arm, and an admin
  with no allow-list (the normal case) is unaffected either way. A restriction
  someone deliberately wrote onto an account is not silently voided by a flag on
  the same account.
- **Skipped for internal searches** (no principal) — the projects-filter posture.
- **An empty `value: []` is NOT a lockout**: the entry is skipped. The editor
  never writes it (emptying the input sends `action:'remove'` —
  `component_filter_records.js change_handler`), so it can only come from
  hand-edited or legacy data, and reading it as "sees nothing" would blank a
  section for that user with no UI affordance showing why. PHP would emit
  `IN ( )` there — a SQL syntax error.
- **Ids are int-validated at the reader and interpolated as literals**, not
  bound: PHP does the same (SEARCH-04) to avoid an N-placeholder explosion on a
  large list, and a validated integer has no injection surface. The
  `section_tipo` guards ARE bound, like every other tipo in the assembler.
- **Multi-section gates only the named branch.** PHP builds one clause from the
  FIRST section and copies it into every UNION branch; here each section
  self-selects behind its own `section_tipo` guard, so an allow-list on one
  branch cannot silently drop the siblings (the WC-011 posture).
- **Duplicate entries for one section UNION** rather than last-one-wins: the
  editor keys its rows by tipo, so duplicates are legacy/hand-edited data and
  both id sets were authored as allowed.
- Cached per user (`createDataCache`, evicted on any `dd128` write) — the
  `getUserProjects` posture, so an edited allow-list takes effect on the next
  search.

## Gate reconciliation

`test/unit/filter_records_native.test.ts` — the reader's parse rules (dedup,
int validation, empty-entry skip), the predicate (named section restricted,
unnamed section untouched, no-datum user unfiltered, internal search never
gated, multi-section per-branch), and the datalist mode rule (`list`/`tm` omit
the key, `edit`/`search` always carry it, fail-closed empty without a
principal).

**No re-harvest.** The frozen oracle store holds no `dd478` data item at all
(no harvested interaction carries one) and no harvested search ran as a user
with an allow-list, so no fixture response changes. The PHP shapes above are
recorded from the frozen source as fossils.
