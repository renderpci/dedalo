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
| `.github/workflows/security.yml` | PR + push master + weekly cron + dispatch | hosted ubuntu | secret scan (gitleaks, digest-pinned image): working tree every run, FULL HISTORY weekly |
| `.github/workflows/codeql.yml` | PR + push master + weekly cron | hosted ubuntu | CodeQL dataflow SAST (javascript-typescript, `build-mode: none`) → Security tab |
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
  --noEmit` + `bun run lint` + the **75** DB-less/sibling-less tripwires + the
  dependency-audit ratchet + the two isolated publication packages
  (`site_builder`, `server_api/v2` — each `bun install` + `tsc` + `bun test`).
  One source of truth: `scripts/ci/hermetic.sh` — GitHub and GitLab both call
  it, so the platforms cannot drift. Every required config key gets a harmless
  stub inside the script; `DB_PORT` points at a closed port so any accidental DB
  touch fails loudly.

  **The hole this closed (2026-08-03):** the list had 20 of the 48 tripwires, and
  the other 28 ran on NO executing tier — the DB/parity tier is parked in
  `workflows-selfhosted/` and the private mirror is not wired. XSS, remote-code,
  agent-egress and write-scope invariants all existed and none of them ran on a
  PR.

  **And why it reopened (2026-08-24):** nothing enforced the list. The index grew
  to 89 gates against the same 41 here, and five more landed the same day — 53
  running nowhere, every gate green throughout. The subset rule only ever checked
  one direction, and its parser was silently truncating at 21 of 41 entries. Both
  are fixed: rule 3c of `ci_workflow_tripwire` requires every tripwire to be wired
  here or to carry a written reason in its `NOT_HERMETIC` map (stale rows red in
  both directions), and the tier went 41 → 75 gates, 648 tests, ~16 s. Each entry
  was empirically re-verified DB-less (`DB_PORT` closed) before being added.
- **Self-hosted** (this Mac — the machine that has the live matrix Postgres
  with real Dédalo data, the PHP oracle at :8080, the sibling PHP tree, and
  Chrome): everything else — the DB-backed unit tier, the parity tier against a
  live oracle, and the client gate (puppeteer + a booted server).

  Two claims that used to live here were stale and are deleted rather than
  amended: unit tests do **not** "read real records" — `test/preload/test_database.ts`
  repoints the suite at a dedicated database and refuses to fall back to the
  application DB, `scripts/test_db_setup.ts` builds it from bytes vendored in this
  repo ("never by copying a live database"), and the generic-`test`-TLD migration
  removed the last dependency on an installation's ontology. And `client_serving`
  does not byte-compare against the sibling PHP tree: since the cutover `client/`
  is the TS-owned primary source, tracked in this repo, so that gate is hermetic
  and now runs on the hosted tier. What genuinely stays here is the ~19 gates that
  need live Postgres, each named with its reason in `NOT_HERMETIC`.

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

- **Least privilege** (rule 7): every workflow declares a top-level
  `permissions:` block. Absent one, the job inherits the REPOSITORY default
  GITHUB_TOKEN scope — historically read/**write** on contents, i.e. ambient push
  rights for every step, third-party actions included, in jobs that write nothing
  back. All of ours are `contents: read`; `codeql.yml` alone adds
  `security-events: write`, which IS its output.
- **Pinned actions** (rule 8): every `uses:` names a 40-hex commit SHA with the
  human version in a trailing comment. `@v5` is a moving tag its owner can
  repoint at any commit, and `workflows-selfhosted/deploy.yml` hands one of these
  actions an SSH deploy key. Dependabot (`.github/dependabot.yml`,
  `github-actions` ecosystem) proposes the bumps, so pinning does not decay into
  running two-year-old actions.
- **CodeQL init and analyze move TOGETHER** (rule 9): both are pinned to one SHA.
  They are two paths in one repo but a single dependency — `init` builds the database
  `analyze` reads, and a major-version split fails the run. **Dependabot cannot see
  this** (it models each action path separately) and proposed exactly that split on
  2026-08-03, PR #77. It will do so again on every codeql-action release: take the
  version, bump both lines, one change. The gate is what makes the mistake loud.

  Dependabot also only scans `.github/workflows/` — the `workflows-selfhosted/` tier
  gets NO update PRs and must be bumped by hand in the same change, or the two tiers
  drift onto different versions of the same action (they did, until 2026-08-03).
- **The secret scanner keeps its default ruleset**: `.gitleaks.toml` must set
  `[extend] useDefault = true`. GitLab loads that same file WHOLESALE through
  `.gitlab/secret-detection-ruleset.toml`, so dropping the line would replace ~170
  upstream provider rules with our two allowlists and report a clean repo on both
  platforms because it stopped looking. Tripwired.
- **Dependency advisories ratchet, never bare-audit**: `scripts/ci/audit.ts` vs
  `engineering/dependency_audit_baseline.json`. A NEW advisory is red; an accepted
  one is data. The tree carried 7 (5 high, all transitive) on the day it was wired
  — a blocking bare `bun audit` would have been red on day one and ignored by
  week two. Accept one deliberately with `--update` and say why in the commit.

## CI seam environment (why CI never collides with interactive dev)

Externally provided values win over `test/preload/session_db.ts` defaults and
over `../private/.env` (readEnv precedence). The jobs and
`scripts/ci/client_gate.sh` set:

| Var | CI value | Protects |
|---|---|---|
| `DIFFUSION_JOBS_TABLE` | `dedalo_ts_test_ci_diffusion_jobs` | live/dev diffusion job queue (scheduler cross-claiming) |
| `DIFFUSION_ACTIVITY_TABLE` | `dedalo_ts_test_ci_activity_diffusion` | live activity rows (the dd1758 starvation class) |
| `SERVER_TCP_PORT` | `4390`+ (client run; set by the runner for the server it owns) | dev server on 3500 |
| `SERVER_UNIX_SOCKET` | scratch path (set by the runner) | `/tmp/dedalo_ts.sock` double-start guard |
| `DEDALO_SESSION_DB_PATH` | scratch sqlite (set by the runner; `bun test` preload mkdtemps its own) | the live session store |
| `DEDALO_TS_STATE_PATH` | scratch json (set by the runner) | real maintenance-mode state |
| `DB_NAME` / `DEDALO_DATABASE_CONN` | the SUITE database (set by the runner) | **the application's records** — the client suite writes through a live server, so its server must be on the test database (`scripts/client_test_server.ts`) |
| `DEDALO_TEST_MEDIA_ROOT` | `../private/test_media/<suite db>` (set by the runner; `bun test` preload sets the same path) | **the installation's media tree** — the same argument one surface over: uploads, derivatives and publication markers made through that server must land in the suite's own tree. The key also ARMS the `.dedalo_test_media` refusal, so an unmarked root writes nothing (`src/core/media/test_media_root.ts`) |

Since 2026-08-19 the client gate sets NONE of these itself: `scripts/client_test_runner.ts`
starts its own server with all of them, so a developer typing `bun run test:client` gets the
same isolation CI gets — including the database. `scripts/ci/client_gate.sh` is a one-line
wrapper kept for the nightly workflow.

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
118 MB gitignored `client/dedalo/lib` symlinked out of the PHP tree. They now come
from just two places: `bun install` (node_modules) and the committed `vendor/` tree.
There is **no install-time fetch step** — no postinstall hook, no network call beyond
the package registry — so no CI tier depends on a third-party host being up. Every
tier gets the libs for free.

One wrinkle: `mocha`/`chai` are **devDependencies**, so a runner that installs with
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
`oven-sh/setup-bun` (the full `uses:` census is: `actions/*`,
`github/codeql-action/*`, `oven-sh/setup-bun`, `webfactory/ssh-agent` — all
SHA-pinned; the secret scanner is not an action at all, it is a digest-pinned
container). Two more settings worth turning on while you are there: **secret
scanning + push protection** (free on public repos — it blocks the push, which the
weekly scan cannot), and **private vulnerability reporting** (the intake
`SECURITY.md` points people at).

### Scanners (added 2026-08-03)

The repo's own tripwires are surgical — a named invariant at a named place — and
that is both their strength and their blind spot: excellent at "the security line
was deleted", blind to "a value reached a sink by a path nobody listed". Two
third-party analyses cover the second half, and neither gates what the tripwires
gate:

- **Secret scanning** (`security.yml`, gitleaks). Working tree on every PR (~7s);
  full history weekly, because a secret committed and later "removed" is still
  published. Config: `.gitleaks.toml`, shared with GitLab. **First full-history
  run (2026-08-03): 178 hits over 38,980 commits, ALL triaged as third-party
  example keys in the deleted PHP `vendor/`+`lib/` trees, public Mapbox `pk.`
  tokens inside commented-out example URLs, and entropy false positives. No live
  Dédalo credential has ever been committed.** The allowlist entries carry that
  triage, so the weekly job starts green and a new hit means something new.
- **CodeQL** (`codeql.yml`, free on public repos). Whole-program taint tracking,
  `security-extended` queryset, vendored/generated paths excluded in
  `.github/codeql/codeql-config.yml` so actionable alerts are not buried under
  alerts in bytes we do not edit. Advisory: its output is the Security tab.

**GitLab is deliberately asymmetric**: it runs its own bundled SAST (Semgrep) and
Secret Detection templates rather than a copy of GitHub's choices. Each host's
scanner is free, maintained and integrated with that host's UI. What must NOT
differ across platforms is the repo's OWN gate — which is why both call one
`scripts/ci/hermetic.sh`.

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
