# Tools server contract

The contract every tool's server package must follow. Reference implementation: `tools/tool_dev_template/server/index.ts` (+ its handlers). Machinery: `src/core/tools/{module,dispatch,security,loader,paths,config,register,background,cache}.ts`. Concept spec: `engineering/TOOLS_SPEC.md`.

A tool's server module is discovered once by an allowlisted directory scan (`loader.ts`), and its actions are typed functions keyed in a plain object (`apiActions`) — "the method exists and is callable" is a `Map`/`Object.hasOwn` lookup, not a reflection check. There is no base class and no autoloader: dispatch runs an ordered gate chain (registry → per-user authorization → loaded module → `apiActions` lookup → declarative permission → execute) entirely against typed data.

## The module

- File `server/index.ts` in the tool root — never served to the browser (`serving.ts` refuses the whole `server/` subtree).
- Exports `const tool: ToolServerModule` (`src/core/tools/module.ts`):

```ts
interface ToolServerModule {
  name: string;                                // must equal the directory name, ^tool_[a-z0-9_]+$
  apiActions: Record<string, ToolActionSpec>;   // the remote surface
  backgroundRunnable?: readonly string[];       // second allowlist for async execution
  isAvailable?: (context) => boolean | Promise<boolean>;  // toolbar availability
  onRegister?: () => Promise<void>;             // lifecycle hook — NEVER inside apiActions
  onRemove?: () => Promise<void>;               // lifecycle hook — NEVER inside apiActions
}
```

- The loader validates this contract at scan time (`loader.ts::validateModule`): `tool.name` must equal the directory name and match the tool-name pattern; `apiActions` must be an object; none of the reserved lifecycle keys (`isAvailable`/`onRegister`/`onRemove`) may appear inside it; every action's `handler` must be a function. A tool that fails validation logs a warning and is simply absent from the registry — it never aborts the whole scan.
- Server logic imports `src/core/**` via relative paths. Core never statically imports a tool (the dependency points tool → core, never the reverse).

## Remotely callable methods (API actions)

Every entry in `apiActions` is a `ToolActionSpec`:

```ts
interface ToolActionSpec {
  permission: 'section' | 'tipo' | 'record' | 'developer' | null;
  minLevel?: number;   // dd774 level: 1=read, 2=write (default), 3=admin
  handler: (context: ToolActionContext) => Promise<ToolResponse>;
}
```

`handler` receives `{ principal, userId, options, background }` and returns a `ToolResponse` (`{ result, msg, errors?, ...extra }`) that **replaces the API envelope wholesale** — the handler owns `result`/`msg`/`errors` and may add extra fields (e.g. a streaming body).

### The request envelope

The client sends this (built by the JS helper `this.tool_request()`):

``` json
{
	"dd_api": "dd_tools_api",
	"action": "tool_request",
	"source": { "model": "tool_x", "action": "my_method", "...": "..." },
	"options": { "section_tipo": "oh1", "section_id": "5", "...": "..." }
}
```

`dispatchToolRequest` (`src/core/tools/dispatch.ts`, called from `dd_tools_api.tool_request` in `src/core/api/dispatch.ts`) runs this gate chain, in order:

1. `options` must be an object (or absent);
2. the tool name must match `^tool_[a-z0-9_]+$` — rejected before any lookup;
3. + 4. the tool must be **ACTIVE** in dd1324 **and** authorized for the calling user (`getUserTools` in `registry.ts`: admins get every active tool; others the profile-granted dd1067 set + `always_active` dd1601 tools);
5. the tool must have a **loaded server module** (`getLoadedTool`);
6. the method must be a key of the module's `apiActions` (`resolveAction`, the allowlist lookup);
7. the action's declarative permission gate must pass (`assertActionPermission`) — **before** any background fork;
8. execute: directly, or (when `options.background_running === true`) via `scheduleBackground`, which additionally enforces the `backgroundRunnable` allowlist.

## Permission kinds (`src/core/tools/security.ts`)

| `permission` | Reads from `options` | Asserts |
| --- | --- | --- |
| `section` | `section_tipo` | permission level ≥ `minLevel` on `(section_tipo, section_tipo)` |
| `tipo` | `section_tipo` + `tipo` | permission level ≥ `minLevel` on `(section_tipo, tipo)` |
| `record` | `section_tipo` + numeric `section_id` | the `tipo`-equivalent section-level check **plus** the record must be inside the caller's project scope (global admins skip this) |
| `developer` | — | `principal.isDeveloper` |
| `null` | — | always passes here — the handler gates imperatively (defense in depth), e.g. `tool_export`'s `get_export_grid` (which must additionally assert read on every SQO target the grid touches, something the declarative gate cannot express) |

`minLevel` defaults to `2` (write) when omitted. A missing or ill-typed required option field (e.g. no `section_tipo` for a `tipo` gate) is a **fail-closed denial**, never a pass — the request never reaches the handler. The dispatcher enforces the declarative spec before the handler runs; a handler needing a target shape none of the four kinds can express (e.g. an SQO-wide write with no single record) declares `permission: null` and gates itself imperatively as defense in depth.

!!! warning "Never list lifecycle hooks"
    `isAvailable`, `onRegister` and `onRemove` are called by the framework, not remotely. `loader.ts` throws (refusing to load the tool) if any of them appears as a key of `apiActions`.

## Background execution

Long-running actions can run detached: the client passes `options.background_running = true`. Bun's server is a **persistent process**, so `scheduleBackground` (`src/core/tools/background.ts`) runs the handler as a fire-and-forget promise plus an in-process job record — it returns `{ result: true, msg: 'OK. Background process started', background_job_id }` immediately and runs the handler afterwards, capturing the outcome on the job record (`getBackgroundJob(id)`).

The method must ALSO be listed in the module's `backgroundRunnable`:

```ts
backgroundRunnable: ['my_long_method'],
```

The declarative permission gate already ran (step 7 above) **before** the background fork, so unauthorized callers are refused observably, not silently queued. The background executor does not re-run the per-action gate; keep imperative asserts inside long-running write handlers as defense in depth (see `tool_propagate_component_data`'s handler, which re-derives its own gate because the target is SQO-wide, not a single record).

!!! note "Ledgered (engineering/TOOLS_SPEC.md)"
    Background jobs die on server restart — the in-process job table does not survive a Bun restart — and a CPU-bound handler currently shares the event loop with every other request. A Bun `Worker`-based executor is a drop-in follow-up behind the same `scheduleBackground` signature.

## Configuration (`src/core/tools/config.ts`)

Three storage points, one accessor set:

| Where | What |
| --- | --- |
| dd1324 / `default_config` (component dd1633) | factory defaults shipped by the tool's register.json |
| dd996 "Tools configuration" section (component dd999) | per-install overrides, edited by admins |
| `properties` (register.json) | UI hints (`open_as`, `windowFeatures`, `events`) |

Resolution helpers:

- `getToolConfig(toolName)` — the whole effective config object; install value wins per key over the register default.
- `getToolConfigValue(toolName, key, fallback)` — **per-key** precedence: install (dd996/dd999) → register default (dd1324/dd1633) → the caller-supplied `fallback`. Preferred for single keys.
- `getToolClientConfig(toolName)` / `getToolClientConfigRaw(toolName)` — only options flagged `"client": true` in either layer, resolved to their effective value (`ClientConfig`) or kept as the full prop definition (`ClientConfigRaw`, used by the tool element context). Everything else never reaches the browser — never put secrets in a `client: true` property.

`invalidateAllToolCaches()` (`src/core/tools/cache.ts`) is the single entry point clearing the registry reader, both config caches, the paths memo and the loaded-tools registry; call it (or trigger the "Register tools" widget) after any dd1324/dd996/dd234 write.

## Lifecycle hooks (optional module properties)

| Hook | Signature | Called |
| --- | --- | --- |
| `isAvailable` | `(context: ToolAvailabilityContext) => boolean \| Promise<boolean>` | by the section/component tool filter (`getElementTools` in `registry.ts`) after the `affected_models`/`affected_tipos` match, with `{callerModel, tipo, sectionTipo, isComponent, mode}`. Return `false` to hide the tool for that element. Must be fast and side-effect-free — results are cached per user/tipo/section. Tools without a loaded module fall back to a small set of core rules (`tool_diffusion`'s section-only + diffusion-map check is the one still resolved in `registry.ts` today). |
| `onRegister` | `() => Promise<void>` | after the registry record is reconciled during `importTools()`. Sanctioned place for setup (e.g. seeding a dd996 config record). A throw is logged, never fails the import. |
| `onRemove` | `() => Promise<void>` | best-effort, before the registry record of a removed tool is deleted. |

## Registration-time validation (`src/core/tools/register.ts`, `register_schema.ts`)

`importTools({dryRun})` scans the roots, parses each `register.json`, detects its format, and validates it:

- top-level `components` key → legacy v6 dump — **not supported this wave** (none of the 34 in-repo tools use it, so this has not blocked any real port);
- top-level `name` key → the flat **authoring** format (`authoringRegisterSchema`, a Zod mirror of `src/core/tools/client/register.schema.json`) — converted to the column-keyed shape;
- column-keyed (`data`/`string`/`relation`/…) → pass-through, validated as-is. **All 34 in-repo `register.json` files are this form** — they are seeded matrix-row dumps, not hand-authored files.

**Write gating.** `importTools` defaults to **dry-run** (`config.tools.enableRegistryImport = false`): for every tool it reports whether the registry already reflects the declared identity (empty diff = no-op), writing nothing. The write path (`enableRegistryImport = true`) is gated behind the write-parity procedure in `engineering/TOOLS_SPEC.md` (a `test/parity/tools_register_differential.test.ts` no-op gate plus one manual scratch-DB write-parity run) before it may be documented as supported.

A missing/invalid `apiActions` shape, a `tool.name` that does not match the directory, or a lifecycle hook listed inside `apiActions` all fail the loader's `validateModule` check (logged, tool absent from the registry) — there is no silent partial registration.

## Multi-root resolution (`src/core/tools/paths.ts`)

All path/URL resolution goes through `getRoots()` / `resolveToolRoot()` / `getToolUrl()`: index 0 is always the in-repo `tools/` root; extra roots come from `config.tools.additionalRoots` (env `DEDALO_ADDITIONAL_TOOLS`, JSON `[{path,url}]`), each canonicalized and refused if missing, not a directory, or a system temp dir. First-root-wins name collisions are reported via `getToolLoadCollisions()`, never silently overridden. Never build a tool path/URL from a raw config value in new code — always go through these helpers so additional-root tools resolve to their own URL and the client's `DEDALO_TOOLS_URLS` map stays in lockstep.
