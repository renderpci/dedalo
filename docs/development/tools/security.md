# Tools security model

What the TS framework enforces for you, and what remains your responsibility as a tool author. Machinery: `src/core/tools/{dispatch,security,loader,paths,register}.ts`. The internal PHP hardening references (SEC-024, SEC-069, SEC-083, SEC-084) are noted for cross-reading with the PHP oracle's code comments — the TS engine keeps the same guarantees with different mechanics (see below).

## What the framework enforces

Every client call to a tool action goes through `dispatchToolRequest` (`src/core/tools/dispatch.ts`), which applies — in order, all fail-closed:

1. **Options shape.** `options` must be an object (or absent) before anything else runs.
2. **Tool-name shape (SEC-024 equivalent).** The name must match `^tool_[a-z0-9_]+$` — checked before any DB lookup or filesystem access.
3. **Registry + per-user authorization.** The tool must be **ACTIVE** in the registered-tools section (dd1324) **and** authorized for the calling user (`getUserTools`: admins get every active tool; others the profile-granted set plus `always_active` tools). A directory dropped on disk is not callable until it is registered and, separately, granted to the caller's profile.
4. **Loaded server module (SEC-069/SEC-084 equivalent).** The tool must have a `server/index.ts` that loaded successfully at scan time (`loader.ts`). Discovery is a deterministic, **allowlisted directory scan** over the configured tool roots — never a request-supplied path: the import specifier is built only from an already-validated root + a name that already matched the tool-name pattern, and the canonical resolved path is confined under that root before the dynamic `import()` runs (TOCTOU-safe). There is no `realpath()`-at-request-time step to bypass because there is no request-time filesystem access at all.
5. **`apiActions` allowlist (SEC-024 equivalent).** The requested method must be a key of the module's `apiActions` object. A tool whose `server/index.ts` failed to load, or that never declares the method, is refused — there is no "class without the constant lets everything through" escape hatch, because reflection never happens: an action exists on the API only if it is literally a property of `apiActions`.
6. **Signature contract (SEC-084 equivalent) — structural, not runtime.** A handler is a typed TS function `(context: ToolActionContext) => Promise<ToolResponse>`; the loader's `validateModule` check rejects a module whose `apiActions[method].handler` is not a function. There is no way to accidentally expose a scalar/variadic-signature method, because the contract is enforced by the type system and one loader-time check, not by reflecting an arbitrary class method at request time.
7. **Declarative permission gate.** `assertActionPermission` runs the action's declared `permission`/`minLevel` **before your handler and before any background fork**. Missing or ill-typed required option fields (e.g. no `section_tipo` on a `tipo` gate) fail closed with `invalid_request`/`unauthorized` — the client receives the standard tool-response shape, never a partial success.

At **registration time** (`register.ts`) the framework additionally validates: the register.json format/schema (authoring files only — the 34 seeded files are column-keyed pass-through), the tool/directory name match, and (via the loader) that the server module — if any — satisfies the `ToolServerModule` contract. There is no PHP-style "class extends tool_common" check because there is no PHP class to extend.

For **out-of-repo roots** (`config.tools.additionalRoots` / `DEDALO_ADDITIONAL_TOOLS`): each root is canonicalized and refused if missing, not a directory, or a system temp directory (`rootIsForbidden` in `paths.ts`); the in-repo root always wins name collisions, which are reported (`getToolLoadCollisions()`), never silently overridden. Additional-root asset URLs are the tool author's/installer's responsibility to serve same-origin — the client `import()`s tool JS from wherever `getToolUrl()` resolves.

## What YOU must do

1. **Declare `apiActions` with the least permission that fits each action:**
   ```ts
   apiActions: {
     read_something:  { permission: 'tipo',   minLevel: 1, handler: readSomething },
     write_something: { permission: 'record', minLevel: 2, handler: writeSomething },
   }
   ```
   Use `'record'` whenever the action targets one caller-supplied `section_id`: it adds the project-scope check on top of the section/tipo permission, so users cannot reach records outside their projects.

2. **Keep imperative gates inside long-running/background handlers.** The background executor (`scheduleBackground`) does not re-run the per-action gate a second time when the handler actually executes — the declarative gate already ran once, before scheduling — but if a handler is SQO-wide (no single record to gate on, e.g. `tool_propagate_component_data`) it should still assert its own scope defensively. See `tools/tool_dev_template/server/index.ts` for the map-form pattern and `tools/tool_propagate_component_data/server/*.ts` for an SQO-wide handler.

3. **Never list lifecycle hooks** (`isAvailable`, `onRegister`, `onRemove`) inside `apiActions` — the loader throws and refuses to load the whole module if you do.

4. **Confine every caller-supplied path.** Any action that receives filenames (uploads, staged imports, etc.) must resolve and canonicalize the path, then prefix-check it against the expected base directory before touching the filesystem — the same pattern `paths.ts`/`loader.ts` use internally. See `tools/tool_import_dedalo_csv/server/index.ts` (`safe_upload_target`-equivalent confinement of the per-user staging directory) for the shipped pattern.

5. **Keep secrets out of client config.** Only config properties flagged `"client": true` reach the browser via `getToolClientConfig`/`getToolClientConfigRaw` — and anything flagged so WILL reach it. API keys and credentials belong in unflagged (server-only) properties (see `tool_lang`'s `translator_config`, which keeps `uri`/`key` unflagged while `translator_engine` is `client:true`).

6. **Declare `backgroundRunnable`** explicitly for the (few) actions allowed to run detached. Everything else should not be listed, or a `background_running:true` request for it is refused with `background_not_allowed`.

7. **Validate your inputs.** The framework guarantees `options` is an object from an authorized user who cleared the declared permission — not that its fields are sane. Check types and ranges before acting, exactly as in the PHP era.

## Historical notes

- The PHP hardening effort (SEC-024/069/083/084, `docs/development/tools/architecture_audit.md`) made `API_ACTIONS` enforced-by-default and added the declarative map-form gate; the TS rewrite inherits that end state directly — there was never a TS-side "opt-in" era to migrate away from, because reflection (the thing SEC-024 was defending against) does not exist in the TS model at all.
- SEC-083 (the PHP `DEVELOPMENT_SERVER` fail-closed guard on `tool_dev_template`) does not have a literal TS equivalent yet; `tools/tool_dev_template/server/index.ts` is a normal module like any other and is gated the same way as production tools (registry + per-user authorization). Treat it as a copy-and-rename starting point, not as something to register on a production install.
