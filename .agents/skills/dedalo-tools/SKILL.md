---
name: dedalo-tools
description: Architecture and conventions of the Dédalo v7 tools subsystem (post tools_architecture refactor). Use when creating a tool, or modifying code under tools/, core/api/v1/common/class.dd_tools_api.php, common::get_tools(), tools registration, or tool caches — covers the tool_paths multi-root rule, tool_security/API_ACTIONS enforcement, tool_ontology_map constants, the v7 register.json format, cache invalidation, lifecycle hooks, and the get_tools parity snapshot.
---

# Dédalo v7 tools conventions

Tools are isolated server PHP + client JS blocks extending components, sections and areas. The subsystem was rebuilt on the `tools_architecture` branch (June 2026): hardened dispatch, declarative security, hand-authorable registration, multi-root loading. These are the non-negotiable rules and the architecture map.

## Hard rules

1. **Never hardcode tool dd-tipos.** Every component tipo of the tool registry record (dd1326 name, dd1327 version, dd999 config, dd1633 default config, dd1335 properties, dd1372 labels, dd1334 ontology, dd1330 affected models, dd1350 affected tipos, dd1354 active, ...) is declared once in `tools/tool_common/class.tool_ontology_map.php`. Use the constants (`tool_ontology_map::TOOL_NAME`, `::CONFIG`, ...). Section tipos stay the core defines (`DEDALO_REGISTER_TOOLS_SECTION_TIPO` = dd1324 registry, `DEDALO_TOOLS_CONFIGURATION_SECTION_TIPO` = dd996 install config, dd1340 authoring).

2. **Never build tool paths or URLs from `DEDALO_TOOLS_PATH`/`DEDALO_TOOLS_URL` directly.** All resolution goes through `tool_paths` (tools/tool_common/class.tool_paths.php): `get_tool_class_file()`, `get_tool_url()`, `get_roots()`. Tools may live in extra roots via `DEDALO_ADDITIONAL_TOOLS` config (`[['path'=>..., 'url'=>...]]`); the in-repo root is always index 0 and wins name collisions (collisions are reported in the import report, never silent). Urls must be same-origin root-relative (`/custom_tools`) — cross-origin urls are refused at load because the browser `import()`s tool JS from them. Confinement consumers that MUST stay in lockstep (all enumerate `tool_paths::get_roots()`): `class.loader.php` autoload + `$ok_roots`, `dd_tools_api` dispatch realpath confinement, `process_runner.php` background include confinement. Prefix checks always use `root . DIRECTORY_SEPARATOR`; include the realpath-validated canonical path, not the raw one (TOCTOU).

3. **`API_ACTIONS` is enforced by default (SEC-024).** A tool class without the constant is refused at dispatch (`TOOLS_REQUIRE_API_ACTIONS` defaults true; `false` is a deprecated migration escape hatch). Prefer the **map form** — the framework (`tool_security::resolve_action` + `assert_action_permission`, called from `dd_tools_api::tool_request`) runs the gate BEFORE the method and BEFORE the background fork:
   ```php
   public const API_ACTIONS = [
       'read_x'  => ['permission' => 'tipo',   'min_level' => 1],
       'write_x' => ['permission' => 'record', 'min_level' => 2], // record = section perm + assert_record_in_user_scope
       'admin_x' => ['permission' => 'developer'],
       'status'  => null // listed, gate inside the method
   ];
   ```
   Field mapping: `section` → `options->section_tipo`; `tipo` → `section_tipo` + (`tipo` ?? `component_tipo`); `record` → `section_tipo` + numeric `section_id`. Missing/ill-typed fields FAIL CLOSED with `permission_exception` → dd_manager returns `permissions_denied`. Method signature contract (SEC-084): `public static`, single `object $options` param (or none), returns `{result, msg, errors}`.

4. **Never list lifecycle hooks in `API_ACTIONS`.** `is_available(object $context): bool` (availability, called by `common::get_tools()`), `on_register(): void` and `on_remove(): void` (called by `tools_register`) are framework hooks, not remote API. Listing them would expose them to dispatch.

5. **Core must not special-case tools.** Per-tool availability rules live in the tool class as `is_available($context)` (`$context` = `{caller_model, called_class, is_component, tipo, section_tipo, mode}`; must be fast and side-effect-free — results cached per user/tipo/section_tipo). Examples: `tool_diffusion` (sections with diffusion definition only), `tool_time_machine` (skip `component_relation_children`). The ONLY tool rule left in core is the dd15 case (only `tool_export` on the time machine section) — element-centric policy, keep it there.

6. **`get_tools()` parity snapshot.** `test/server/contract/snapshots/get_tools_parity.json` asserts byte-identical `get_tools()` output (test/server/tools/get_tools_availability_Test.php). Regenerate ONLY when availability semantics intentionally change, on the wanted baseline commit.

7. **Cache invalidation has ONE entry point**: `tools_register::invalidate_all_tool_caches()` (`clean_cache()` is its alias). It clears tool_common statics (`reset_static_caches`), tools_register config-list statics, `common::$cache_get_tools` + `$cache_buttons_tools`, the three shared file caches and the per-user `{entity}_{user_id}_cache_user_tools.php` files. Every write path must call it; `section_record::save_event` already covers dd1324, dd996 AND dd234 (profile edits change per-user tool authorization). Never add a method-local `static $cache` to tools_register/tool_common — use a resettable class property.

8. **register.json: v7 authoring format for new tools.** Hand-written flat keys (`name`, `version`, `label`, ...) validated by `tools/tool_common/register.schema.json` (editor) and `tools_register::validate_register()` (runtime, runs on the CONVERTED column-keyed object so it covers v6 too). The 32 legacy v6 files (raw `components`/`relations` dumps) stay and are auto-converted — do NOT mass-convert them. `tool_dev_template/register.json` is the v7 exemplar. Detection in `process_tool_directory`: `components` key → v6 converter; `name` key → authoring converter; column-keyed → pass-through.

9. **Config resolution**: `tool_common::get_config_value($tool, $key, $default)` resolves PER KEY dd996 install config → dd1633 register defaults → `$default`. `get_config()` (wholesale fallback) stays for full-array callers. Only properties flagged `"client": true` reach the browser — and everything so flagged WILL reach it; never flag secrets.

10. **Registration is fail-closed.** `tools_register::import_tools()` refuses (with import-report errors, never silently): invalid register.json, name≠directory or bad pattern (`^tool_[a-z0-9_]+$`), class missing/not loading/not extending `tool_common` (load is try/catch-guarded — a tool requiring a missing vendor lib must not abort the whole import), `dedalo_version_min` > `DEDALO_VERSION` (strip `.dev` before `version_compare`), duplicate ontology tipos after renumeration. Missing `API_ACTIONS` = warning at registration, refusal at dispatch.

## Architecture map

- **Dispatch gate chain** (`dd_tools_api::tool_request`, core/api/v1/common/class.dd_tools_api.php), in order: registry whitelist (dd1324) → per-user profile authorization (`tool_common::get_user_tools`; `always_active` bypasses) → multi-root realpath confinement → `API_ACTIONS` (fail-fast) → reflection signature checks → declarative permission gate → direct `call_user_func` OR CLI background (`exec_::request_cli` → `process_runner.php`, which re-checks the `BACKGROUND_RUNNABLE` class constant but NOT the per-action gate — long-running write methods keep imperative asserts as defense in depth).
- **Registration flow** (`tools_register::import_tools`): multi-root scan (`get_valid_tool_directories`, first-root-wins + collision report) → `process_tool_directory` (decode → format detect/convert → `validate_register` → class contract checks → min-version → ontology renumeration + duplicate check) → `update_tool_registry_sections` (upsert dd1324 record → `on_register()` hook) → `cleanup_removed_tools` (`on_remove()` best-effort → delete record) → `invalidate_all_tool_caches`.
- **Client lifecycle** (tools/tool_common/js/tool_common.js): tool buttons from element context (`common::get_tools()` filters by affected_models/affected_tipos then `is_available`) → `open_tool()` → modal (CSS awaited; errors rendered visibly via `content_data_error`) or window (LZString-compressed caller in URL, `/core/page/?tool=...`) → `init` (super first; fallback ddo_map from caller) → `build` (CSS + ddo_map → `ar_instances`; `"section_id": "self"` = caller record) → `render` → `edit()`/`list()` returning a wrapper with `tool_header`. Wiring: `wire_tool(ctor, render_module)`. Server calls: `this.tool_request({action, options, background, url})`. Labels: `get_tool_label(name)` with current→default→any lang fallback. Asset URLs resolve per tool: `tool_base_url(model)` util / `DEDALO_TOOLS_URLS` global map (additional-root tools only); `instances.js` inlines the check (circular import).
- **Scaffolding**: `php tools/tool_common/cli/create_tool.php --name=tool_x --label="X" [--models=a,b] [--path=/abs/root] [--register]` — copies `tool_dev_template` (the production-shaped reference: map-form gates, BACKGROUND_RUNNABLE demo, confined upload handling), renames identifiers, writes minimal v7 register.json. `--register` boots config FIRST (session bootstrap warns after any output) and forges a CLI superuser session (`$_SESSION['dedalo']['auth'] = [user_id=>DEDALO_SUPERUSER, username, is_logged=>1, salt_secure]`) — shell access = installer trust model.
- **Docs** (keep in sync): docs/development/tools/{creating_tools, server_contract, js_lifecycle, register_json, security, architecture_audit}.md.

## Testing

- Suite: `cd test/server && ../../vendor/bin/phpunit --testsuite tools` (full Dédalo boot + PostgreSQL; `BaseTestCase` forces superuser TEST_USER_ID with permissions on `test3`/`oh1`/`rsc197`). Reference tool test to copy: `test/server/tools/tool_dev_template_Test.php` (register validation + API_ACTIONS resolution + direct action call). Registration-checks fixtures pattern: disposable dirs under `sys_get_temp_dir()` + `PHPUnitUtil::callMethod` for private methods.
- The v6-corpus test (`tools_register_validate_Test.php::test_v6_corpus_passes_validation`) guards the validation gate against breaking existing tools.
- PHPStan analyzes `core/api` — constants reached from there (e.g. via tool_paths) must exist in `phpstan-bootstrap.php`.

## Known pitfalls

- **`unset()` on a declared `common` property re-routes later access through `common::__get/__set`, which SWALLOW undeclared names.** To clear a per-instance memo like `$element->tools` in tests, assign `null` (isset(null) is false), never `unset()`.
- `section::get_instance(string $tipo, string $mode='list', ...)` takes NO section_id.
- Tool registry data: booleans are dd64 locators (section_id '1'=yes, '2'=no); affected models are dd1342 locators (resolve names via `tools_register::resolve_affected_model_locators`); strings `[{value, id, lang}]`; json components `[{value, id}]` in the `misc` column; per-tipo `meta` counters `[{count}]`.
- `get_user_tools()` must clone registry objects AND write the clone back (a loop-variable-only clone silently drops `tool_config` — fixed regression, guarded by `tool_caches_Test`).
- `/tmp` is a forbidden additional root (`root_is_forbidden`): use a non-tmp fixture dir when testing multi-root.
