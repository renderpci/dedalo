---
description: Audit SQL execution sites (pg_query, mysqli_query, raw query builders) for SQL injection. PHP/Postgres focus. Run after /security-audit.
---

# SQLi Audit

Read `.windsurf/workflows/security-audit.md` first for the shared rubric.

## Inventory grep

```bash
rg -nB 1 'pg_query\(|pg_send_query\(|pg_query_params\(|mysqli_query\(|->query\(|->exec\(' \
   --type php -g '!lib/**' -g '!vendor/**' -g '!test/**' -g '!**/acc/**'
```

Plus internal abstractions:

```bash
rg -n '::exec_search\(|matrix_db_manager::|DBi::query|::SQL_update' \
   --type php -g '!lib/**' -g '!vendor/**' -g '!test/**'
```

## Per-site classification

| Pattern | Class |
|---|---|
| `pg_query_params($conn, $sql, [$id, $name])` | A |
| `pg_query($conn, "SELECT ... WHERE id = " . (int)$id)` | A |
| `pg_query($conn, "SELECT * FROM $matrix_table WHERE x = '$constant'")` | B if `$matrix_table` is an allowlisted ontology table; else C |
| `pg_query($conn, "SELECT * FROM x WHERE y = '" . $admin_form_value . "'")` | C |
| `pg_query($conn, "ORDER BY " . $rqo->order->column)` | **D** |
| `pg_query($conn, $sql)` where `$sql` was built via `json_encode` interpolation of a JSON key | **D** |

## Common D-class patterns

- **JSON keys interpolated as SQL operators.** `sqo->filter` JSON keys (e.g. `$AND`, `$OR`) end up as SQL operators inside `WHERE` clauses. Without an allowlist any string is concatenated. *(SEC-035.)*
- **`order->direction` / `order->column` / `order->component_tipo`** — order-by clauses concatenate user-supplied strings directly. *(SEC-036.)*
- **Identifier names** (`section_tipo`, table names) interpolated into FROM/JOIN clauses without `pg_escape_identifier`.
- **`update::SQL_update`-style helpers** that take a raw SQL string and run it. Any caller who concatenates user input becomes a D.

## Fix patterns

### 1. Parameterize values

```php
// before (D)
pg_query($conn, "SELECT * FROM x WHERE y = '$value'");

// after (A)
pg_query_params($conn, 'SELECT * FROM x WHERE y = $1', [$value]);
```

### 2. Allowlist operators

```php
$valid = ['AND','OR','NOT','NAND','NOR'];
if (!in_array($op, $valid, true)) {
    return ''; // log + abort
}
```

### 3. Allowlist column names with strict regex

```php
// User-supplied column field — strict identifier only.
if (!preg_match('/^[a-zA-Z_][a-zA-Z0-9_]*$/', $column)) {
    continue; // log + skip
}
```

### 4. Server-trusted SQL fragment escape hatch

When the framework needs to inject a complex pre-built SQL fragment (e.g. `jsonb_path_query_first(...)`):

- **Do NOT** widen the strict regex.
- **Split the field**: keep `column` strict-validated for HTTP-supplied SQO; add a sibling `column_sql` field that bypasses the regex but is set ONLY by server-side builders.
- Document in the consumer that HTTP-supplied SQO must not carry `column_sql`.
- Validate any tipo/id interpolated into the fragment at the builder. *(SEC-036 follow-up: see `core/component_relation_children/class.component_relation_children.php::build_children_sqo`.)*

### 5. `pg_escape_identifier` for table/column names

```php
$conn = DBi::_getConnection();
$safe_table = pg_escape_identifier($conn, $table);
pg_query($conn, "ALTER TABLE $safe_table ADD COLUMN ...");
```

## Common false positives

- `pg_query_params` calls — already parameterized.
- `(int)`-cast values — safe.
- Test fixtures inside `test/server/`.
- Hard-coded SQL with no variable interpolation.
- Identifier names from `section_record_data::$column_map` — server-internal allowlist.

## Threat-model recheck

Before flagging as D, trace the variable to its API entry point:

- Does `dd_manager` / API dispatcher pass it through `safe_xss_recursive` or any sanitizer? (Sanitizers strip XSS, **not** SQL — don't conflate.)
- Is there an upstream `safe_tipo()` / `trim_tipo()` validator?
- Is the value `(int)`-cast somewhere in the call chain?

## Dead-code helpers

`rg --type php "<helper>" -g '!test/**'` to verify zero callers. Common dead helpers in legacy codebases:

- `safe_table()` — naive `^[a-zA-Z_]+$` regex; rejects digits, never used.
- `consolidate_sequence` — abandoned.
- `build_sql_filter_by_locators_order` — superseded by `where`-clause sibling.
- `save_partial` / `delete_partial` — JSONB-path string-concat, dead.

Delete them with a `SEC-NNN` marker explaining safer reintroduction path (`pg_query_params` + ontology lookup).

## Verification

```bash
php -l <file>
vendor/bin/phpunit -c test/server/phpunit.xml test/server/search/ test/server/components/
```

Run a focused search test that exercises ORDER BY / WHERE filters before and after.

## Output

`security-audit/sqli-findings.md` with the standard structure (inventory → headline → fix log → per-site write-ups). Mirror SEC-NNN rows in `security-findings.md`.
