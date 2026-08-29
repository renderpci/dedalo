# Dédalo Site Builder

A standalone service that lets Dédalo users build their own public websites over the
**Publication API v2** by talking to a coding agent (Claude Code, OpenCode; Pi planned).
Each site is a git-versioned workspace; an agent edits it, the daemon builds it to static
files, serves it on a **pre-production** surface, and — on an admin-gated **publish** —
promotes the exact previewed bytes to **production**.

It follows the same isolation model as `publication/server_api/v2`: its own `.env`, its
own systemd unit, a dedicated OS user, and **no access to the engine's Postgres or
`../private/`**. The only data a generated site reads is the read-only Publication API.

## Architecture

```
Engine (tool_sitebuilder)  ──HTTP + bearer──►  Site Builder daemon (this service)
                                                   │
                                    ┌──────────────┼───────────────┐
                                    ▼              ▼               ▼
                              agent driver     git workspace    build → dist/
                              (Claude Code)    SITES_ROOT/<slug>       │
                                    │                                  ▼
                                    ▼                        preprod release + symlink
                          MCP → Publication API v2                     │
                          (read-only published data)          publish │ (gated)
                                                                       ▼
                                                            prod release + symlink
```

- **The engine is the only client** and the only authorizer. It authenticates Dédalo
  users, decides who may build and who may publish, then calls here with the shared
  `SERVICE_TOKEN` and the acting user's identity. The daemon verifies the token, trusts
  the engine's decision, and records the actor in an append-only audit log.
- **Sessions** are chains of agent turns; every turn's normalized events are appended to a
  JSONL log and streamed to the engine over SSE. One active turn per site; a global
  concurrency cap across sites.
- **Builds** run the site's install/build commands (Bun) with no shell, capture a log, and
  promote the static output to preprod by an atomic symlink swap — no web-server reload.
- **Publish** copies the current preprod release to production (same bytes the user
  previewed) and flips the prod symlink. Production is a copy, so deleting a workspace
  never breaks a live site. **Rollback** re-activates any retained release.

## Running it locally

```bash
bun install
bun run start               # or: bun run --watch src/index.ts
bun test                    # hermetic: no network, no real agent CLI, no engine
bunx tsc --noEmit
```

From the repo root the same are wired as `bun run sitebuilder:install` /
`start:sitebuilder` / `test:sitebuilder`. A development run reads its own `.env`; on a
provisioned host that file is generated and is not written by hand (below).

## Installing it on a host — one declaration, everything else derived

There is no installer script and no config template to copy, and their absence is the
design rather than a gap. A host used to be described by six hand-written files —
`install.sh`, a systemd unit, two nginx vhosts, an Apache vhost and `sample.env` — each
stating the same deployment facts independently, and therefore each able to disagree with
the others. It did: the service identity was hardcoded in two of them, and the unit's
`ReadWritePaths=` named roots that did not follow the installer's own overrides, so
overriding a root produced a clean install and a read-only filesystem at publish time, on
a museum's live site, with every file on disk looking correct.

**A deployment fact is now stated once, in one declaration, and every host artifact is a
pure function of it:**

```
/etc/dedalo_sites/instances/<instance>/instance.json      the ONE thing an operator writes
```

`src/provision/schema.ts` is that file's grammar, `src/provision/layout.ts` derives every
name, path, owner, group and mode from it, and `src/provision/render/` turns the result
into the exact bytes of each artifact — the systemd unit, the daemon's environment file,
one vhost per site per surface, and the pairing fragment the paired engine's `.env`
receives. Each rendered file carries a hash of its own body on the first line, so a hand
edit is drift the next run reports by name rather than a change that survives until
someone re-runs the provisioner and silently loses it.

Read `engineering/SITE_BUILDER_INSTANCES.md` for what an instance IS — the uid/gid/mode
matrix, the marker law, the credential path, and the isolation boundary between museums.

### What lands on the host, byte for byte

`deploy/examples/` holds one committed declaration and the complete rendered output of it,
so the question "what will this actually put on my machine?" is answered by reading files
rather than by running anything:

| Path | What |
|---|---|
| `deploy/examples/instance.example.json` | the reference declaration — generic, never a real museum |
| `deploy/examples/rendered/` | everything that declaration provisions, in a tree that mirrors the host (`rendered/etc/…` is `/etc/…`) |
| `deploy/examples/rendered-apache/` | the same declaration with `web.server` set to `apache`, for httpd hosts |
| `deploy/examples/rendered.index` | the census: which artifact lands where, owned by whom, with which mode |

Those files are generated and gated, never edited:
`tests/provision_examples.test.ts` renders the declaration afresh and byte-compares every
one of them, in both directions — an artifact with no committed example and a committed
example no renderer produces both redden. To move them, change a renderer or the
declaration and re-render:

```bash
UPDATE_EXAMPLES=1 bun test ./tests/provision_examples.test.ts   # writes, then fails on purpose
git diff deploy/examples/                                       # read what moved
bun test ./tests/provision_examples.test.ts                     # green again
```

### Credentials

No rendered artifact ever contains a secret — not the unit, not the environment file, not
a vhost, not the pairing fragment. Credentials live in root-owned `0600` files the service
user cannot open, and reach the process through systemd `LoadCredential=`, so the values
are absent from `/proc/<pid>/environ` and from every file the daemon could read on its
own. A declaration names credential KEYS and PATHS; it never carries a value.

### Still to come: the provisioner's CLI

**Phase 3 is not built yet.** The grammar, the derivation and all five renderers are
landed and gated; what does not exist yet is the command that reads a host's declaration,
creates the identities, roots, markers and credential files, writes the artifacts that
drifted, reloads systemd and validates the vhosts — plus its read-only `check` counterpart
and the `adopt` path that builds a declaration from a host that predates all of this. Until
it lands, this tree describes the target state completely and applies none of it. No flag
of that CLI is documented here, because inventing one now would be exactly the second
source of truth this phase deleted.

## HTTP API (all under `BASE_PATH`, bearer auth except `/health`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | liveness + driver availability (no auth) |
| GET | `/v1/capabilities` | drivers, templates, limits |
| POST/GET/DELETE | `/v1/sites[/:slug]` | site CRUD |
| POST/GET | `/v1/sites/:slug/sessions` | start a turn / list sessions |
| GET | `/v1/sessions/:id/events?after=N` | SSE event stream (replay + tail) |
| POST | `/v1/sessions/:id/messages` | follow-up turn (resumed) |
| POST | `/v1/sessions/:id/stop` | interrupt the running turn |
| POST/GET | `/v1/sites/:slug/build`, `/builds/:id` | build / status + log |
| GET | `/v1/sites/:slug/preview` | preprod URL + current release |
| POST | `/v1/sites/:slug/publish` | promote preprod → production (requires `confirm: true`) |
| GET/POST | `/v1/sites/:slug/releases`, `/rollback` | prod history / rollback |
| GET | `/v1/audit?site=&limit=` | audit tail |

Every mutating call requires an `actor: { user_id, username }` in the body.
