# Search configuration and access control

Dédalo search is driven by the [Search Query Object (SQO)](../core/sqo.md): a JSON query definition parsed into a single prepared PostgreSQL statement over the JSONB `matrix_*` tables. This page documents the **configuration constants** that affect search and the **access-control boundary** applied to queries that arrive from the HTTP API.

For the full query language (filter operators, paths, order, pagination, related/time-machine modes) see [Search Query Object](../core/sqo.md).

> The TS/Bun rewrite server ports this trust boundary (spec §7.5); the reference below is the PHP class this behavior was ported from — see the "TS port" callouts alongside each item.

## The trust boundary

There are two sources of SQOs and they are **not** equally trusted:

| Source | Trust | Gate |
| --- | --- | --- |
| **HTTP API** (client-built SQO inside the RQO) | untrusted | `search_query_object::sanitize_client_sqo()` |
| **Server-internal builders** (sections, autocompletes, portals, exports, …) | trusted | none — they construct a `search_query_object` and call `search` directly |

> `./core/common/class.search_query_object.php` — `sanitize_client_sqo()`
> `./core/api/v1/json/index.php` — the single call site for every API request
>
> **TS port**: `sanitizeClientSqo()` in [`src/core/concepts/sqo.ts`](../../src/core/concepts/sqo.ts), called once at the API boundary from `src/core/section/read.ts`. Same shape and behavior, ported function-for-function.

`sanitize_client_sqo()` runs once, at the API entry, before the SQO reaches the search pipeline. It:

1. **Strips server-only SQL fields** at any depth: `sentence`, `params`, `column_sql`, `table`, `table_alias`. These are server-built and always regenerated; a client must never inject them (they would reach raw SQL without going through the component conform pipeline).
2. **Strips access-control flags**: `skip_projects_filter`, `skip_duplicated`, `include_negative`. A client must never weaken its own access control (see [`skip_projects_filter`](../core/sqo.md#skip_projects_filter) — it is honored only when set server-side).
3. **Forces `parsed = false`** so a client can never skip the component conform pipeline and hand a pre-built filter straight to SQL building.
4. **Coerces and clamps pagination**: `offset`/`total` are cast to integers and `limit` is clamped to [`DEDALO_SEARCH_CLIENT_MAX_LIMIT`](#dedalo_search_client_max_limit).

Beyond the boundary, two further validations run for every SQO regardless of source, inside `search::conform_filter()`:

- **Identifier validation** — every `section_tipo`/`component_tipo` in a filter path is checked with `search::is_valid_tipo()` (`^[a-z]+[0-9]+$`) or `is_valid_data_column()` (for the pseudo-tipos `section_id`, `id`, `tipo`, `lang`, `type`, `section_tipo`). These values are interpolated verbatim as JSONB keys / jsonpath member steps and cannot be parameterized, so a malformed value throws.
- **Language validation** — a filter item `lang` is checked with `search::is_valid_lang()` (`^(lg-[a-z0-9_]+|all)$`) before it reaches a jsonpath/string literal.

> **TS port**: the same two checks are the identifier-validation chokepoint of [`src/core/search/identifier_gate.ts`](../../src/core/search/identifier_gate.ts) (`assertValidTipo`/`isValidDataColumn`, backed by `isValidTipo`/`isValidLang` in `src/core/concepts/ontology.ts`) — pure, allowlist-only, throw-not-repair, enforced from `src/core/search/conform.ts` before any SQL string is built (spec §7.6).

## Configuration constants

### DEDALO_SEARCH_CLIENT_MAX_LIMIT

> ./dedalo/config/config.php

`int` — default `1000`.

Ceiling applied to a **client-supplied** SQO `limit`. Untrusted clients cannot request unbounded result sets: the `all` sentinel, non-positive values and values above the ceiling are all clamped to this value. Server-internal search builders bypass the gate (`sanitize_client_sqo`), so they keep full access to `limit: 'all'` for exports, recursive children, count passes, etc.

```php
define('DEDALO_SEARCH_CLIENT_MAX_LIMIT', 1000);
```

Raise it if your front-end legitimately pages with larger windows; lower it to harden a public-facing installation.

**TS port**: the same ceiling is `CLIENT_MAX_LIMIT = 1000` in [`src/core/concepts/sqo.ts`](../../src/core/concepts/sqo.ts) — a plain module constant today, not yet wired to a `src/config/config.ts` env setting. To raise it in the TS server you currently have to edit the constant, not `.env`.

### DEDALO_FILTER_USER_RECORDS_BY_ID

> ./dedalo/config/config.php

`bool` — default `false`.

When `true`, search results are further restricted, per logged user, to the explicit set of record ids that user is permitted to see in a section. The allowed ids come from `component_filter_records::get_user_filter_records()` and are applied as an additional `section_id IN (…)` restriction in the `WHERE` clause (see `search::build_filter_by_user_records()`). The per-user id set is cached for the request and reset by `common::clear()`.

```php
define('DEDALO_FILTER_USER_RECORDS_BY_ID', false);
```

This is an **opt-in, record-level** restriction layered on top of the always-on project filter described below. Leave it `false` unless your installation assigns record-level permissions.

**Not yet ported**: no TS equivalent exists — `src/core/search/` has no per-user record-id restriction today. Check [STATUS.md](../../rewrite/STATUS.md) before relying on this against the TS server.

## How search restricts records (overview)

For non global-admin users, `search::build_sql_projects_filter()` always adds a project-scope restriction to the `WHERE` clause, branching by section:

- **Users section** (`DEDALO_SECTION_USERS_TIPO`): a non-admin sees only users they created **or** users sharing at least one of their projects, and never the root/negative records (`section_id > 0`).
- **Default sections**: results are restricted to records belonging to any of the user's projects (`component_filter` / `component_filter_master`).
- Tables in `search::$ar_tables_skip_projects` (e.g. `matrix_list`, `matrix_dd`, common value lists) are exempt so shared/transversal data stays reachable.

Global administrators and the root user are not filtered. `skip_projects_filter` can disable the filter, but — as noted above — that flag is **stripped from client SQOs** and is therefore only usable by server-internal callers (e.g. to read common value lists).

**TS port**: the per-section, per-record project filter is `buildProjectsFilter()` in [`src/core/search/sql_assembler.ts`](../../src/core/search/sql_assembler.ts) — same `EXISTS (… item->>'section_id' IN (…))` shape over the section's `component_filter` relation, skipped for global admins/internal searches (no `principal`) and honoring a server-set `skip_projects_filter`. The users-section branch and the `DEDALO_FILTER_USER_RECORDS_BY_ID` opt-in restriction are not yet ported; multi-section searches for a non-admin principal currently **refuse** rather than risk leaking an ungated union (see the source for the exact conditions).

## Related

- [Search Query Object (SQO)](../core/sqo.md) — the full query language.
- [Areas configuration](./config_areas.md) — area-level access (a coarser grant than the project filter).
