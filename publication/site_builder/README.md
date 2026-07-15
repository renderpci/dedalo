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

## Running

```bash
bun install
cp sample.env .env          # then fill in SERVICE_TOKEN, PUBLICATION_API_URL, roots, keys
bun run start               # or: bun run --watch src/index.ts
bun test                    # 48 tests, hermetic (no network, no real agent CLI)
bunx tsc --noEmit
```

From the repo root the same are wired as `bun run sitebuilder:install` /
`start:sitebuilder` / `test:sitebuilder`.

Production install (service user, roots, systemd unit, basic-auth, agent-CLI detection):

```bash
sudo ./install.sh
```

See `sample.env` for every config key, `deploy/dedalo-site-builder.service` for the unit,
and `nginx/` + `apache/` for the serving configs.

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
