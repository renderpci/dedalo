# CI/CD — pipeline map, invariants, runbooks

Foundation built 2026-07-09. **ACTIVATED 2026-07-11** on `renderpci/dedalo`
(GitHub), which is a **PUBLIC** repo whose default branch is **`master`** — two
facts that reshape the whole design (see Security posture). Invariants in the
workflow files are enforced by `test/unit/ci_workflow_tripwire.test.ts`.

The hermetic tier first ran GREEN on 2026-07-11 (55/55 static tripwires, tsc +
biome clean). Getting there needed two fixes that had shipped red in the initial
commit — the workflows had never actually executed: a `biome` format error in
`src/core/ontology/recovery_file.ts`, and a `ws_a_tripwires` false positive on
`src/core/test_data/seed.ts` (typed-number fixture identity, not a locator —
ratcheted with a reason).

## Pipeline map

**Two repos, by trust level.** GitHub is public and gets the hermetic tier only;
everything that needs the live Postgres runs on a PRIVATE mirror with the
self-hosted runner. GitHub executes ONLY `.github/workflows/` — so the
self-hosted tier is parked, inert but preserved, in `.github/workflows-selfhosted/`.

| Workflow | Trigger | Runner | Runs |
|---|---|---|---|
| `.github/workflows/ci.yml` | pull_request | hosted ubuntu | `hermetic` (scripts/ci/hermetic.sh) |
| `.github/workflows/main.yml` | push to **master** | hosted ubuntu | `hermetic` |
| `.gitlab-ci.yml` | MR + default-branch push (GitLab mirror) | GitLab shared runners | hermetic tier only — the SAME scripts/ci/hermetic.sh |
| *— PRIVATE MIRROR ONLY (inert on the public repo) —* | | | |
| `.github/workflows-selfhosted/selfhosted.yml` | dispatch (restore PR/push triggers on the mirror) | self-hosted mac | `verify` (scripts/verify.ts --base origin/master) + `full` (bun test test/unit test/parity) |
| `.github/workflows-selfhosted/nightly.yml` | cron 01:00 UTC + manual | self-hosted mac | full `bun test` (unit+parity+integration/MariaDB) + client gate (scripts/ci/client_gate.sh) |
| `.github/workflows-selfhosted/deploy.yml` | manual dispatch | self-hosted mac | **PARKED** — loud failure until DEPLOY_HOST/DEPLOY_SSH_KEY secrets exist, then deploy/deploy.sh |

**Branch:** the workflows used to trigger on `main`, a branch that does not exist
in this repo — `main.yml` therefore NEVER FIRED, and `ci.yml`'s verify job diffed
against a non-existent `origin/main`. Fixed 2026-07-11: everything targets
`master`. Nothing tripwires branch names; re-check them if the default changes.

**Oracle (post-cutover):** `ORACLE_REQUIRED: "1"` is now largely VESTIGIAL. PHP is
decommissioned and `oracleMode()` defaults to `fixtures`, so parity replays the
frozen store credlessly and the live-oracle canary test is skipped. The flag is
kept so that an explicit `ORACLE_MODE=live` run still hard-fails on an absent
oracle instead of silently skipping. Ignore any older text below telling you to
"restart PHP at :8080" — there is no PHP to restart.

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

A GitHub checkout lands in `.../_work/<repo>/<repo>`, so the repo's two
out-of-tree assumptions resolve inside runner-owned space.
`scripts/ci/link_siblings.sh` (idempotent, first step of every self-hosted
job) plants symlinks: `../private` → the real private dir and
`../../v7/master_dedalo` → the real PHP tree. Deliberately
NOT `sync_client.sh`: rsyncing `core/` over checked-out files could mask a
divergence the `client_serving` byte-identity tripwire exists to catch.
Override sources with `DEDALO_CI_PRIVATE_DIR` / `DEDALO_CI_PHP_ROOT`.

**Client libraries are not a sibling path** (2026-07-12). They used to be a
118 MB gitignored `client/dedalo/lib` symlinked out of the PHP tree; they now come
from `bun install` (node_modules), the committed `vendor/` tree, and the
`postinstall` hook `scripts/fetch_client_libs.ts`. So every tier gets them for
free — but note `mocha`/`chai` are **devDependencies**: a runner that installs with
`--production` cannot serve the client test harness. Index of record:
`src/core/client_libs/registry.ts`; gate: `test/unit/client_libs_tripwire.test.ts`.

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

## Security posture (THE hard constraint — now tripwired)

**The repo went PUBLIC. The self-hosted runner must never be attached to it.**

The self-hosted runner executes workflow code with access to the real
`../private/.env` and the live matrix Postgres. On a public repo, **anyone can
fork and open a PR** — and a PR job with `runs-on: [self-hosted, …]` would run
that fork's code on the machine holding the credentials and the real Dédalo
data. That is remote code execution on the data host. GitHub's own guidance is
explicit: do not use self-hosted runners with public repositories.

The old precondition ("acceptable ONLY while the repo is private") was prose,
and prose does not stop a paste. It is now **rule 5 of
`ci_workflow_tripwire.test.ts`**: no `runs-on:` naming `self-hosted` may exist
under `.github/workflows/`. The self-hosted jobs live in
`.github/workflows-selfhosted/`, which GitHub never executes.

Consequence: the DB/parity/client tier does not run on GitHub. Options, in order
of preference — (a) a PRIVATE mirror repo with the runner attached; (b) the
private `gitdedalo` remote; (c) simply `bun run scripts/verify.ts` locally before
pushing. If the repo is ever made private again, retire rule 5 DELIBERATELY (with
a ledger line) rather than deleting it in passing.

Also set, in GitHub repo settings: Actions → General → "Require approval for all
outside collaborators", and restrict allowed actions to GitHub-authored +
`oven-sh/setup-bun`.

## Activation runbook — GitHub (public repo, hermetic tier)

The repo is already pushed (`renderpci/dedalo`, branches `master` + `v7`), so the
old "create the repo and push" steps are gone. What remains is settings work in
the GitHub UI — none of it can be done from the CLI without a token.

1. **Enable Actions**: Settings → Actions → General → Allow all actions, or (better)
   "Allow <owner>, and select non-<owner>, actions" and allowlist `oven-sh/setup-bun@*`
   plus `actions/*`. The workflows only use `actions/checkout`, `actions/upload-artifact`
   and `oven-sh/setup-bun`.
2. **Fork-PR safety**: Settings → Actions → General → Fork pull request workflows from
   outside collaborators → **"Require approval for all outside collaborators"**. On a
   public repo this is the difference between a review and an automatic run.
3. **Do NOT register a self-hosted runner on this repo.** See Security posture. Rule 5
   of `ci_workflow_tripwire` fails the build if a self-hosted job reappears under
   `.github/workflows/`.
4. **Smoke sequence** (proves the wiring, costs nothing):
   - push a branch with a whitespace change, open a PR → `ci / hermetic` runs on
     ubuntu and goes green;
   - add a deliberate biome violation → `hermetic` goes RED; revert;
   - merge to `master` → `main / hermetic` fires (it never did before: it was
     listening on a branch named `main` that does not exist here).
5. **Branch protection** (public repos get this free): Settings → Rules → Rulesets →
   require the `hermetic` status check on `master`, and require a PR to merge.
   Without it, the posture is only "a red run is the alarm".
6. **GitLab mirror**: the same `.gitlab-ci.yml` hermetic tier runs there on shared
   runners — no runner, no secrets needed.

## Activation runbook — the DB tier (PRIVATE mirror)

Only if/when the full suite must run in CI rather than locally:

1. Create a PRIVATE GitHub repo (or use the `gitdedalo` remote); push `master` to it.
2. Move `.github/workflows-selfhosted/*.yml` into `.github/workflows/` **on that mirror
   only**, and restore the real triggers in `selfhosted.yml` (the `pull_request` /
   `push: [master]` lines are commented at the top of its `on:` block).
3. Register the runner there: Settings → Actions → Runners → new macOS/arm64 runner
   into `~/actions-runner-dedalo/` (outside all Dédalo trees), labels `dedalo-mac`,
   name `dedalo-mac-1`. **ONE runner only** — a single slot serializes every
   self-hosted job machine-wide, which is the isolation guarantee for the shared
   scratch DB surfaces. Then `./svc.sh install && ./svc.sh start` (LaunchAgent —
   runs while this user is logged in). Put the pinned bun dir (`~/.bun/bin`) in the
   runner's `.path`; env_guard catches drift regardless. A sleeping Mac queues jobs
   (queued-not-lost); `sudo pmset -a sleep 0` if that matters.
4. GitHub pauses cron schedules after ~60 days of repo inactivity — re-enable
   `nightly` from the Actions tab if it goes quiet.
5. Dispatch `deploy.yml` → the loud PARKED failure is the passing test.
