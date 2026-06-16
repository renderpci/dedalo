# Cross-Movement Portal-Value Search — Design

**Date:** 2026-06-15
**Status:** Approved (design); pending implementation plan
**Author:** brainstorming session

## Summary

Allow users to search a section by the values held in records reached *through* a
portal, combining several values with AND / OR — and have the AND combine **across**
the linked records, not within a single one.

Canonical example:

> Section **Refugees** (`dmm2070`) → portal **Movements** (`dmm2099`) → component
> **Municipality** (`dmm2045`, linking to places section `es1`).
>
> Find Refugees whose Movements reference **Caldes de Malavella** (`es1_1558`) **and**
> **Irun** (`es1_3496`) — where the two municipalities may live in **different**
> Movement records of the same Refugee.

The user already builds this in the search panel today (two drilled "Municipi" boxes
combined by the group operator), but it returns **"No records found"** because of a
server-side defect. This design fixes that defect; no new UI is required.

## Background — what already exists

The search stack is already capable of almost all of this:

- **`search_query_object` (SQO)** supports a `path`: an ordered chain of
  `{section_tipo, component_tipo}` steps. `core/search/trait.where.php::build_sql_join()`
  turns each step into a PostgreSQL `LATERAL JOIN` over the `relation` JSONB column, so a
  path `dmm2070 → dmm2099 (Movements) → dmm2045 (Municipality)` is expressible.
- **Logical operators** are a Mango-style filter tree (`{"$and":[...]}` / `{"$or":[...]}`,
  nestable, allowlisted to `AND/OR/NOT/NAND/NOR` in `filter_parser()`).
- **Relation matching** against a locator works via
  `relation @> '{"dmm2045":[{"section_id":"1558","section_tipo":"es1"}]}'::jsonb`
  (`core/component_relation_common/trait.search_component_relation_common.php`).
- **Client UI** already provides: drag-and-drop field builder, **prominent group-level
  AND/OR toggle** (`core/search/js/render_search.js`, `toggle_operator_value()`),
  multi-value selection, and **path drill-down** — clicking a portal in the field picker
  recurses into its target section and extends the `path` array
  (`core/common/js/render_common.js`, `common.js::calculate_component_path()`).
- The final filter tree is assembled client-side by
  `core/search/js/search.js::serialize_filter_model()` into nested `$and`/`$or`.
- Queries already apply `DISTINCT ON (section_id)`, so duplicate parent rows produced by
  one-to-many joins are collapsed.

## Root cause of the bug

In `core/search/trait.where.php::build_sql_join()` (≈ lines 409–487) the join **alias**
is derived **purely from the path tipos**:

```php
$t_name = implode('_', $ar_key_join);  // e.g. dmm2070_dmm2099_dmm2045
```

Two leaf clauses with the **identical** drilled path therefore resolve to the **same
alias** and reference the **same** Movements join row. The generated WHERE becomes:

```sql
movement.relation @> '{"dmm2045":[{...Caldes...}]}'
AND movement.relation @> '{"dmm2045":[{...Irun...}]}'
```

i.e. it demands a **single** Movement that is in Caldes *and* Irun at once → no rows →
"No records found". This is intra-row AND, not the desired cross-row AND.

(Note: the old per-alias dedup guard at ~line 447 is commented out, but the outcome is the
same — identical alias names force the clauses to share one logical join.)

## The fix (backend-only)

Give **each distinct leaf search-clause its own independent join alias namespace**, so
each criterion traverses the Movements portal independently.

### Engine changes — `core/search/trait.where.php`

1. Thread a **per-leaf-clause discriminator** (a counter incremented once per leaf filter
   element that owns a multi-step `path`) into `build_sql_join()`, so the alias becomes
   e.g. `c2_dmm2070_dmm2099_dmm2045` instead of a path-only name shared across clauses.
2. Ensure the leaf clause's conformed `sentence` references the alias **returned by
   `build_sql_join()` for that clause** (`$last_table_name`). Verify the conform path
   (`parse_sqo()` → component `get_search_query()`) propagates the returned alias into the
   clause's `sentence`, rather than recomputing a path-only alias.
3. **Within a single clause**, path steps must still share aliases (one traversal is one
   join chain). Only **distinct leaf clauses** get distinct namespaces.
4. Confirm `DISTINCT ON (section_id)` remains applied so independent joins do not produce
   duplicate parent rows.

### Resulting semantics (no UI change)

Once aliases are per-clause, the **existing** group AND/OR toggle yields both meanings:

- **AND group** → Refugee has *some* movement in Caldes **and** *some* movement in Irun
  (cross-movement — the requested behavior).
- **OR group** → *either* municipality.

And grouping gives users **both** semantics with no new concepts:

| User action | Semantics | Mechanism |
|---|---|---|
| Separate boxes, AND group | "across movements" (cross-row) | independent joins (this fix) |
| Multiple values in one box | "within one movement" (intra-row) | single `@>` clause (unchanged) |
| Separate boxes, OR group | "either municipality" | independent joins + `$or` |

## Components & data flow

```
[Search builder UI]  (unchanged)
   drill Movements → Municipality, add value(s), set group AND/OR
        │  serialize_filter_model()  →  {"$and":[ clauseA, clauseB ]}
        ▼
[search_query_object]  (unchanged shape)
   filter.$and[i].path = [ {dmm2070,dmm2099}, {dmm2070?/movement, dmm2045} ]
        │  parse_sqo() → component get_search_query()
        ▼
[trait.where.php]  (CHANGED)
   build_sql_join() emits an INDEPENDENT LATERAL+LEFT JOIN per leaf clause
   with a per-clause alias namespace; clause sentence binds to that alias
        ▼
[SQL]  DISTINCT ON (section_id) … two independent Movements joins … WHERE clauseA AND clauseB
```

The SQO shape, client UI, operator toggle, and locator format are all **unchanged**. The
only edited production file is `core/search/trait.where.php` (plus any conform-side glue
needed to propagate the per-clause alias).

## Error handling & safety

- Keep the existing `is_valid_tipo()` security gate on every interpolated `component_tipo`
  / `section_tipo` (JSONB keys cannot be parameterized); the new discriminator is a
  server-generated integer/prefix and is never client-supplied.
- The discriminator must not break the existing single-clause and single-level-path cases
  (those must produce byte-for-byte equivalent SQL where possible, or at least equivalent
  result sets).

## Testing

1. **SQL-shape unit test** (mirror `test/server/components/component_portal_Search_Test.php`):
   given a filter with **two same-path leaf clauses**, assert the generated SQL contains
   **two independent** Movements joins with **distinct aliases**, and that each WHERE
   fragment references its own alias.
2. **Regression**: a single clause and a single-level path still generate correct,
   minimal SQL (no spurious extra joins, no duplicate-alias errors).
3. **Data-level test** on a known fixture:
   - Caldes **AND** Irun (separate boxes) → returns refugees that have *separate*
     movements to each (the screenshot case → **non-empty**).
   - Caldes **OR** Irun → union of the two.
   - Caldes + Irun in **one box** → only refugees with a *single* movement referencing
     both (expected near-empty for distinct municipalities).
4. **Manual verification** in the search builder reproducing the screenshot, confirming
   results now appear.

## Out of scope (YAGNI)

- **`EXISTS`-subquery rewrite.** Architecturally cleaner (no row multiplication, no reliance
  on `DISTINCT`), but a large new code path. The per-clause alias fix plus the existing
  `DISTINCT ON (section_id)` is correct and surgical. Revisit only if criterion counts grow
  large enough to make join fan-out a measurable performance problem.
- **Inline-on-portal search surface.** The search builder was chosen as the single entry
  point.
- **Group / operator UI changes.** The existing AND/OR toggle already exposes both
  operators; making the hidden per-portal `q_operator` text input a visible affordance is
  not needed for this feature.

## Open questions for implementation

- Exact intermediate `path` shape the client emits for the Movements → Municipality
  drill-down (whether the movement section tipo appears as its own step). The plan should
  capture a real serialized SQO from the screenshot scenario before editing the builder, to
  drive the SQL-shape test from ground truth.
- Whether any other caller of `build_sql_join()` (e.g. `order` clauses via `trait.order.php`)
  relies on the current path-only alias and must be updated in lockstep.
