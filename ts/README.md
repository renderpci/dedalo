# Dédalo v7 core — TypeScript/Bun rewrite

Big-bang rewrite of the PHP `core/` engine (~209k LOC) onto a single Bun/TypeScript runtime.
The full plan lives at `~/.claude/plans/i-want-to-change-mellow-honey.md`.

## Hard constraints

1. **Backend only.** The ~190k LOC of browser JavaScript (each component's `js/` folder) is **not**
   changed. The unchanged frontend calls the JSON API, so this engine **must reproduce the existing
   JSON API contract byte-for-byte**. Byte-level JSON parity is the acceptance criterion.
2. **`publication/server_api/v1` stays PHP** and is repointed to call this engine over HTTP.
3. **No module-global mutable per-request state.** A persistent Bun process serves many concurrent
   requests; every per-request cache PHP used to reset via `common::clear()` lives on an
   `AsyncLocalStorage` `RequestContext` instead. A module-level mutable `Map`/`let` cache is a
   cross-user data/permission leak and is banned by lint.
4. **`@dedalo/db` is PostgreSQL-only.** It is never shared with the diffusion engine's MariaDB layer.

## Package layout

| Package | Role |
|---|---|
| `@dedalo/json-parity` | `dedaloJsonEncode()` reproducing PHP `json_encode` byte output (built first) |
| `@dedalo/contract` | Zod RQO/SQO/DDO/Locator/Response schemas — the wire contract |
| `@dedalo/config` | typed env loading; replaces `DEDALO_*` constants |
| `@dedalo/runtime` | `AsyncLocalStorage` `RequestContext` + `ctx()` accessor (keystone) |
| `@dedalo/db` | Postgres layer (postgres.js); replaces `DBi` + db managers |
| `@dedalo/auth` | Redis session store, CSRF, media-protection cookie |
| `@dedalo/registry` | model-name → class factory; replaces the PHP autoloader dispatch |
| `@dedalo/core-api` | router; replaces `dd_manager` + `json/index.php` |
| `object-model` | `common` base, components, sections, areas, search |
| `@dedalo/server` | the `Bun.serve()` entrypoint |

## Parity-first workflow

Nothing is "done" until its slice of the golden-master corpus is **byte-green** in the differ and its
ported `bun:test` suite passes at the coverage threshold (`bunfig.toml`, lines/functions ≥ 0.8).

PHP encoding note: `core/db/class.json_handler.php::encode` defaults to `JSON_UNESCAPED_UNICODE`
**only** (slashes are escaped `\/`). The actual API response path may add `JSON_UNESCAPED_SLASHES`.
The encoder is flag-configurable and verified against real PHP output — never assume the flag set.

## Commands

```sh
bun install            # from ts/
bun test               # all package tests
bun run typecheck      # tsc --build across project references
bun run lint
```
