# Tools architecture audit & improvement roadmap

!!! info "Scope and status"
    Internal architecture review of the Dédalo v7 tools subsystem (June 2026). Goal: assess the current design and propose a prioritized roadmap to strengthen it and make tool creation by **external developers** dramatically easier.

!!! success "Implementation status (June 2026, branch `tools_architecture`)"
    The full roadmap below has been **implemented**: A1 (`tool_ontology_map` constants), A2 (v7 register.json + schema + validator), A3 (registration-time checks), A4+A5 (`API_ACTIONS` enforced by default + declarative gates via `tool_security`), B1 (hand-authorable register.json), B2 (production-shaped `tool_dev_template`), B3 (CLI scaffolder `create_tool.php`), B4 (docs: creating_tools, server_contract, js_lifecycle, register_json, security), C1 (`is_available()` delegation, parity-snapshot proven), C2 (JS `tool_request`/`wire_tool`, CSS race fix, error surfacing), C3 (cache orchestrator `invalidate_all_tool_caches` + `get_config_value`), C4 (`DEDALO_ADDITIONAL_TOOLS` multi-root, security-reviewed), C5 (`on_register`/`on_remove` hooks). Deviations from the plan: the two-phase API_ACTIONS deprecation was skipped (default strict immediately — all in-repo tools already declared the constant); the v6 register.json corpus was kept as-is (only `tool_dev_template` ships the v7 exemplar); the "Download register file" UI flow referenced by the old docs did not exist in v7 and was dropped in favor of the scaffolder. The sections below are preserved as the original audit for context.

## 1. Executive summary

The tools subsystem is production-grade and consistent with the Dédalo way: all tool state lives in ontology sections (`dd1324` registered tools, `dd996` instance configuration, `dd1340` authoring), there are no bespoke tables, no build step, and no runtime composer dependencies. The API dispatcher applies a serious layered security chain (SEC-024 / SEC-069 / SEC-083 / SEC-084), caching is thorough (static + per-user file caches), and the directory convention (`class.tool_x.php`, `js/index.js`, `css/tool_x.css`, `img/icon.svg`, `register.json`) is clean and predictable.

Its main weakness is that it is **insider-oriented**. The contracts that make a tool work — the PHP method signature, the `API_ACTIONS` allowlist, the per-method security gates, the JS `init → build → render` lifecycle, the `ddo_map` resolution, the `register.json` field meanings — are implicit, scattered, or only discoverable by reading `tool_common` source and imitating existing tools. Security is opt-in where it should be default. Core code special-cases specific tools. Tools cannot live outside the repository checkout.

**Top-line recommendation:** in three phases, (1) harden the contracts that already exist — constants, validation, enforced allowlists, declarative security; (2) invest in developer experience — hand-authorable `register.json`, a production-shaped template, a CLI scaffolder, and real documentation; (3) strengthen the architecture — invert the core→tool coupling, unify config semantics, and (last, behind a security review) support out-of-repo tools. Every step is additive: the 36 existing tools keep working unmodified throughout.

## 2. Architecture overview (as-is)

### 2.1 Components

| Piece | File | Responsibility |
| --- | --- | --- |
| Server base class | `tools/tool_common/class.tool_common.php` (1260 lines) | Context building (`get_structure_context()` :143, `create_tool_simple_context()` :374), config resolution (`get_config()` :730), per-user authorization + caching (`get_user_tools()` :1023) |
| Registration | `tools/tool_common/class.tools_register.php` (1058 lines) | Filesystem discovery, `register.json` parsing, ontology renumeration, persistence to `dd1324`, cache invalidation |
| API dispatcher | `core/api/v1/common/class.dd_tools_api.php` (338 lines) | Actions `user_tools` and `tool_request`; the security gate chain |
| Component→tool matching | `core/common/class.common.php::get_tools()` (:3428) | Decides which tools appear on a component/section context |
| Client base | `tools/tool_common/js/tool_common.js` (1043 lines) | `init` (:55) → `build` (:263) → `render` lifecycle; `open_tool()` (:567), modal (:663) and window (:863) launch paths; label resolution (:1002) |
| Authoring UI | Section `dd1340` (Tools development) + Maintenance widget `core/area_maintenance/widgets/register_tools/` | Create/download `register.json`, trigger registration |
| Template | `tools/tool_dev_template/` | Commented example (development-only, intentionally unsafe placeholders) |
| Docs | `docs/development/tools/creating_tools.md` | Naming, file layout, UI-based registration steps |

### 2.2 Registration lifecycle

```text
Maintenance UI "Register tools"
  → tools_register::import_tools()                 (class.tools_register.php:126)
    → get_valid_tool_directories()                 (:193)  scan DEDALO_TOOLS_PATH for tool_* dirs
    → process_tool_directory()                     (:233)  read register.json
        → convert_register_v6_to_v7()              (:1029) legacy format auto-migration
        → renumerate ontology term ids (tool TLD)
    → update_tool_registry_sections()              (:325)  upsert section records in dd1324
    → cleanup_removed_tools()                      (:429)  delete records for tools gone from disk
    → clean_cache()                                (:952)  static caches + per-user file caches
```

### 2.3 Runtime server lifecycle (`tool_request`)

`dd_tools_api::tool_request()` applies, in order:

1. **Registered-tool whitelist** — tool name must exist in `tool_common::get_all_registered_tools()` (`class.dd_tools_api.php:136`).
2. **Per-user authorization** — tool must be in `tool_common::get_user_tools(logged_user_id())` (:150), which filters by the user's tools profile (always-active tools bypass).
3. **Path confinement** — `class.{tool}.php` must resolve via `realpath()` under `DEDALO_TOOLS_PATH` (SEC-069 / SEC-084, :164–182).
4. **Reflection checks** — method must exist, be `public static`, and accept either no parameters or a single `object`/class parameter (:200–268).
5. **`API_ACTIONS` allowlist — only if the tool declares it** (:276). Absent the constant, every method passing check 4 is callable.
6. **Execution** — direct `call_user_func`, or CLI fork via `exec_::request_cli()` when `background_running === true` (:293).

Per-method authorization (`security::assert_tipo_permission()`, `security::assert_record_in_user_scope()`) is the **tool author's responsibility** inside each method body — the framework does not enforce it.

### 2.4 Runtime client lifecycle

1. During context building, `common::get_tools()` (`class.common.php:3428`) filters the user's tools by `affected_models` / `affected_tipos` and attaches tool contexts to the element's JSON.
2. `ui.add_tools()` builds tool buttons (component inline buttons or section toolbar buttons) and binds `open_tool()`.
3. `open_tool()` (`tool_common.js:567`) instantiates the tool and routes to `view_modal()` (:663) or `view_window()` (:863 — caller serialized with LZString into the URL).
4. `build()` (:263) loads the tool CSS and resolves `tool_config.ddo_map` entries into live component instances (`section_id: "self"` is substituted with the caller's record).
5. `render()` delegates to the tool's `edit()` / `list()` method (from `render_tool_x.js`), which must return a wrapper exposing `tool_header` and `content_data` nodes.

## 3. Findings

Each finding states the evidence and its impact on an external developer.

### F1. `register.json` authoring requires an internal UI round-trip

The documented (and only practical) path is: create a record in section `dd1340`, fill ~20 fields, press "Download register file" in the inspector, copy the file into the tool directory, re-do the loop for every change (`creating_tools.md` §"Creating a new Dédalo tool"). The shipped files are raw v6 matrix-row dumps (`relations` + `components` keyed by dd-tipo — see `tools/tool_lang/register.json`, ~1190 lines), unreadable and uneditable by hand. Multilingual labels (up to 11 languages in core tools) look mandatory even though the client already does language fallback (`get_tool_label()`, `tool_common.js:1002`).

**Impact:** the very first artifact a newcomer must produce is the most opaque one, and it requires a working Dédalo install with developer access before writing a line of code.

### F2. Hardcoded dd-tipos scattered with no contract file

`dd1326` (name), `dd1327` (version), `dd999` (config), `dd1633` (default config), `dd1335` (properties), `dd1372` (labels), `dd1334` (ontology), `dd1330` (affected models), `dd1350` (affected tipos), `dd1354` (active)… appear as string literals across `class.tools_register.php`, `class.tool_common.php`, `class.dd_tools_api.php` and `class.common.php`. Only the two section tipos are constants (`core/base/dd_tipos.php`: `DEDALO_REGISTER_TOOLS_SECTION_TIPO`, `DEDALO_TOOLS_CONFIGURATION_SECTION_TIPO`). The JS side hardcodes the same knowledge independently.

**Impact:** no single place documents the tool record schema; typos are silent; cross-cutting changes are risky.

### F3. Security is opt-in and manual

- The `API_ACTIONS` allowlist (SEC-024) is only consulted **if the tool declares it** (`class.dd_tools_api.php:276`). A tool without the constant exposes *every* public static single-object-param method to any user authorized for that tool.
- Per-method gates (`assert_tipo_permission`, `assert_record_in_user_scope`) must be remembered and hand-written in every method. The template documents this extensively (`class.tool_dev_template.php` header) — precisely because the framework cannot enforce it.

**Impact:** the security model's strength depends on the diligence of the least careful third-party author.

### F4. Core knows about specific tools

`common::get_tools()` hardcodes: `tool_diffusion` only for sections with diffusion mapping (`class.common.php:3504`), `tool_time_machine` excluded for `component_relation_children` (:3516), and only `tool_export` allowed on the dd15 time-machine section (:3521–3522). Separately, `tool_diffusion` bypasses `dd_tools_api` with its own endpoint (`core/api/v1/common/class.dd_diffusion_api.php`).

**Impact:** the dependency points the wrong way — core must be edited to express tool-specific availability rules, something an external tool cannot do.

### F5. No out-of-repo tools path

Discovery scans only `DEDALO_TOOLS_PATH` (`class.tools_register.php:193`) and the dispatcher's realpath confinement is anchored to the same single root (`class.dd_tools_api.php:177`). Third-party tools must live inside the Dédalo checkout.

**Impact:** external tools conflict with `git pull` updates, cannot be versioned independently, and "install a tool" means "modify the Dédalo tree".

### F6. No scaffolding, validation, or test support

There is no generator, no JSON Schema for `register.json`, and registration performs no validation: a missing/broken class file, an unmet minimum Dédalo version (`dd1328` is stored but never enforced), or a malformed config all register silently. The PHPUnit 13 harness exists (`test/server/`, including a `test/server/tools/` directory) but no tool test example shows how to use it.

**Impact:** errors surface at first invocation in production instead of at registration; newcomers start from a blank page.

### F7. Config semantics are confusing

Three storage points — `dd999` ("configuration") and `dd1633` ("default configuration") in `dd1324`, plus instance overrides in section `dd996` — with no single documented resolution order and method names (`get_all_config()` vs `get_all_default_config()`) that suggest versioning rather than precedence. Client exposure is filtered late by `client: true` flags (`tools_register::filter_client_config()` :923) with no registration-time validation. Cache invalidation (`clean_cache()` :952) clears static caches and per-user file caches non-atomically.

**Impact:** authors guess where to put config and what reaches the browser; a forgotten `client: true` (or a mistaken one, leaking a server secret) is only discoverable empirically.

### F8. JS boilerplate and implicit contracts

Every tool repeats the same prototype wiring (`tool_x.prototype.render = tool_common.prototype.render`, …), the same call-super `init`/`build` pattern, and the same `rqo` construction for `tool_request` calls. Undocumented contracts: the `edit()`/`list()` mode method, the `tool_header`/`content_data` wrapper shape, the `ddo_map` `"self"` sentinel. The modal path loads tool CSS without `await` (`tool_common.js:699`, unlike `build()` which awaits at :272) — a first-paint styling race. Most failures only reach `console.error`.

**Impact:** the only way to write a correct tool UI is to reverse-engineer an existing one.

### F9. Documentation gap

`creating_tools.md` (164 lines) covers naming, file layout, and the UI registration walkthrough — and stops there. Nothing on the PHP class contract, `API_ACTIONS`, security gates, the request envelope, background running, config resolution, the JS lifecycle, or testing.

### F10. The template is not a starting point

`tool_dev_template` is explicitly development-only: its methods are intentionally unsafe placeholders, fail-closed on production (SEC-083), and its own header says "Do not use as a production tool". There is no production-shaped skeleton to copy.

## 4. Improvement roadmap

Constraints honored by every item: **additive only** (the 36 in-repo tools keep working unmodified; deprecation warnings allowed, breakage not), state stays in ontology sections, PHP 8 server, vanilla ES modules with no build step, no runtime composer dependencies.

### Tier A — Hardening (~2 weeks, ship first)

#### A1. Tool ontology contract constants file

One canonical class declaring every dd-tipo the subsystem touches.

- **New:** `tools/tool_common/class.tool_ontology_map.php` — `final class tool_ontology_map` with constants (`TOOL_NAME = 'dd1326'`, `TOOL_VERSION = 'dd1327'`, `CONFIG = 'dd999'`, `DEFAULT_CONFIG = 'dd1633'`, `PROPERTIES = 'dd1335'`, `LABELS = 'dd1372'`, `ONTOLOGY = 'dd1334'`, `AFFECTED_MODELS = 'dd1330'`, `AFFECTED_TIPOS = 'dd1350'`, `ACTIVE = 'dd1354'`, the three section tipos…) plus a `MAP` array for iteration/validation.
- **Touch (mechanical):** `class.tools_register.php`, `class.tool_common.php`, `class.dd_tools_api.php`, `class.common.php::get_tools()`. Expose the map to JS through the existing client config channel so the client stops hardcoding tipos too.
- **Effort:** ~1 day. **Risk:** near zero — constants resolve to identical strings; PHPStan catches typos.

#### A2. v7-native `register.json` + JSON Schema + runtime validator

Make the *output* of `convert_register_v6_to_v7()` (:1029) the canonical, documented, hand-authorable format.

- **New:** `tools/tool_common/register.schema.json` (JSON Schema draft 2020-12): required `name`, `version`, `label` (multilang object, ≥1 language), `affected_models`, `active`; optional `affected_tipos`, `default_config`, `properties`, `dedalo_version_min`, `capabilities`. Tools add `"$schema": "../tool_common/register.schema.json"` for free IDE validation.
- **New method:** `tools_register::validate_register(object $info_object): array` (error list) — hand-rolled PHP validation (~150 lines; no composer dep), kept in sync with the schema file from one rules table. Wire into `process_tool_directory()` (:233): invalid file → skip tool + log error list, instead of registering garbage.
- **Effort:** 2–3 days. **Risk:** low — v6 files keep passing through the converter; validation runs *after* conversion, so one gate covers both formats.

#### A3. Registration-time checks

Extend `process_tool_directory()` / `update_tool_registry_sections()` to verify:

- `class.tool_{name}.php` exists, loads, and `extends tool_common`.
- `dedalo_version_min` vs `DEDALO_VERSION` — refuse with a clear message if unmet (today `dd1328` is decorative).
- No ontology tipo collisions after renumeration.
- Warn (log + surface in the Maintenance UI response) when the class lacks `API_ACTIONS` (feeds A4).

**Effort:** 1–2 days. **Risk:** low; release-note caveat — a tool that currently registers despite a broken class file will now be rejected.

#### A4. Enforce `API_ACTIONS` with a deprecation path

- **Phase 1 (this release):** missing constant → deprecation `debug_log` + continue. Audit and add the constant to every in-repo tool lacking it. New config flag `TOOLS_REQUIRE_API_ACTIONS` (default `false`) in `config/sample.config.php` so security-conscious installs can opt into strict mode immediately.
- **Phase 2 (next minor):** default flips — no constant, no dispatch.

**Touch:** `class.dd_tools_api.php`, `config/sample.config.php`, each `tools/tool_*/class.tool_*.php` missing the constant. **Effort:** 2–3 days (the audit is the work). **Risk:** medium for external tools at phase 2 — mitigated by the flag, phase-1 logs, and CHANGELOG.

#### A5. Declarative per-action security

Stop relying on authors remembering `assert_*` calls.

- Extend `API_ACTIONS` backward-compatibly: keep accepting a plain list, also accept a map (detected via `array_is_list()`):

```php
public const API_ACTIONS = [
    'my_action' => ['permission' => 'tipo', 'min_level' => 2], // framework-enforced
    'other'     => []                                          // explicit "I gate it myself"
];
```

`dd_tools_api::tool_request()` runs declared assertions *before* invoking, reading `tipo`/`section_tipo`/`section_id` from the request options.

- **New:** `tools/tool_common/class.tool_security.php` — static wrappers (`tool_security::assert_tipo_permission(object $options, int $min_level)`, `tool_security::assert_record_in_user_scope(object $options)`) over the core assertions, as the single documented imperative entry point.

**Effort:** 3–4 days incl. tests under `test/server/tools/`. **Risk:** low — list form unchanged, map form opt-in.

### Tier B — External developer experience (~2–3 weeks)

#### B1. Hand-authorable minimal `register.json` (depends on A2)

Kill the dd1340 UI round-trip as the *required* path. This becomes a valid, registerable file:

```json
{
  "$schema": "../tool_common/register.schema.json",
  "name": "tool_hello",
  "version": "1.0.0",
  "label": { "lg-eng": "Hello" },
  "affected_models": ["section"]
}
```

- Registration fills defaults (`active = true`, `affected_tipos = []`, empty `default_config`); one language label suffices — `get_tool_label()` already falls back across languages.
- Keep the dd1340 UI + "Download register file" as an optional authoring aid; update its export to emit the v7-native format.
- Convert in-repo `register.json` files (e.g. `tool_lang`) opportunistically — dogfooding, and they become the reference corpus.

**Effort:** 2–3 days (+~1 day for in-repo conversions). **Risk:** low; the v6 converter stays indefinitely.

#### B2. Production-shaped `tool_dev_template` rewrite

Rebuild as a copy-rename-ship starting point:

- PHP: map-form `API_ACTIONS` (A5), one read + one write action with real `tool_security` gates, one `background_running` example, docblocks linking the docs (B4).
- JS: canonical prototype wiring via `wire_tool()` (C2), call-super `init`/`build`, one `tool_request` helper call, `ddo_map`/`"self"` usage, modal + window modes.
- v7-native `register.json` with `$schema`.
- A PHPUnit example under `test/server/tools/tool_dev_template/` showing how to test registration and invocation through `dd_tools_api`.

**Effort:** 2–3 days. **Risk:** none (dev-only directory).

#### B3. CLI scaffolder

`php tools/tool_common/cli/create_tool.php --name=tool_hello --label="Hello" --models=section` — copies the B2 template, renames class/files/JS identifiers, writes `register.json` from the answers, prints next steps; optional `--register` flag invokes `tools_register::import_tools()` (CLI context, guarded by `PHP_SAPI === 'cli'`).

**Effort:** 3–4 days, after B2. **Risk:** none (additive, dev-facing).

#### B4. Documentation expansion (`docs/development/tools/`)

1. `creating_tools.md` — rewritten end-to-end tutorial: scaffold → hand-edit `register.json` → register → add a server action → call it from JS → test. No internal-UI prerequisite.
2. `server_contract.md` — base class contract, file/class naming, `API_ACTIONS` (list + map), `tool_security`, the request envelope, background running, config resolution order.
3. `js_lifecycle.md` — `init → build → render`, `edit()`/`list()`, the `tool_header`/`content_data` wrapper, `ddo_map` and `"self"`, `open_tool`/modal/window, labels, CSS loading.
4. `register_json.md` — field-by-field, with the schema file as source of truth.
5. `security.md` — SEC-024/069/083/084 explained for outsiders: what the framework enforces vs. what the author must do.

**Effort:** 4–6 days, written last in Tier B so it documents the improved reality.

### Tier C — Architectural strengthening (~3–4 weeks)

#### C1. Remove core special-casing of specific tools

- Optional static on tool classes: `public static function is_available(object $context): bool` (`$context` carries `caller_model`, `section_tipo`, `tipo`, `mode`). `get_tools()` delegates when the method exists; absent → current `affected_models`/`affected_tipos` behavior, unchanged.
- Move the `tool_diffusion` (:3504) and `tool_time_machine` (:3516) conditions into their own classes. Keep the dd15 guard ("only `tool_export` on the time-machine section", :3521) in core, reworded as a section-level rule — it is about dd15, not about a tool.
- `get_tools()` is a hot path already cached per user/tipo/section — keep the cache key unchanged; `is_available()` implementations must be cheap or self-memoizing.

**Effort:** 3–5 days incl. **mandatory parity tests** (snapshot `get_tools()` output for representative components before/after). **Risk:** medium — the one Tier C item touching a behavior-sensitive hot path.

#### C2. JS base improvements (pull forward, before B2)

1. `tool_common.prototype.tool_request({tool_method, options, background})` — builds the `dd_tools_api` rqo every tool currently re-implements and calls `data_manager.request`.
2. `wire_tool(tool_constructor, render_module)` export — performs the standard prototype assignments in one call. Deliberately **not** ES classes: the whole client codebase is constructor-function + prototype; consistency wins.
3. Fix the modal CSS race — `await load_style(...)` in `view_modal()` (:699), matching `build()` (:272).
4. Surface errors — failed `tool_request`/`open_tool` renders a visible error block in `content_data` (reuse the existing core UI error pattern) instead of `console.error` only.

**Effort:** 3–5 days. **Risk:** low; the CSS fix needs a regression pass over modal-opening tools.

#### C3. Config semantics unification

Storage stays as-is (the dd999/dd1633/dd996 split *is* the Dédalo way); fix the developer-facing surface:

- `tool_common::get_config_value(string $key, mixed $fallback = null)` resolving instance config (dd996) → register defaults (dd1633) → fallback; mirrored on the client over the already-filtered config.
- Validate `client: true` flags at registration (A2 schema) and document that anything else never reaches the browser.
- One orchestrating `tools_register::invalidate_all_tool_caches()` called from every write path; atomic per-user cache writes (write temp + `rename()`).

**Effort:** 2–3 days. **Risk:** low.

#### C4. `ADDITIONAL_TOOLS_PATH` — out-of-repo tools (sequenced last)

The biggest enabler for true third-party development, and the highest-risk item: it widens the SEC-069/084 surface, so it lands **only after Tier A is in the field, with a dedicated security review**.

- **Config:** `DEDALO_ADDITIONAL_TOOLS` in `config/config.php` / `sample.config.php` — array of `{path, url}` pairs. `url` is mandatory because the browser loads tool JS/CSS directly; each external directory must be web-served (alias/symlink, documented).
- **Discovery:** `get_valid_tool_directories()` (:193) iterates `[DEDALO_TOOLS_PATH, ...additional]`; the dd1324 record stores the tool's origin path/url so later resolution never re-scans.
- **Security:** `tool_request` realpath confinement (:164–182) becomes a *whitelist of roots* — same guarantee, plural. Refuse, at config-load time, additional roots inside web-writable directories (`media_*`, `var`, `download`). Name collisions across roots: first-root-wins **with a registration error**, never a silent override.
- **Client:** `tool_common.js` resolves per-tool base URL (CSS, `view_window` URLs) from registry data already sent to the client.

**Effort:** 1.5–2 weeks including the security review. **Risk:** medium-high; this is exactly why A2/A3/A4 gates must be active before tools can come from outside the repo.

#### C5. Hooks — deliberately minimal

No generic plugin system (scope creep on a mature production system). Two narrow hooks:

- Server: optional `public static function on_register(): void` / `on_remove(): void`, called by `update_tool_registry_sections()` (:325) / `cleanup_removed_tools()` (:429) — a sanctioned place for setup/teardown (e.g. creating the tool's dd996 config record) instead of first-request hacks.
- Client: document the existing `event_manager` (already the transport for `open_tool`, `tool_common.js:538`) as the supported extension surface. No new mechanism.

**Effort:** 1–2 days. **Risk:** low.

## 5. Sequencing & cross-cutting concerns

| Phase | Items | Duration | Notes |
| --- | --- | --- | --- |
| 1 — Foundation | A1 → A2 → A3 → A4 (phase 1) → A5 | ~2 weeks | Mostly confined to `class.tools_register.php` + `class.dd_tools_api.php`; ship together with parity tests |
| 2 — DX | B1 → C2 → B2 → B3 → B4 | ~2–3 weeks | C2 pulled forward so the template uses the helpers; docs last so they describe reality |
| 3 — Architecture | C3 → C1 → C5 → C4 | ~3–4 weeks | C4 last, behind a dedicated security review; A4 phase 2 ships in the *following* minor release |

Cross-cutting, every phase:

- Tests under `test/server/tools/` (the PHPUnit 13 harness at `test/server/` is already in place).
- CHANGELOG entries for every deprecation (A4 phase 1, v6 `register.json` format).
- SEC-numbered notes for A4 / A5 / C4, following the existing SEC-XXX convention used in `dd_tools_api` comments.

## 6. Appendix — today's minimal tool (baseline)

For reference, the verified current minimum to ship a tool, which the roadmap above progressively shrinks:

```text
tools/tool_example/
├── class.tool_example.php      extends tool_common; const API_ACTIONS;
│                               public static function action(object $options): object
├── register.json               today: v6 matrix dump authored via dd1340 UI round-trip
│                               (after B1: ~6-line hand-written v7 file)
├── js/index.js                 module entry (may re-export the tool class)
├── css/tool_example.css
└── img/icon.svg                square SVG, ~1024×1024
```

Steps today: author the dd1340 record → download `register.json` → copy into the directory → System administration → Maintenance → "Register tools" → grant the tool to user profiles → invoke via `dd_tools_api` `tool_request` with `source: { model: "tool_example", action: "action" }`.

Steps after the roadmap: `php tools/tool_common/cli/create_tool.php --name=tool_example ... --register` → grant to profiles → done, with the framework validating the contract and enforcing the security gates the author declared.
