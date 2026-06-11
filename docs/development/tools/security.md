# Tools security model

What the framework enforces for you, and what remains your responsibility as a tool author. The internal hardening references (SEC-024, SEC-069, SEC-083, SEC-084) are noted for cross-reading with code comments.

## What the framework enforces

Every client call to a tool method goes through `dd_tools_api::tool_request`, which applies — in order, all fail-closed:

1. **Registry whitelist.** The tool name must exist in the registered tools section (dd1324). A directory dropped on disk is not callable until an admin registers it.
2. **Per-user authorization.** The logged user's profile must grant the tool (or the tool is `always_active`). A registered tool is not callable by every user.
3. **Path confinement (SEC-069 / SEC-084).** The tool class file must `realpath()`-resolve inside one of the allowed tool roots (the in-repo `/tools` plus any `DEDALO_ADDITIONAL_TOOLS` roots — themselves canonicalized and policy-checked, see below). The validated canonical path is what gets included.
4. **`API_ACTIONS` allowlist (SEC-024).** The requested method must be listed in the tool class `API_ACTIONS` constant. Tools without the constant are refused entirely (escape hatch for migration: `define('TOOLS_REQUIRE_API_ACTIONS', false)` — deprecated, logged).
5. **Signature contract (SEC-084).** The method must be `public static` and take a single `object` parameter (or none). Scalar/variadic/multi-parameter signatures are refused — the dispatcher never feeds attacker-shaped input into an unexpected signature.
6. **Declarative permission gate.** With map-form `API_ACTIONS`, the declared assertion (`section` / `tipo` / `record` / `developer` at a `min_level`) runs **before your method and before any background fork**. Missing or ill-typed required option fields throw `permission_exception` → the client receives the standard `permissions_denied` response.

At **registration time** the framework additionally validates: register.json structure (schema mirror), tool/directory name match, semantic version, class loads and extends `tool_common`, `dedalo_version_min` compatibility, ontology tipo uniqueness.

For **out-of-repo roots** (`DEDALO_ADDITIONAL_TOOLS`): roots are canonicalized; roots under media/cache/tmp/session paths or world-writable directories are refused; URLs must be same-origin root-relative paths (the browser imports tool JS from them — a cross-origin URL would execute third-party code in the Dédalo origin and is rejected at config load); the in-repo root always wins name collisions, which are reported, never silent.

## What YOU must do

1. **Declare `API_ACTIONS` in map form** with the least permission that fits each action:
   ``` php
   public const API_ACTIONS = [
       'read_something'  => ['permission' => 'tipo',   'min_level' => 1],
       'write_something' => ['permission' => 'record', 'min_level' => 2]
   ];
   ```
   Use `record` whenever the action targets one caller-supplied `section_id`: it adds the project-scope check (`assert_record_in_user_scope`) on top of the schema permission, so users cannot reach records outside their projects.

2. **Keep imperative gates inside long-running/background methods.** The CLI background path (`process_runner`) re-checks `BACKGROUND_RUNNABLE` but does not re-run the per-action gate; methods that write should re-assert (use the `tool_security::assert_options_*` wrappers or `security::assert_*` directly). See `tool_dev_template::long_process_demo`.

3. **Never list lifecycle hooks** (`is_available`, `on_register`, `on_remove`) in `API_ACTIONS` — they are framework-called, not remote API.

4. **Confine every caller-supplied path.** If your action receives file names (uploads etc.): sanitize fragments (`sanitize_key_dir`, `basename`), then `realpath()` and prefix-check against the expected base directory before touching the file. See `tool_dev_template::handle_upload_file` for the canonical pattern.

5. **Keep secrets out of client config.** Only config properties flagged `"client": true` reach the browser — and anything flagged so WILL reach it. API keys and credentials belong in unflagged (server-only) properties.

6. **Declare `BACKGROUND_RUNNABLE`** explicitly for the (few) methods allowed to run detached. Everything else should not be listed.

7. **Validate your inputs.** The framework guarantees the options argument is an object from an authorized user with the declared permission — not that its fields are sane. Check types and ranges before acting.

## Historical notes

- SEC-083 (the old `DEVELOPMENT_SERVER` fail-closed guard in `tool_dev_template`) was replaced by real permission gates when the template became production-shaped; the template still only registers on installs with `SHOW_DEVELOPER=true`.
- Before this hardening, `API_ACTIONS` was opt-in and dispatch only checked the global registry (any logged user could call any registered tool). Both gaps are closed; the per-user profile check and default-on allowlist are not optional.
