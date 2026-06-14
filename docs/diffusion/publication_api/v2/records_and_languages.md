# Records and languages

How the Publication API v2 identifies records by `section_id`, returns multilingual values as one row per language, and introspects table schemas.

## The data model

A **record** is identified by its `section_id`. Multilingual values are not nested inside a single row; instead they are stored as **one row per language**, all sharing the same `section_id`. The language of each row lives in a `lang` column whose values use the `lg-xxx` format (for example `lg-eng`, `lg-spa`).

```text
section_id | lang   | code   | title
-----------+--------+--------+----------------------------
1          | lg-eng | OH-001 | Interview with María
1          | lg-spa | OH-001 | Entrevista con María
```

Not every published table is multilingual. Thesaurus tables (the `ts_*` tables) and other reference tables have **no `lang` column**. Endpoints detect this at runtime (`tableHasColumn(db, table, 'lang')`) and adapt their behaviour accordingly.

!!! info "section_id vs. row id"
    `section_id` is the stable, public identifier you address records by. The path parameter on `GET .../records/{id}` is the `section_id`, validated as a positive integer (`z.coerce.number().int().positive()`). It is not the underlying auto-increment row `id`.

## Getting a single record

```text
GET /{db}/tables/{table}/records/{id}
```

By default this returns **all language variants** of the record as an array, ordered by `lang` ascending.

```bash
curl "http://localhost:3100/publication/server_api/v2/dedalo_web/tables/interview/records/1"
```

```json
{
  "data": [
    { "section_id": 1, "lang": "lg-eng", "code": "OH-001", "title": "Interview with María" },
    { "section_id": 1, "lang": "lg-spa", "code": "OH-001", "title": "Entrevista con María" }
  ],
  "meta": {
    "section_id": 1,
    "languages": ["lg-eng", "lg-spa"]
  }
}
```

!!! note "`data` is always an array"
    Even for a single-language result, `data` is an array. Each element is one language variant. Do not assume `data` is an object.

### Narrowing to one language

Pass `?lang=lg-xxx` to return only that variant. The value must match the pattern `^lg-[a-z]{2,5}$`.

```bash
curl "http://localhost:3100/publication/server_api/v2/dedalo_web/tables/interview/records/1?lang=lg-eng"
```

```json
{
  "data": [
    { "section_id": 1, "lang": "lg-eng", "code": "OH-001", "title": "Interview with María" }
  ],
  "meta": {
    "section_id": 1,
    "languages": ["lg-eng"]
  }
}
```

When `lang` narrows the response, the server also sets a `Content-Language` response header echoing the value:

```text
Content-Language: lg-eng
```

!!! tip "Keep `lang` selectable when projecting fields"
    If you combine `fields=` with a multilingual table, the server automatically adds `lang` to the selection (when the table has a `lang` column) so variants stay identifiable, even if you did not list it. For example `?fields=section_id,title` still returns `lang` on each row.

### Tables without a `lang` column

Thesaurus and other non-multilingual tables reject the `lang` parameter with a `400 Validation Error`:

```bash
curl "http://localhost:3100/publication/server_api/v2/dedalo_web/tables/ts_themes/records/1?lang=lg-eng"
```

```json
{
  "type": "https://dedalo.dev/api/problems/validation-error",
  "title": "Validation Error",
  "status": 400,
  "detail": "Table \"ts_themes\" has no \"lang\" column; the lang parameter is not supported",
  "instance": "/dedalo_web/tables/ts_themes/records/1?lang=lg-eng"
}
```

For these tables `meta.languages` is **omitted** entirely (it appears only when the table has a `lang` column):

```bash
curl "http://localhost:3100/publication/server_api/v2/dedalo_web/tables/ts_themes/records/1"
```

```json
{
  "data": [
    { "term_id": "ts1", "term": "Civil war", "indexation": "ts1" }
  ],
  "meta": {
    "section_id": 1
  }
}
```

### Record not found

A missing record (or a missing variant when `lang` is given) returns `404` with an `application/problem+json` body. The `lang` is included in the detail when it was part of the request:

```json
{
  "type": "https://dedalo.dev/api/problems/not-found",
  "title": "Not Found",
  "status": 404,
  "detail": "Record not found: interview/9999 (lang: lg-eng)",
  "instance": "/dedalo_web/tables/interview/records/9999?lang=lg-eng"
}
```

### Single-record query parameters

`GET .../records/{id}` accepts only the following query parameters (no `limit`, `offset`, `sort` or `count`):

| Parameter | Format | Notes |
|---|---|---|
| `fields` | comma-separated columns | Trimmed; empty entries dropped. `lang` is re-added automatically on multilingual tables. |
| `lang` | `^lg-[a-z]{2,5}$` | Rejected on tables without a `lang` column. |
| `resolve_relations` | JSON string or `"auto"` | Forward relation resolution (see [Querying](querying.md)). |
| `resolve_inverse_relations` | `true` or JSON object | Resolves the `dd_relations` column (see [Querying](querying.md)). |

## Listing records

```text
GET /{db}/tables/{table}/records
```

The list endpoint returns the paginated list envelope. With a multilingual table and no `lang` filter, every language variant is a separate row in `data` (each row counts toward `limit`). Add `?lang=lg-xxx` to restrict to one language.

```bash
curl "http://localhost:3100/publication/server_api/v2/dedalo_web/tables/interview/records?lang=lg-eng&limit=2&count=true"
```

```json
{
  "data": [
    { "section_id": 1, "lang": "lg-eng", "code": "OH-001", "title": "Interview with María" },
    { "section_id": 2, "lang": "lg-eng", "code": "OH-002", "title": "Interview with José" }
  ],
  "pagination": { "limit": 2, "offset": 0, "total": 142 }
}
```

!!! note "`pagination` vs. `meta`"
    The **list** envelope is `{ data, pagination, meta? }`: the page window lives in `pagination` (`limit`, `offset`, and `total` only when `count=true`). The **single-record** envelope is `{ data, meta }`: it has no `pagination`, and its `meta` carries `section_id` plus (on multilingual tables) `languages`.

Filtering, sorting, field selection, pagination and relation resolution for the list endpoint are documented in [Querying](querying.md). For the full route list see [Endpoints](endpoints.md).

## Table schema introspection

Schemas are read live from `INFORMATION_SCHEMA` and cached in-process for ~30 seconds (a TTL cache per database / per table).

### List tables

```text
GET /{db}/tables
```

Returns the database's tables with row and column counts. Row counts come from `INFORMATION_SCHEMA.TABLES.TABLE_ROWS` (an estimate for some storage engines), and `column_count` is the length of the introspected column list.

```bash
curl "http://localhost:3100/publication/server_api/v2/dedalo_web/tables"
```

```json
{
  "data": [
    { "name": "interview",   "row_count": 142, "column_count": 12 },
    { "name": "audiovisual", "row_count": 142, "column_count": 8 }
  ]
}
```

### Get one table's schema

```text
GET /{db}/tables/{table}
```

Returns the table name, an **exact** row count (`SELECT COUNT(*)`), and the ordered list of columns with their SQL `DATA_TYPE`.

```bash
curl "http://localhost:3100/publication/server_api/v2/dedalo_web/tables/interview"
```

```json
{
  "data": {
    "name": "interview",
    "row_count": 142,
    "columns": [
      { "name": "section_id",    "type": "int" },
      { "name": "lang",          "type": "varchar" },
      { "name": "code",          "type": "varchar" },
      { "name": "title",         "type": "varchar" },
      { "name": "transcription", "type": "longtext" }
    ]
  }
}
```

!!! note "Two count sources"
    `GET /{db}/tables` reports `row_count` from the `TABLE_ROWS` estimate (fast, cached), while `GET /{db}/tables/{table}` reports an exact `COUNT(*)`. The list view also reduces columns to a `column_count`; the single-table view returns the full `columns` array.

To detect whether a table is multilingual before querying, look for a column named `lang` in this schema — that is exactly the check the record endpoints perform internally.

```bash
# Multilingual? -> a "lang" column is present in the schema
curl -s "http://localhost:3100/publication/server_api/v2/dedalo_web/tables/interview" \
  | grep -o '"name": *"lang"'
```

An unknown table returns `404` (`NotFoundError`); a syntactically invalid table name (it must match `^[A-Za-z_][A-Za-z0-9_]*$`) is rejected before any query runs.

## Field and envelope summary

| Field | Where | Meaning |
|---|---|---|
| `section_id` | row + `meta.section_id` | Public record identifier; same across language variants. |
| `lang` | row | Language of the variant, `lg-xxx`; absent on non-multilingual tables. |
| `data` | list & single | Always an array of row objects. |
| `pagination.limit` / `.offset` | list only | Page window (defaults 100 / 0). |
| `pagination.total` | list only | Present only when `count=true`. |
| `meta.section_id` | single only | Echoes the requested id. |
| `meta.languages` | single only | Available variants; present only when the table has a `lang` column. |
| `meta.response_time_ms` | all JSON success | Total server processing time in ms (also in the `X-Response-Time` header); excluded from `ETag`. |

## Related

- [Endpoints](endpoints.md) — full route reference.
- [Querying](querying.md) — filters, sorting, field selection, pagination, relation resolution.
- [HTTP semantics](http_semantics.md) — Problem Details errors, ETag/304 caching, `Link` pagination, headers.
- [Publication API v2](../index.md) — version landing page.
