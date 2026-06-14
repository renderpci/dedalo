---
name: dedalo-search
description: Architecture and conventions of the Dédalo v7 search subsystem (SQO → SQL over JSONB matrix tables). Use when modifying core/search/ (class.search.php, class.search_related.php, class.search_tm.php, the select/from/where/order/count/utils traits), core/common/class.search_query_object.php, the per-component search traits (core/component_*/trait.search_component_*.php and their _tm twins), core/component_common/trait.search_component_sql_builder.php, the sanitize_client_sqo gate in core/api/v1/json/index.php, or anything that builds an SQO and calls search::get_instance(). Covers the SQO contract, the conform_filter security chokepoint, the prepared-params model, the WHERE/projects-filter/UNION machinery, the search_Test SQL-string test pattern, and the in-progress builder-consolidation roadmap.
---

# Dédalo v7 search (SQO) conventions

All Dédalo search is driven by the **SQO (Search Query Object)** — a Mango/CouchDB-style filter DTO (`core/common/class.search_query_object.php`) parsed into a single prepared PostgreSQL statement over the JSONB `matrix_*` tables. There is one query builder (`search`) with two mode subclasses (`search_tm`, `search_related`). User-facing search UI builds the SQO client-side; dozens of server callers build SQOs directly. These are the non-negotiable rules and the architecture map.

## The flow (one pass, end to end)

```
client JS  core/search/js/search.js          builds rqo.sqo (filter groups, q_operator, limit/offset)
  → core/api/v1/json/index.php:~183           search_query_object::sanitize_client_sqo($rqo->sqo)   ← only untrusted gate
  → search::get_instance($sqo)                core/search/class.search.php — dispatch by sqo->mode:
        'tm' → search_tm | 'related' → search_related | 'edit'|'list'|default → search
  → ->search()                                children_recursive? → dedicated parents search + batch children
  → parse_sql_query() → parse_sqo()           conform_filter(): each filter item → component model
        $model::get_search_query($search_object) → resolve_query_object_sql() in the component's
        trait.search_component_*.php → returns {sentence:"... _Q1_ ...", params:{_Q1_:val}}
  → parse_sql_default()/parse_sql_full_count()/parse_sql_filter_by_locators()
        builds $sql_obj {select,from,join,main_where,where,order,order_default} via traits
        select/from/where/order/count/utils, window-subquery pattern, UNION ALL for multi-section
  → matrix_db_manager::exec_search($sql, $this->params)   pg_execute with $1..$n
  → db_result iterator (parses JSON columns on iteration)
```

`parse_sql_default` execution order is load-bearing (documented in its docblock): **FROM → SELECT → ORDER → WHERE**. ORDER runs before WHERE because component-based ordering calls `build_sql_join()` to add joins, and those need the base FROM established and their aliases available. Don't reorder.

## Hard rules

1. **`sanitize_client_sqo` is the ONLY untrusted-SQO boundary.** The HTTP API (`core/api/v1/json/index.php`, `core/api/v1/common/class.dd_utils_api.php`) is the only place a client-authored SQO enters; server-internal builders construct a `search_query_object` and call search directly, bypassing it. The gate (a) strips server-only SQL fields (`sentence`, `params`, `column_sql`, `table`, `table_alias`) at every depth, (b) strips ACL/control flags (`skip_projects_filter`, `skip_duplicated`, `include_negative`), (c) forces `parsed=false` (a client must never skip the conform pipeline), (d) coerces `offset`/`total` and **clamps `limit` to `DEDALO_SEARCH_CLIENT_MAX_LIMIT`** (default 1000; the `all` sentinel and out-of-range values clamp to the ceiling). When you add an SQO field that can reach raw SQL or weaken access control, add it to the strip list AND update the docblock. Never widen what a client may send without asking why.

2. **`search::conform_filter()` is the central injection chokepoint.** Component search builders string-interpolate `component_tipo` (as a JSONB key / jsonpath member step `$.{tipo}[*]`) and `lang` (into jsonpath/string literals) — values that **cannot be parameterized** (jsonpath `vars` can't parameterize a member accessor). So before any `$model::get_search_query()` dispatch, `conform_filter` validates every path step (`section_tipo`/`component_tipo` via `search::is_valid_tipo()`, OR `is_valid_data_column()` for the legitimate pseudo-tipos `section_id`/`id`/`tipo`/`lang`/`type`/`section_tipo`) and `lang` via `search::is_valid_lang()` (`^(lg-[a-z0-9_]+|all)$`), **throwing** on bad input. This one gate covers ALL component traits, including single-level paths that never reach `build_sql_join` (which has its own gate for multi-level join keys at `trait.where.php`). If you add a per-component builder that interpolates a new SQO field into SQL, gate it here, not in the leaf.

3. **Everything else is a prepared param.** `get_placeholder($value)` (`core/search/trait.utils.php`) returns `$1..$n` and stores `$this->params` as a **0-indexed positional list of values** (dedup by strict `array_search`). NEVER key params by value (PHP array-key coercion silently mangles `1.5→1`, `true→1`, `null→''`). Consumers (`exec_search`, `debug_prepared_statement` in `class.search.php`/`trait.count.php`/`trait.utils.php`) pass `$this->params` directly — not `array_keys(...)`. Component leaves build sentences with `_Q1_`, `_Q2_`… token placeholders + a `params` map; `parse_search_object_sql()` swaps each token for a real `$n` placeholder. Prefer adding a `_Qn_` param over inlining a value into a literal.

4. **Identifiers that truly can't be parameterized go through an allowlist, never a denylist.** `is_valid_tipo` (`^[a-z]+[0-9]+$`), `is_valid_data_column` (fixed matrix column set), `is_valid_lang`, the order `direction` allowlist (`ASC|DESC`), the `column_format_parser` operator allowlist (`=,!=,<,>,<=,>=`) and column-name allowlist. `trait.order.php`'s `column`/`column_sql` paths require a strict `^[a-zA-Z_][a-zA-Z0-9_]*$` identifier (or are server-built `column_sql`, which the client SQO must never carry — it's stripped in rule 1). Don't replace these with "reject if it contains DROP/UNION" denylists — that's the bug class they replaced.

5. **WHERE is assembled, not concatenated inline.** `filter_parser()` (`trait.where.php`) collects only non-empty fragments then `implode`s with the logical operator — so a later filter item that resolves empty can't leave a dangling `AND`/`OR`. `$and`/`$or` map to plain joins; `$not`/`$nand`/`$nor` map to `NOT( … AND/OR … )`. Keep the collect-then-implode shape; never re-introduce per-iteration operator appending.

6. **Projects/ACL filters always reach `$sql_obj->where`.** `build_sql_projects_filter()` applies per-user project scoping for non-global-admins. Each branch (PROFILES/PROJECTS/USERS/default) must PUSH its fragment to `$this->sql_obj->where[]` (older code built a `$sql_filter` string with v6-style `'AND '` prefixes and never pushed it — a silent ACL hole). Build self-contained, explicitly-parenthesized fragments in `sql_obj` style; parameterize jsonb literals (`json_encode` does NOT escape single quotes, so never inline a json literal into a single-quoted SQL string). Tables in `search::$ar_tables_skip_projects` legitimately skip the filter.

7. **Multi-section UNION swaps only the FROM table.** `build_union_query()` builds one branch per matrix table. Each UNION branch is an independent alias scope, so every branch keeps the same main alias (`mix`) and only the main `FROM <table> AS mix` is swapped — via an **exact-string replace**, never a regex. A regex over generated SQL corrupts correlated subqueries (the `!!` duplicated operator emits `FROM <table> AS m2`). The outer `ORDER BY` strips the `mix.` qualifier because UNION result columns aren't alias-qualified.

8. **Mode subclasses share the builder; don't fork it.** `search_tm` (time-machine, `matrix_time_machine`, default order `id DESC`, flat `data` column instead of tipo-keyed JSONB) and `search_related` differ only in table shape / breakdown semantics. `search_related` currently re-implements SELECT/WHERE/ORDER and is the target of a planned realignment (see Roadmap). When fixing core search, check whether the fix also belongs in these two.

## SQO field cheat-sheet (`search_query_object`)

`section_tipo` (array; first is `main_section_tipo`, alias `mix` when >1) · `mode` · `filter` (Mango `{$and|$or:[…]}`, each leaf `{q, q_operator, path:[{section_tipo,component_tipo,model}], lang, format, q_split, …}`) · `select` · `order` (`[{direction, path}]`) · `limit`/`offset`/`total`/`full_count` · `group_by` · `filter_by_locators`(+`_op`) · `children_recursive` · `remove_distinct` (forced true for multi-section) · `skip_projects_filter` (server-only) · `breakdown` (search_related) · `tables` (search_related) · `parsed` (two-phase: base path defs → conformed component SQL).

## Per-component search traits

Each component model implements `resolve_query_object_sql(object $query_object): object|false` (late static binding via `$model::get_search_query`). The pipeline per trait: extract+normalize `q` → optional `q_split` into `$and` of terms → build a `ctx` (component_tipo, column via `section_record_data::get_column_name(get_called_class())`, table/alias, translatable, q_operator) → dispatch on operator (`!*` empty, `*` not-empty, `!=`, `==`, `-` not-contain, `!!` duplicated, `*x`/`x*`/`'x'` wildcard/literal, default contains) → a `resolve_*_sql` that sets `{sentence, params}`. Operators are recognized either from a leading token in `q` or from explicit `q_operator`.

**Shared scaffolding** lives in `core/component_common/trait.search_component_sql_builder.php` (`extract_normalized_q`, `split_search_terms`, `get_search_context`), `use`d by `search_component_string_common` and `search_component_iri`; `handle_query_splitting` is in `component_common`. The other families (`number`, `date`, `json`, `media_common`, `relation_common`, `section_id`, `relation_children`, `relation_index`) and every `_tm` twin still carry their own near-identical copies — that's the consolidation debt below, not a pattern to copy.

## Tests

`test/server/search/` (`search_Test.php`, `search_related_Test.php`, `search_tm_Test.php`) and `test/server/components/component_*_Search_Test.php` are **SQL-string tests — no live DB**: build an SQO, call `parse_sql_query()` (or a component's `resolve_query_object_sql`), assert on the generated SQL / params or `expectException` for rejected injection. Section `test65`/`matrix_test`, string component `test52`, iri `test140`. Run: `vendor/bin/phpunit -c test/server/phpunit.xml test/server/search/`. When you change generated SQL intentionally (e.g. parameterizing a `lang` filter), update the corresponding golden expectation in the component `*_Search_Test.php` data provider. Every security fix gets a regression test in the 570ca32e7 style (payload in → exception or payload-absent-from-SQL). Pre-existing `component_date`/`component_image`/`component_3d` failures in the broader suite are environmental (missing test data), not search regressions.

## Consolidation roadmap (in progress)

The audit hardened P0 (injection: lang + single-level component_tipo; ACL: `skip_projects_filter` strip + USERS-section filter restore; LIMIT clamp) and P1 (filter_parser dangling operators, union regex, positional params, children_recursive N+1 batch, user-records cache reset). **Deferred P2** — migrate the remaining per-component scaffolding and the `_tm` twins onto `trait.search_component_sql_builder` (table-shape strategy on `ctx` to kill the `if table==='matrix_time_machine'` forks), and realign `search_related` to populate `sql_obj` and reuse `filter_parser`/`parse_search_object_sql`/`build_limit_offset_sql`. Each family migration needs its own golden-SQL coverage (a wiring fatal in this path breaks ALL search), so land them as small per-family PRs, verifying SQL-identical output before/after. See plan `robust-jumping-crystal` and memory `search-architecture-sqo`.
