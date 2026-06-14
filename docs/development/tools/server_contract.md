# Tools server contract

The PHP-side contract every tool must follow. Reference implementation: `tools/tool_dev_template/class.tool_dev_template.php`.

## Class

- File `class.{tool_name}.php` in the tool root; class name `{tool_name}` equal to the directory name (validated at registration).
- `class tool_name extends tool_common`.
- Loaded on demand by the Dédalo autoloader (`core/base/class.loader.php`), multi-root aware via `tool_paths`.

## Remotely callable methods (API actions)

Every method callable from the client through `dd_tools_api` `tool_request` must be:

- `public static`
- single parameter `object $options` (or no parameters for status hooks) — anything else is refused (`signature_mismatch`, SEC-084)
- returning an object `{ result: mixed, msg: string, errors: string[] }`
- **listed in `API_ACTIONS`** (SEC-024, enforced by default — see below)

### The request envelope

The client sends (built for you by the JS helper `this.tool_request()`):

``` json
{
	"dd_api": "dd_tools_api",
	"action": "tool_request",
	"source": { "model": "tool_x", "action": "my_method", "...": "..." },
	"options": { "section_tipo": "oh1", "section_id": "5", "...": "..." }
}
```

The dispatcher (`core/api/v1/common/class.dd_tools_api.php`) runs this gate chain, in order:

1. registry whitelist — the tool must be registered (dd1324)
2. per-user authorization — the logged user's profile must grant the tool
3. path confinement — the class file must resolve inside an allowed tools root (realpath, SEC-069/SEC-084)
4. `API_ACTIONS` allowlist (fail-fast)
5. reflection checks — public static + signature contract
6. declarative permission gate (map form, see below) — runs **before** any execution, including the background fork
7. execution — direct call or CLI background

## API_ACTIONS: list form and map form

List form (historical, still valid):

``` php
public const API_ACTIONS = ['my_method', 'other_method'];
```

Map form (**preferred**) — the framework enforces the declared permission before dispatch:

``` php
public const API_ACTIONS = [
	'read_action'   => ['permission' => 'tipo',      'min_level' => 1],
	'write_action'  => ['permission' => 'record',    'min_level' => 2],
	'admin_action'  => ['permission' => 'developer'],
	'status_action' => null   // listed, no declarative gate (gate inside the method)
];
```

Permission types and the request option fields they read:

| Type | Reads from options | Asserts |
| --- | --- | --- |
| `section` | `section_tipo` | `security::assert_section_permission` at `min_level` |
| `tipo` | `section_tipo` + (`tipo` ?? `component_tipo`) | `security::assert_tipo_permission` at `min_level` |
| `record` | `section_tipo` + numeric `section_id` | section permission at `min_level` **plus** `security::assert_record_in_user_scope` |
| `developer` | — | logged user is developer |

`min_level`: 1 = read, 2 = write (default), 3 = admin. Missing or ill-typed required fields **fail closed** with `permission_exception` (client receives the standard `permissions_denied` response). A `section`/`tipo`/`record` spec on a parameterless method therefore always refuses — use list form or `null` for status hooks.

Enforcement default: a tool class **without** `API_ACTIONS` is refused at dispatch. The temporary migration escape hatch is `define('TOOLS_REQUIRE_API_ACTIONS', false);` (legacy dispatch allowed, logged as deprecated). All in-repo tools declare the constant.

Imperative helpers for gating inside method bodies (also useful as defense in depth for the CLI path): `tool_security::assert_options_section/tipo/record($options, $min_level, $context)` and `tool_security::assert_developer($context)` — see `tools/tool_common/class.tool_security.php`.

!!! warning "Never list lifecycle hooks"
    `is_available`, `on_register` and `on_remove` are called by the framework, not remotely. Listing them in `API_ACTIONS` would expose them to the API.

## Background execution

Long-running actions can be detached to a CLI process: the client passes `background: true` (the HTTP response returns immediately with the pid; the work runs via `core/base/process_runner.php`). The method must ALSO be listed in:

``` php
public const BACKGROUND_RUNNABLE = ['my_long_method'];
```

The declarative `API_ACTIONS` gate runs before the fork, so unauthorized callers are refused observably. The CLI path itself does not re-run per-action gates — keep imperative asserts inside long-running write methods (see `tool_dev_template::long_process_demo`).

## Configuration

Three storage points, one accessor:

| Where | What |
| --- | --- |
| dd1324 / "Default configuration" (`default_config` in register.json) | factory defaults shipped by the tool |
| dd996 "Tools configuration" section | per-install overrides, edited by admins |
| `properties` (register.json) | UI hints (open_as, windowFeatures, events) |

Resolution helpers on `tool_common`:

- `tool_common::get_config(string $tool_name): ?array` — the whole config array; the dd996 record wins wholesale when it exists.
- `tool_common::get_config_value(string $tool_name, string $key, mixed $default=null): mixed` — **per-key** precedence: dd996 → dd1324 defaults → `$default`. Preferred for single keys.

Config properties flagged `"client": true` are exposed to the browser; everything else stays server-side. Never put secrets in a `client: true` property.

## Lifecycle hooks (optional statics)

| Hook | Signature | Called |
| --- | --- | --- |
| `is_available` | `(object $context): bool` | by `common::get_tools()` after the affected_models/affected_tipos match, with `{caller_model, called_class, is_component, tipo, section_tipo, mode}`. Return `false` to hide the tool for that element. Must be fast and side-effect-free (results are cached per user/tipo/section). Examples: `tool_diffusion`, `tool_time_machine` |
| `on_register` | `(): void` | after the registry record is saved during tool import. Sanctioned place for setup (e.g. creating a dd996 config record). A throw is logged, never fails the import |
| `on_remove` | `(): void` | best effort, before the registry record of a removed tool is deleted (the class is usually already gone from disk, so only callable if loaded earlier in the request) |

## Registration-time validation

`tools_register::import_tools()` refuses (with explicit import-report errors) any tool whose:

- register.json is invalid (see [register.json reference](register_json.md))
- name does not match the directory or the `^tool_[a-z0-9_]+$` pattern
- class file is missing, fails to load, or does not extend `tool_common`
- `dedalo_version_min` exceeds the installed `DEDALO_VERSION`
- ontology extension contains duplicate tipos after renumeration

A missing `API_ACTIONS` registers with a warning but is refused at dispatch.

## Multi-root resolution

All path/URL resolution goes through `tool_paths` (`tools/tool_common/class.tool_paths.php`): the in-repo `/tools` root plus optional `DEDALO_ADDITIONAL_TOOLS` roots, first-root-wins. Never build tool paths from `DEDALO_TOOLS_PATH` directly in new code — use `tool_paths::get_tool_class_file()` / `get_tool_url()`.
