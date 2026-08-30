# Site builder internals

## Scope

How the [site builder](../management/site_builder.md) works under the hood, for developers
extending, debugging, or reviewing it. It covers the two processes, the request and trust
model, and the internals of each subsystem with the file paths and symbols to start from.

For the operator's view (enabling it, who can do what) see the
[overview](../management/site_builder.md); for configuration and prompt examples see the
[cookbook](../management/site_builder_cookbook.md).

## Architecture at a glance

The feature is two independent processes joined by one HTTP contract:

```
Browser (Dédalo client)
   │  tool_request RQO  (session cookie + CSRF)
   ▼
Dédalo engine ── tools/tool_sitebuilder/          proxy: authorize, then forward
   │  HTTP + Authorization: Bearer <token> + X-Dedalo-User-Id/Username
   ▼
Site builder daemon ── publication/site_builder/  (may be a different host)
   │  spawns the coding agent, whose MCP points at ▼
   ▼
Publication API v2 ── read-only MariaDB           the published data
```

The **daemon** is a standalone Bun/TS service modelled on `publication/server_api/v2`: its
own `.env`, its own systemd unit, a dedicated OS user, and **no engine code, no engine
Postgres, no `../private/`**. The **engine tool** is a thin proxy plus a vanilla-JS
workspace client. The only coupling between them is the HTTP contract and a shared bearer
token. That is what lets the daemon run co-located or on a separate host with identical
code, and why deleting a workspace can never affect the engine or a live production site.

## Request and trust model

Authorization happens in the engine; the daemon executes and records.

1. **Browser → engine.** Every workspace action is a normal `tool_request` over
   `dd_tools_api` carrying the user's session cookie and CSRF token. The browser never
   contacts the daemon.
2. **Engine authorizes, then proxies.** `dispatchToolRequest`
   (`src/core/tools/dispatch.ts`) runs the standard tool gates first — the tool must be
   active in the registry and granted to the user. Then the tool handler runs;
   `publish`/`get_audit` additionally require a developer or global admin, checked in the
   handler. `daemon_client.ts` forwards the call with the shared token and the acting user's
   identity.
3. **Daemon trusts and records.** It verifies only the bearer token
   (`src/security/auth.ts`, constant-time compare). It does not re-authorize — it trusts the
   engine's decision and records the actor (`src/audit.ts`) in an append-only log. Every
   mutation requires an `actor: {user_id, username}` in the body.
4. **Agent reads only published data.** A turn's agent is handed an MCP config pointing at
   `<PUBLICATION_API_URL>/mcp` — the existing read-only endpoint — so a generated site's only
   data reach is the public data, never the work-system Postgres.

## The daemon

Bun/TS, loopback on port 3200 behind a reverse proxy, mounted at
`BASE_PATH=/publication/site_builder`. No database: durable state is the filesystem.

### Boot and configuration

`src/config.ts` BUILDS its source once — it parses a named environment file, merges a
three-key ambient allowlist (`DEDALO_SITE_INSTANCE`, `NODE_ENV`, `LOG_LEVEL`), then layers
`$CREDENTIALS_DIRECTORY`, where a credential always wins — validates it with a Zod schema,
freezes the result and `process.exit(1)`s on any invalid value or unknown key. It does NOT
read the rest of `process.env`, and nothing downstream reads it at all: every consumer
imports `config`. `DEDALO_SITE_INSTANCE`, `SERVICE_TOKEN` (≥32 chars, delivered as a
credential), `PUBLICATION_API_URL` and the four roots (`SITES_ROOT`, `AGENT_HOME`,
`AUDIT_DIR`, `WEBSPACE_BASE`) are required. LLM provider keys live only here.

On a provisioned host that environment file is **generated** from the museum's declaration
and delivered by the generated systemd unit; the daemon never reads a hand-written one. See
*The provisioner* below.

`src/index.ts` is the `Bun.serve` boundary. Before it listens it runs
`sweepOnBoot()` (session recovery, below). Shutdown drains in-flight work on SIGTERM.

### HTTP surface and auth

`src/router.ts` is a hand-rolled exact-arity segment matcher. Auth runs before a route is
matched: every route except `GET /health` requires the bearer token, so an unauthenticated
probe learns nothing about which routes exist. Errors are thrown, never constructed inline,
and rendered as RFC 9457 `application/problem+json` by `src/util/response.ts`; the taxonomy
is in `src/errors.ts` (`ValidationError` 400, `UnauthorizedError` 401, `NotFoundError` 404,
`ConflictError` 409, `LimitExceededError` 429, `ServiceError` 500). The `type` URI and the
`reason` extension are the stable machine-readable fields the engine matches on.

Route groups: site CRUD (`routes/sites.ts`), sessions (`routes/sessions.ts`), builds
(`routes/builds.ts`), publish/releases/rollback/audit (`routes/publish.ts`), plus
`routes/health.ts` and `routes/capabilities.ts`.

### Site workspaces

A site is a directory under `SITES_ROOT/<slug>/`:

```
SITES_ROOT/<slug>/
├── site.json      # daemon-owned manifest (zod-validated, atomic tmp+rename writes)
├── AGENTS.md, CLAUDE.md → AGENTS.md   # the agent's brief
├── .builder/      # gitignored daemon state: sessions/*.jsonl+meta, builds/*.log+json, mcp.json
├── .git/          # first commit = the scaffolded template; one commit per agent turn
├── package.json, index.html, src/…    # agent-owned site source
└── dist/          # build output (gitignored)
```

- **Manifest** (`src/sites/manifest.ts`): `SiteManifest` is validated on every read (a
  corrupt manifest fails loudly) and written atomically. `owner_user_id` is informational —
  the model is collaborative, so it drives display and audit, not authorization.
- **Slug grammar** (`src/util/slug.ts`): `^[a-z][a-z0-9-]{1,39}$`. Every filesystem
  operation additionally goes through `src/util/paths.ts` (`confinedPath` /
  `confinedRealPath`), which refuses a path that escapes its root lexically or via a symlink.
- **Templates** (`src/sites/template.ts`): shipped under `templates/`. Scaffolding copies the
  tree and substitutes placeholders (currently `__PUBLICATION_API_URL__`). Adding a template
  is dropping a directory with a `template.json` — no code change.
- **Git** (`src/sites/git.ts`): every turn is committed with a constructed environment (no
  ambient git config, a fixed service identity). `changedFiles()` derives a turn's edits from
  `git status --porcelain` — the driver-agnostic file-change backstop.
- **AGENTS.md** (`src/context/agents_md.ts`): generated per site with the brief, the API URL,
  the MCP tool list, a best-effort schema summary fetched from the API, and the rules (static
  output only, no secrets, don't touch `site.json`/`.builder/`).

### Agent sessions

`src/sessions/manager.ts` is the orchestrator. A **session** is a chain of **turns**; each
turn is one agent CLI invocation, linked to the next by the driver's native resume token.

- **Concurrency**: at most one active turn per site (an in-memory lock plus a
  `.builder/session.lock` pid file), and at most `MAX_CONCURRENT_SESSIONS` turns across all
  sites (a global counting semaphore). A second start on a busy site is a 409; over the cap
  is a 429; a workspace over `SITE_DISK_QUOTA_MB` is refused.
- **The turn runner** (`runTurn`): spawns the driver **before** the first `await` (so
  `stopSession` can never race in and find no process), persists a `turn_start` marker,
  consumes the driver's normalized events, derives the file-change list from git, commits the
  workspace, then writes `turn_end` and the updated meta — always releasing the slot and
  clearing state in `finally`.
- **The event log** (`src/sessions/events.ts`, `store.ts`): every event is appended to a
  per-session JSONL file with a monotonic `seq` **before** it is fanned to live subscribers,
  so the log is authoritative. `SessionEventBody` is the driver `AgentEvent` union plus two
  daemon markers (`turn_start`, `turn_end`).
- **The SSE endpoint** (`src/sessions/sse.ts`): replays the durable log from the client's
  cursor (`?after=N`), then live-tails. To avoid a gap at the replay/tail seam it subscribes
  **first** (buffering), replays the file, then flushes buffered live events deduped by
  `seq`. It closes on `turn_end`, and sets `X-Accel-Buffering: no` for the proxy.
- **Boot recovery** (`sweepOnBoot`): any session left `running` by a dead process is marked
  `interrupted`, its uncommitted work is committed as a recovery point, and the
  session→slug index is rebuilt.

### Drivers (the pluggable agent)

`src/drivers/types.ts` defines the `AgentDriver` seam — the thing that makes the agent
pluggable. Every driver is a CLI subprocess and presents three things: `detect()` (is the
binary present and its version tested), `capabilities`, and `startTurn()` returning an
`AgentProcess` whose `events` are the normalized `AgentEvent` stream. The manager talks only
to this interface, so adding an agent is a file under `drivers/` plus one registry line.

- `src/drivers/process.ts` is the shared supervision: `spawnAgentProcess` takes a driver's
  argv and its per-line parser, line-buffers stdout, pushes parsed events onto an async
  `EventQueue`, synthesizes a terminal result/error, and implements `interrupt()` (SIGINT
  then SIGKILL). The child's environment is exactly `SessionStartOptions.env` — a tight
  allowlist the manager builds. **Spreading `process.env` would hand a coding agent the
  daemon's token and provider keys**; the allowlist is the secrets boundary.
- `claude_code.ts` runs `claude -p … --output-format stream-json --mcp-config …` and parses
  the stream-json frames; `opencode.ts` runs `opencode run … --format json`; `pi.ts` is a
  `detect()`-able stub. Each writes its own MCP config (Claude reads `.builder/mcp.json`,
  OpenCode reads a workspace-root `opencode.json`) pointing at the publication `/mcp`.
- `src/drivers/registry.ts` maps `DriverId → AgentDriver`, exposes `detectDrivers()` (backs
  `/health` and `/capabilities`), and a test-only `__setTestDriver` seam.

### Build and publish

- **Build** (`src/build/builder.ts`): `startBuild` writes a `running` record and returns a
  `build_id` (the route answers 202); the work runs detached. `executeBuild` runs the
  manifest's install then build commands (no-shell argv via `src/util/spawn.ts`, output to a
  log), verifies the output directory exists, and promotes it. It never throws out — every
  path funnels to one terminal record so the per-slug lock always clears. A build is refused
  while a session runs (they would race on the tree).
- **Promote** (`src/build/promote.ts`): copies the built output into
  `<webspace>/.releases/pre/<release>/`, then flips the served symlink `<webspace>/pre` by
  writing a temp link and `rename`-ing it over the target — atomic on the same filesystem, so
  the web server never sees a half-updated site. The symlink target is relative (the tree
  stays relocatable). A symlink in the build output is REFUSED rather than copied into a
  served tree. Old releases beyond `RELEASES_RETAINED` are pruned, never the current one.
  The webspace is READ, never derived: the provisioner publishes every site's placement into
  `<config dir>/sites.json` (a generated, stamped artifact) and the daemon looks the site up
  there by slug (`src/sites/site_table.ts`). A site with no row, or whose webspace is missing
  or belongs to another instance, is refused by name. The daemon computed
  `<WEBSPACE_BASE>/<domain>` for itself until 2026-08-29, which disagreed with the vhosts for
  any site using the declaration's `sites[].webspace` override.
  The build output itself is proved before it is copied — the directory must not be a symlink
  and its realpath must lie inside the workspace — because an agent turn owns that directory
  and a lexical path check is a question about a string.
- **Publish** (`src/build/publish.ts`): copies the **current preprod release** (the exact
  bytes previewed) into the same site's `web` release store and flips the `web` symlink — it
  does not rebuild. Two stores, never one shared: sharing them would let preprod's pruning
  delete the bytes production is serving.
  Production is an independent copy, so a workspace delete never takes down a live site.
  `rollbackSite` re-activates any retained prod release.

### Serving

Reverse-proxy configuration is **generated, not shipped**: `src/provision/render/nginx.ts`
and `render/apache.ts` render one vhost per site per surface from the host's declaration, so
a site's document root, its server name and its TLS block are derived rather than typed.
Create/build/publish/rollback need **zero web-server reloads and no root at runtime** — the
daemon only ever swaps a symlink under the served root. The pre-production vhost carries
basic auth against a per-instance password file when the declaration asks for it. The
complete rendered output of a reference declaration is committed, for both web servers,
under `publication/site_builder/deploy/examples/`, so what lands on a host can be read
without running anything.

## The provisioner

`src/provision/` is the ops half of the subsystem: an **instance** — one museum's tenancy —
is declared once, and every host artifact is a pure function of that declaration. The
division of labour is the design, and it is what makes the whole thing testable without a
host to provision:

| Module | Responsibility |
|---|---|
| `schema.ts` | Validates `instance.json`. Strict objects, no unknown keys, no relative paths, and a walk over the RAW document that refuses an inlined credential anywhere in it. |
| `layout.ts` | **Derives** everything: the grammars, the default paths, the identity prefix and its arithmetic, the mode matrix, the containment predicate, the per-surface path pair. It owns every constant; `schema.ts` imports them rather than restating them. |
| `fleet.ts` | What is declared under the config directory, and a named refusal for a bad declaration. |
| `render/*` | One pure renderer per artifact — `unit`, `env`, `sites`, `nginx`, `apache`, `engine_fragment` — behind `renderAll()`. Each output carries a body-hash stamp naming its instance (`hash.ts`). |
| `plan.ts` | **Pure**: `(layout, manifest, hostState) => Action[]`. Ordering, drift detection and idempotency are properties of that array, so a gate asserts on the plan instead of on a live host. |
| `apply.ts` | **Dumb**: executes an already-decided plan. Writes only on drift, reloads systemd only when a unit changed, never reloads a web server after a failed config test. `check()` is the same report with no io at all. |
| `verify.ts` | The serving proof: for every slug and surface, does the served link resolve, does its target hold bytes, and is it still the release the site claims to publish. |
| `adopt.ts` | Infers a declaration from a live pre-instance install, moves its credentials into root-owned files, retires the old ones — then calls the ordinary `plan()`/`apply()`. |
| `remove.ts` | Decommissioning, also as a pure plan. Archives (renames) rather than deletes, unlinks only artifacts whose stamp proves this instance wrote them, and never frees a uid. |
| `cli.ts` | `bun run provision <verb>`: arguments, targets, output, exit codes — and no rule about what a host should end up holding. |

Two properties are worth carrying in your head when editing here.

**Nothing is derived twice.** The recurring defect of this subsystem has been two
independent derivations of one fact, each invisible to a green suite — the schema and the
layout owning different bounds, the daemon computing a webspace the provisioner did not use,
a hand-kept artifact census beside `renderAll()`. `test/unit/site_builder_single_source_tripwire.test.ts`
in the engine repo is the ratchet: per fact, the files entitled to derive it are frozen in a
baseline, and a new second derivation is red by default.

**A credential value never enters a plan.** A plan is printed, so `FileContent` has no
source that carries a literal secret. `apply` can mint a random token and can hash a
password file, but the one place a credential value exists in the adoption path is
`PreInstance.credentials`, kept in its own field so that "does this record carry a secret" is
answerable by reading a type, and leaving it exactly once — into a `0600` file.

Operator-facing procedure (declaring, provisioning, adopting, decommissioning, backups) is in
the [site builder management page](../management/site_builder.md).

## The engine tool

`tools/tool_sitebuilder/` — a standard tool package (server module + vanilla-JS client).

### The proxy layer

`server/daemon_client.ts` is the only place the engine talks to the daemon. It attaches
`Authorization: Bearer <token>` (from `config.siteBuilder.token`) and the acting user's
identity, applies a timeout to control calls (not to the stream), and maps every transport
failure and daemon problem into a stable `SiteBuilderError` code
(`server/wire.ts`): `site_builder_unconfigured | unreachable | auth | rejected | failed |
instance_mismatch`. The token and the daemon's address never appear in a response the engine
relays to the browser.

### The transport, and the pairing it proves

One museum is one Dédalo install paired with exactly ONE site-builder instance, so the engine
holds one address and there is no tenant map on either side. `src/core/site_builder/pairing.ts`
resolves that address once, for both readers (the tool and the maintenance panel):

| key | meaning |
|---|---|
| `DEDALO_SITE_BUILDER_SOCKET` | the daemon's per-instance unix socket. When set it IS the transport, and its `0660 <daemon user>:<engine group>` ownership is the whole access decision — no port, no firewall rule, no other account on the host able to connect. |
| `DEDALO_SITE_BUILDER_URL` | a daemon reached over the network instead. With a socket also set, it contributes only the path prefix and the host name. |
| `DEDALO_SITE_BUILDER_INSTANCE` | the tenancy the engine is paired with. Required as soon as either transport is set. |

A HALF configuration — a transport with no instance, or no token — resolves to no transport
at all: the tool hides itself and every action refuses.

Before the first byte of any call (the event stream included) the engine PROVES the pairing.
The daemon publishes, on its one unauthenticated route, `GET /health` →
`instance_fingerprint = sha256("dedalo-site-instance:" + instance + "\n" + SERVICE_TOKEN)`;
the engine recomputes it from its own instance name and token and refuses on any difference
with `site_builder.instance_mismatch`, having sent nothing — not the token, not the actor,
not the request. Equal hex proves both the identity and the shared credential while
disclosing neither, and a wrong instance, an unknown instance and a wrong token are
indistinguishable to the caller, so the refusal is not an enumeration oracle. The reason it
exists: a private environment file copied from one museum's server to another's used to point
one engine at the other's daemon undetectably, which means one museum's staff driving an
agent inside another's website, on that museum's budget and public domain.

The pairing lines are not typed by hand. The daemon's provisioner renders them as
`<config dir>/engine.env.fragment`, and `bun run scripts/site_builder_pair.ts <fragment>`
appends them to this install's private environment file: documented keys only, idempotent, a
refusal (not a duplicate line) when a key is already present with a different value, and a
refusal to append the token placeholder — pass the daemon's root-owned credential file with
`--token-file` instead. It never prints a token.

### apiActions and permissions

`server/index.ts` exports the `ToolServerModule`. Every action first checks `isConfigured()`
and fails closed. All actions sit behind the tool grant (`permission: null` = the grant is
the gate); `publish` and `get_audit` add an imperative `isDeveloper || isGlobalAdmin` check.

| action | daemon call | gate |
|---|---|---|
| `get_status` | `GET /health` (+ computes `can_publish`) | tool grant |
| `list_sites` / `create_site` / `delete_site` | sites CRUD | tool grant |
| `session_start` / `session_message` / `session_stop` / `session_history` | session lifecycle | tool grant |
| `session_stream` | `GET /sessions/:id/events` (SSE) | tool grant |
| `build` / `get_build` / `preview` | build + preview | tool grant |
| `publish` / `get_audit` | publish / audit | tool grant **+ developer or admin** |

`isAvailable` returns false when `config.siteBuilder.url`/`token` are unset, so the tool
disappears from `user_tools` and every surface when the feature is not configured.

### SSE pass-through

The chat stream reuses the existing tool-dispatch stream seam rather than a new API handler.
`session_stream` returns a `ReadableStream` that forwards the daemon's SSE bytes verbatim;
its `cancel()` aborts the upstream fetch (browser closed → daemon leg torn down). The one
core edit for this feature is in `src/core/api/handlers/dd_tools_api.ts`: the `tool_request`
stream branch now merges an optional `body.streamHeaders` from the tool response (so the tool
can set `X-Accel-Buffering: no`), keeping the tool's `streamContentType`. That merge is
guarded by `test/unit/dd_tools_api_stream_headers.test.ts`.

### The client workspace

Vanilla JS under `tools/tool_sitebuilder/js/`, opened as a full-page window
(`register.json` `open_as: 'window'`). `render_tool_sitebuilder.js` builds a three-pane
layout (sites | chat | preview) and hands the pane nodes to a `sitebuilder_controller` cached
on the tool instance (so a re-render keeps the selected site and live session). The
controller is the single place that calls the server — through the tool's `tool_request`,
except the chat stream, which is an SSE `fetch` in `builder_stream.js` (a fork of the
assistant's stream client: spec-compliant SSE record parsing, JSON-vs-SSE content-type
branch, `turn_end` terminal handling). The controller holds no durable state — sites and
sessions live on the daemon; on boot it calls `get_status` then `list_sites`.

### The maintenance widget and launcher

The launcher is not in the top menu — it is an occasional, admin/developer action, so it
lives in **Area maintenance → Publication → Site builder**. `site_builder_status`
(`src/core/area_maintenance/widgets/site_builder_status.ts`) is a display-only widget whose
`eagerValue` probes the daemon (`/health` + the audit tail) fail-soft and discloses only the
host, not the full URL. Its client render
(`client/dedalo/core/area_maintenance/widgets/site_builder_status/js/`) shows the status and
an **Open site builder** button that launches the workspace via `open_tool`. The widget is
placed in the `publication` category (list view) and the `pub` node (System Map view) in
`client/dedalo/core/area_maintenance/js/render_area_maintenance.js`.

## Configuration keys

**Engine** (`../private/.env`, read via `config.siteBuilder`, catalog
`src/config/catalog/sitebuilder.ts`): `DEDALO_SITE_BUILDER_INSTANCE`,
`DEDALO_SITE_BUILDER_SOCKET`, `DEDALO_SITE_BUILDER_URL`, `DEDALO_SITE_BUILDER_TOKEN`,
`DEDALO_SITE_BUILDER_TIMEOUT_MS`. See the
[settings reference](../config/config.md#sitebuilder). You do not type them: the provisioner
renders them into the instance's pairing fragment and `scripts/site_builder_pair.ts` appends
them.

**Daemon.** On a provisioned host the daemon's environment file is a GENERATED artifact —
`src/provision/render/env.ts` derives every key in it from the declaration, and a hand edit
is reported as drift and lost on the next `apply`. So the keys below are documented as what
the daemon *reads*, not as something anyone writes:

- Identity and transport: `DEDALO_SITE_INSTANCE`, `LISTEN_KIND`, `LISTEN_SOCKET`,
  `DEPLOYMENT_MODE`, `BASE_PATH`, and `PORT`/`HOST` for the standalone development case.
- Roots: `SITES_ROOT`, `AGENT_HOME`, `AUDIT_DIR`, `WEBSPACE_BASE`, `SITE_TABLE_FILE`.
- Data source: `PUBLICATION_API_URL`, `PUBLICATION_API_KEY_FILE`.
- URL facts: `PREPROD_HOST_PREFIX`, `PROD_URL_SCHEME` — a site's address is otherwise built
  from its own domain.
- Agent: `AGENT_DRIVER` and the driver bins `CLAUDE_CODE_BIN` / `OPENCODE_BIN` / `PI_BIN`
  (absolute paths — a bare name resolved through the shared search path is a
  cross-instance substitution vector).
- Limits: `MAX_SITES`, `MAX_CONCURRENT_SESSIONS`, `SESSION_TURN_TIMEOUT_MS`,
  `INSTALL_TIMEOUT_MS`, `BUILD_TIMEOUT_MS`, `SITE_DISK_QUOTA_MB`, `RELEASES_RETAINED`. A
  limit absent from the rendered file means "the daemon's own default", never a frozen copy
  of today's value.
- Credentials — `SERVICE_TOKEN`, `ANTHROPIC_API_KEY`, `OPENCODE_ENV`, `PI_ENV`,
  `PUBLICATION_API_KEY` — are **never** written into that file. They arrive through systemd
  `LoadCredential=` out of root-owned `0600` files and are layered over the parsed
  environment at boot, where a credential always wins.

## Extending

- **Add an agent driver.** Implement `AgentDriver` in `src/drivers/<name>.ts` (a `detect()`
  version probe, a `startTurn` that calls `spawnAgentProcess` with your argv and a per-line
  parser mapping stdout to `AgentEvent`s), register it in `src/drivers/registry.ts`, add its
  `*_BIN` and any provider keys to `config.ts`, and thread its env allowlist in the manager's
  `buildStartOptions`. The git backstop covers file changes if the CLI's stream does not.
- **Add a starter template.** Drop a directory under `templates/<name>/` with a
  `template.json` (`label`, `description`) and your project files; use `__PUBLICATION_API_URL__`
  where the data base URL is needed. It appears in `/capabilities` automatically.
- **Add a proxied action.** Add a handler to `server/index.ts` `apiActions` that calls
  `daemonJson`/`daemonStream`, and (if it maps to new daemon behaviour) a route on the daemon.

## Security model

The engine authorizes; the daemon executes under a dedicated unix user with systemd
hardening (`ProtectSystem=strict`, `ReadWritePaths` limited to the three roots). Agent and
build children get a constructed environment (never the daemon's secrets); the toolchain is
Bun-only, which does not run npm lifecycle scripts except `trustedDependencies` — the cheapest
real mitigation against a malicious dependency. Path confinement + slug grammar + no-shell
argv spawns bound what a workspace can reach on disk. Egress is not firewalled in the MVP
(the agent needs the LLM API and the package registry); the documented hardening is an
allowlisting proxy or per-uid rules.

## Testing

- **Daemon**: `bun run test:sitebuilder` (or `bun test` in the service dir) — site CRUD,
  driver stream parsing, session flow (a fake driver injected via `__setTestDriver` exercises
  the full manager → store → SSE → git path with no real CLI), promote/rollback symlink
  semantics, path-confinement and slug fuzz, auth, and the audit log.
- **The provisioner**: `tests/provision*.test.ts` in the same suite. Because `plan()`,
  `removalPlan()` and the renderers are pure, most of it asserts on a value rather than on a
  host: the composition `derive(parseManifest(…))`, the mode matrix, every refusal by name,
  and byte-equality between the committed rendered examples and a fresh render. The
  behavioural halves — adoption and removal — drive real writes, renames and modes inside a
  temp prefix with `exec` and `chown` stubbed. What they therefore do **not** prove is that
  `systemctl`, `usermod` and a real `chown` behave as expected, or that the uid boundary
  holds in the kernel; that is the operator's `provision check` on the box.
- **Engine**: `test/unit/tool_sitebuilder.test.ts` drives the proxy against an in-test
  mock daemon (config injected via `mock.module`), asserting the bearer + actor headers, the
  error taxonomy, the publish gate, and byte-identical SSE pass-through with the
  anti-buffering header. `test/unit/dd_tools_api_stream_headers.test.ts` guards the core edit.
  The tool is normalized out of the widget and register parity gates as a TS-only addition.

## File map

| Responsibility | Path |
|---|---|
| Daemon config / boot / routing / auth | `publication/site_builder/src/{config,index,router,errors}.ts`, `src/security/auth.ts` |
| Workspaces (manifest, git, templates, brief) | `publication/site_builder/src/sites/*`, `src/context/agents_md.ts` |
| Sessions (turns, drivers, SSE, event log) | `publication/site_builder/src/sessions/*`, `src/drivers/*` |
| Build / promote / publish | `publication/site_builder/src/build/*` |
| Ops — declaration, derivation, rendered artifacts | `publication/site_builder/src/provision/{schema,layout,hash}.ts`, `src/provision/render/*`, `deploy/examples/*` |
| Ops — the provisioner itself | `publication/site_builder/src/provision/{fleet,plan,apply,verify,adopt,remove,cli}.ts` |
| Ops — the backup of an instance's state | `deploy/dedalo-site-builder-backup.sh`, `deploy/dedalo-backup.service` |
| Engine proxy + client | `tools/tool_sitebuilder/{server,js,css}/*`, `register.json` |
| Engine config + core edit | `src/config/catalog/sitebuilder.ts`, `src/config/config.ts`, `src/core/api/handlers/dd_tools_api.ts` |
| Maintenance widget + launcher | `src/core/area_maintenance/widgets/site_builder_status.ts`, `client/dedalo/core/area_maintenance/widgets/site_builder_status/js/*` |

## Related

- [Site builder](../management/site_builder.md) — operator overview and enabling steps.
- [Site builder cookbook](../management/site_builder_cookbook.md) — configuration and prompts.
- [Publication API v2](../diffusion/publication_api/v2/index.md) — the read-only data source,
  including its [MCP endpoint](../diffusion/publication_api/v2/mcp.md).
- [Settings reference — Site builder](../config/config.md#sitebuilder) — every config key.
