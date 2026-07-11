# CI/CD — pipeline map, invariants, runbooks

Foundation built 2026-07-09 (prepare-only: workflows are inert until the repo
is pushed — see the activation runbook at the bottom). Invariants in the
workflow files are enforced by `test/unit/ci_workflow_tripwire.test.ts`.

## Pipeline map

| Workflow | Trigger | Runner | Runs |
|---|---|---|---|
| `.github/workflows/ci.yml` | pull_request | hosted ubuntu + self-hosted mac | `hermetic` (scripts/ci/hermetic.sh) + `verify` (scripts/verify.ts --base origin/main, live oracle) |
| `.github/workflows/main.yml` | push to main | hosted ubuntu + self-hosted mac | `hermetic` + full `bun test test/unit test/parity` (the LEDGER measured baseline) |
| `.github/workflows/nightly.yml` | cron 01:00 UTC + manual | self-hosted mac | full `bun test` (unit+parity+integration/MariaDB) + client gate (scripts/ci/client_gate.sh) |
| `.github/workflows/deploy.yml` | manual dispatch | self-hosted mac | **PARKED** — loud failure until DEPLOY_HOST/DEPLOY_SSH_KEY secrets exist, then deploy/deploy.sh |
| `.gitlab-ci.yml` | MR + default-branch push (GitLab mirror) | GitLab shared runners | hermetic tier only — the SAME scripts/ci/hermetic.sh |

Two tiers, by dependency footprint:

- **Hermetic** (any bare runner, no secrets): `bun install` + `bunx tsc
  --noEmit` + `bun run lint` + the 10 DB-less/sibling-less tripwires. One
  source of truth: `scripts/ci/hermetic.sh` — GitHub and GitLab both call it,
  so the platforms cannot drift. The 4 required config keys get harmless stubs
  inside the script; `DB_PORT` points at a closed port so any accidental DB
  touch fails loudly.
- **Self-hosted** (this Mac — the machine that has the live matrix Postgres
  with real Dédalo data, the PHP oracle at :8080, the sibling PHP tree, and
  Chrome): everything else. Unit tests are NOT hermetic by design (they read
  real records); parity needs the oracle; `client_serving` byte-compares
  against the PHP tree; the client gate needs puppeteer + a booted server.

## Non-negotiables (each is tripwired)

- **Bun pin**: workflows pin via `bun-version-file: .bun-version` (GitHub) and
  `oven/bun:<tag>` = `.bun-version` (GitLab); `scripts/ci/env_guard.sh` re-checks
  the runner's actual binary at job start. Never fix a version mismatch by
  editing the pin in CI — fix the runner.
- **Oracle honesty**: self-hosted parity/verify jobs set `ORACLE_REQUIRED: "1"`.
  **PHP oracle down ⇒ the parity canary is RED — that is the system working,
  not a flake.** Runbook: start the PHP server at :8080, re-run the job. Never
  acknowledge with ORACLE_OPTIONAL in CI.
- **ONE self-hosted runner, ever.** A single runner slot serializes all
  self-hosted jobs machine-wide — that is the isolation guarantee for the
  shared scratch DB surfaces. Registering a second runner (or a gitlab-runner)
  on this machine breaks it; if that day comes, add cross-system locking first.
- **GitLab runs no oracle/DB tier** — same invariant from the other side.

## CI seam environment (why CI never collides with interactive dev)

Externally provided values win over `test/preload/session_db.ts` defaults and
over `../private/.env` (readEnv precedence). The jobs and
`scripts/ci/client_gate.sh` set:

| Var | CI value | Protects |
|---|---|---|
| `DIFFUSION_JOBS_TABLE` | `dedalo_ts_test_ci_diffusion_jobs` | live/dev diffusion job queue (scheduler cross-claiming) |
| `DIFFUSION_ACTIVITY_TABLE` | `dedalo_ts_test_ci_activity_diffusion` | live activity rows (the dd1758 starvation class) |
| `SERVER_TCP_PORT` | `3510` (client gate only) | dev server on 3500 |
| `SERVER_UNIX_SOCKET` | scratch path (client gate only) | `/tmp/dedalo_ts.sock` double-start guard |
| `DEDALO_SESSION_DB_PATH` | scratch sqlite (client gate; `bun test` preload mkdtemps its own) | the live session store |
| `DEDALO_TS_STATE_PATH` | scratch json (client gate) | real maintenance-mode state |

The `dedalo_ts_test_` table prefix is schema-enforced. Proven 2026-07-09: the
client gate ran green on :3510 while the dev server served :3500.

## Sibling paths on the runner

A GitHub checkout lands in `.../_work/<repo>/<repo>`, so the repo's three
out-of-tree assumptions resolve inside runner-owned space.
`scripts/ci/link_siblings.sh` (idempotent, first step of every self-hosted
job) plants symlinks: `../private` → the real private dir,
`../../v7/master_dedalo` → the real PHP tree, `client/dedalo/lib` → the PHP
tree's `lib/` (byte-identical source per scripts/sync_client.sh). Deliberately
NOT `sync_client.sh`: rsyncing `core/` over checked-out files could mask a
divergence the `client_serving` byte-identity tripwire exists to catch.
Override sources with `DEDALO_CI_PRIVATE_DIR` / `DEDALO_CI_PHP_ROOT`.

## Deploy (PARKED)

No staging/production server exists yet. `deploy/deploy.sh` is written and
reviewed but has NEVER run against a real host: git-based deploy (fetch +
checkout ref), pinned-bun `install --frozen-lockfile --production`,
`systemctl restart dedalo-ts`, `/health` wait over the unix socket, automatic
rollback to the previous ref on red health. Boot migrations run inside the
server (engineering/PRODUCTION.md) — deploy runs no separate migrate step.

Unparking checklist (first server):
1. Provision the host per `engineering/PRODUCTION.md` + `deploy/` systemd units;
   run `engineering/STAGING_VALIDATION.md` once.
2. Set repo secrets `DEPLOY_HOST` (user@host) + `DEPLOY_SSH_KEY`; configure
   the `staging`/`production` GitHub environments (manual approval on
   production).
3. First dispatch of deploy.yml against staging IS the deploy.sh test.

## Security posture (hard precondition)

The self-hosted runner executes workflow code with access to the real
`../private/.env` and the live Postgres. That is acceptable ONLY while the
repo is private with no outside collaborators. **Before adding collaborators
or going public**: require approval for outside-collaborator workflow runs
(already set), and reconsider whether PR jobs may target the self-hosted
runner at all.

## Activation runbook (one-time, when ready to push)

1. ~~Pre-push: decide untracked `install/import/`~~ RESOLVED 2026-07-10
   (UPDATE_PROCESS Phase 2): `install/import/ontology/` is COMMITTED — it is
   the vendored ontology data package the update pipeline imports from (the
   'Local files' source) and the dir the export pipeline regenerates. Sanity
   still applies before push: `git ls-files | xargs du -m | sort -rn | head`
   (nothing near GitHub's 100 MB blob limit).
2. `gh repo create <owner>/<name> --private --source . --remote origin --push`
3. GitLab: create the project, add as second remote (or GitHub→GitLab push
   mirroring). The first push runs the `.gitlab-ci.yml` hermetic pipeline on
   shared runners — that run is the GitLab smoke test.
4. GitHub repo settings: Actions → restrict allowed actions; require approval
   for outside collaborators; scope the runner group to this repo.
   Branch-protection caveat: required status checks on private repos need a
   paid plan — the free-tier posture is "red main.yml is the alarm".
5. Self-hosted runner: Settings → Actions → Runners → new macOS/arm64 runner
   into `~/actions-runner-dedalo/` (outside all Dédalo trees), labels
   `dedalo-mac`, name `dedalo-mac-1`. **ONE runner only.** Then
   `./svc.sh install && ./svc.sh start` (LaunchAgent — runs while this user
   is logged in). Put the pinned bun dir (`~/.bun/bin`) in the runner's
   `.path` file; env_guard catches drift regardless. Sleep note: a sleeping
   Mac queues jobs (queued-not-lost); `sudo pmset -a sleep 0` if that ever
   matters.
6. Smoke sequence:
   - push branch `ci-smoke` (whitespace change) + open a PR → `hermetic` and
     `verify` both green;
   - push a deliberate biome violation → `hermetic` red on the hosted runner;
     revert;
   - stop the PHP server → re-run `verify` → RED via the oracle canary;
     restart PHP → green (proves ORACLE_REQUIRED wiring);
   - merge → watch `main.yml` full run; record its duration in
     rewrite/LEDGER.md;
   - manually dispatch `nightly.yml` once (don't wait for cron);
   - dispatch `deploy.yml` → the loud PARKED failure is the passing test.
7. GitHub pauses cron schedules after ~60 days of repo inactivity —
   re-enable from the Actions tab if nightly goes quiet.
