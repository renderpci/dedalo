---
description: Audit IDOR / authorization gates on API dispatchers, per-record access, and dispatch allowlists. Use when reviewing access control on REST/RPC handlers.
---

# IDOR / Authorization Audit

Read `.windsurf/workflows/security-audit.md` first for the shared rubric.

## Surface inventory

Three things to audit:

1. **API dispatcher allowlist** — does each dispatch class declare an `API_ACTIONS` (or equivalent) constant restricting which methods are remotely callable?
2. **Per-action permission gate** — does each action `assert_*` permission on the *operated* tipo, at the right level (≥1 read / ≥2 write / ≥3 admin)?
3. **Cross-record access** — for actions that take `section_tipo`/`section_id`/`tipo`, does the gate run against the user-supplied target (not just the claimed source)?

## Inventory grep

```bash
# Dispatcher allowlist coverage
rg -nB 2 'API_ACTIONS|public static function' --type php \
   <api dispatcher dir> -g '!test/**'

# Permission-check helper usage
rg -n 'assert_section_permission|assert_tipo_permission|get_permissions|is_global_admin|is_logged' \
   --type php -g '!test/**' -g '!vendor/**'

# Per-action methods (per dispatcher)
rg -nA 5 'public static function .*\(object \$rqo\)' <api dir>
```

## Per-action classification

| Pattern | Class |
|---|---|
| `assert_section_permission($section_tipo, 2, __METHOD__)` at top + `API_ACTIONS` includes the method | A |
| Permission check exists but **after** the SQL ran (post-hoc) | B |
| Action has no gate; only reachable by superuser via area-level check at dispatcher | C |
| Action has no gate; reachable by any logged user | **D** |
| Permission check trusts a user-supplied flag (`source.config.read_only=true`) | **D** |
| Permission check uses the claimed source tipo, not the operated tipo | **D** |

## Common D-class patterns

- **Post-hoc permission check.** Code runs the SQL, builds the response, then zeroes out `data` if no permission. The SQL plan and metadata still leak.
- **User-controlled `read_only` flag.** Code reads `$rqo->source->config->read_only` and skips permission checks when true. Replace with a server-side static.
- **Dispatch fall-through.** If the dispatch class has no `API_ACTIONS` constant, every public-static method is callable. Internal helpers (`get_file_constants`, `set_maintenance_mode`) become remote endpoints.
- **`$user_id` parameter trust.** `processes::stop($pid, $user_id)` checks ownership against the *parameter*. Caller passes `-1` (superuser) and bypasses. Always gate on the **logged session**, not parameters.
- **Direct-by-id mutating actions** (time-machine apply/revert, media-versions, image rotation) that take a `section_id` but only check schema-level permission on the type. User with type-write can touch any record in that type — add a per-record `filter_by_projects` check.

## Fix patterns

### 1. Declare `API_ACTIONS` allowlist

```php
final class dd_some_api {
    public const API_ACTIONS = [
        'read_thing',
        'save_thing',
    ];
    // every other public static is now NOT remotely callable
}
```

The dispatcher (`dd_manager` or equivalent) must check:

```php
if (defined($class_name . '::API_ACTIONS')) {
    $allowed = constant($class_name . '::API_ACTIONS');
    if (!in_array($method, $allowed, true)) {
        return permissions_error_response();
    }
}
```

### 2. Pre-hoc permission gate with helper

```php
public static function read_thing(object $rqo) : object {
    security::assert_section_permission(
        $rqo->source->section_tipo,
        1, // read level
        __METHOD__
    );
    // proceed
}
```

The `assert_*` helper throws a typed exception (`permission_exception`) that the dispatcher catches and returns as a uniform error response.

### 3. Iterate over arrays

If the action accepts `sqo->section_tipo[]` or `data->locators[]`, iterate and `assert_*` on each element. One slip and the entire query becomes a privilege escalation.

### 4. CLI surface (background dispatch)

If your codebase has a `request_cli` / `process_runner` pattern, audit that too:

- It must preserve the parent session (`session_id($parent_id); session_start();`).
- It must wrap dispatch in `try { … } catch (permission_exception $e) { return uniform_error; }` — otherwise a fatal-error trace leaks onto the SSE/poll pipe.
- Add a `BACKGROUND_RUNNABLE` constant analogous to `API_ACTIONS` so background-spawned methods are also opt-in.

### 5. Per-record gate

For mutating actions taking a `section_id`:

```php
$user_projects = security::get_filter_by_projects($logged_user_id);
if (!in_array($section_id, $user_projects, true) && !is_global_admin($logged_user_id)) {
    throw new permission_exception(...);
}
```

## Trust-boundary mistakes to flag

- **`$rqo->source->config->*`** — anything under `config.*` is HTTP-supplied. Never trust as a permission flag.
- **`$options->user_id`** in CLI / `dd_utils_api` — never trust; use `logged_user_id()` from the session.
- **`$rqo->options->skip_permissions`** — should not exist. If found, delete the field and any check that honors it.
- **Server-resolved vs. user-supplied tipo** — when both are present (`source.section_tipo` AND `source.path[].section_tipo`), assert on every one, not just the resolved one.

## Tool / Plugin layer

Many CMS-like systems have a "tool" layer with its own dispatch. Audit:

- **Tool list filter** — `tool_request` must intersect against `tool_common::get_user_tools($logged_user_id)`.
- **Tool method allowlist** — each tool class should declare `API_ACTIONS` listing only rqo-shaped methods. Empty array = UI-only tool, default-deny.
- **Per-method semantic gate** — even after dispatch is locked down, each tool action needs its own `assert_*` based on what data it touches.

## Reflection / dispatch escape hatches

Watch for `class_request` / `widget_request` patterns that take a `class_name` + `method` from the request body:

- Class name **must** come from a server allowlist of widget IDs or be hard-coded.
- Method name **must** appear in the target class's `API_ACTIONS` (introduce the gate at the dispatcher).

This is the SEC-044 pattern — without the gate, an authenticated maintenance user can invoke any public static method on the maintenance class (e.g. `set_maintenance_mode`, `restore_dd_ontology_recovery_from_file`).

## Verification

```bash
vendor/bin/phpunit -c test/server/phpunit.xml \
   <relevant api/area test files>
```

If you add a permission gate, expect tests that omit `$this->user_login()` to start erroring. Fix the tests (don't loosen the gate).

## Threat-model recheck

- Pre-auth surface (`/install/`, `/login.php`) — these intentionally have no logged user. Document which endpoints are pre-auth and what they expose.
- Activity / audit log endpoints — should be admin-only; double-check.
- Diffusion / publication APIs that use a shared `code` token — replace with per-user auth before calling them "fixed".

## Output

`security-audit/idor-findings.md` with the standard structure. Mirror SEC-NNN rows in `security-findings.md`. Track open follow-ups (per-widget rollouts, deferred per-record gates) in the closure section.
