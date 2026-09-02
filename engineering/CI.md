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

## Running CI's environment locally — `bun run ci:local`

`scripts/verify.ts` proves the code works **on your machine**: ../private/.env loaded, your
Postgres, your libc. The hosted tiers have none of that — `scripts/ci/db_tier.sh` composes
its whole environment in-process precisely so nothing is inherited, and a runner has no
../private/.env at all. Nothing ran the tiers that way locally, so the RUNNER was the first
place the code ever met the runner's environment, and CI became the debugger: ~10 minutes
and a pasted log per iteration.

    bun run ci:local              # every tier, as CI runs them
    bun run ci:local --hermetic   # typecheck + lint + static tripwires + daemon packages
    bun run ci:local --db         # suite build + DB tripwires + unit tier + parity
    bun run ci:local --instance   # suite build + browser client suite + both update drills
    bun run ci:local --keep       # leave the scratch private dir for inspection

It runs `scripts/ci/hermetic.sh`, `scripts/ci/db_tier.sh` and `scripts/ci/instance_tier.sh`
unchanged, with `DEDALO_PRIVATE_DIR` pointed at an EMPTY directory — the runner's
condition, since the tiers create `../private` themselves and it is the FILE's absence
that matters. The one thing it takes from your machine is the Postgres **connection**
(host, port, user, password); every `DEDALO_*` key the tiers need they compose themselves
(`scripts/ci/hosted_env.sh`, one copy sourced by both database tiers), which is the
property under test. The db and instance tiers each drop and rebuild their own
`dedalo_ci_test`, so the suite database `bun run test:db:setup` builds for you is
untouched. On macOS run the instance tier under a short `TMPDIR` (`TMPDIR=/tmp/dd`): the
update drills bind unix sockets there and macOS caps that path at 104 bytes.

WHAT IT CATCHES, and what it does not. It catches the class where the developer environment
supplies something the runner does not — measured 2026-08-31, that was four of twelve
defects found in one day (an unset egress allowlist, a probe that required the private file,
the parity census addressing a database nobody builds, eight config keys the tier never
composed). It does NOT catch the platform-bound class on a Mac — a BSD-only `gzcat`, nginx's
Debian log path, `nginx -t` binding :80, a missing pgvector extension — because those need
Linux. For those, run the same script inside the runner's images. Both remain cheaper than a
push.

`verify` is not replaced by this and stays: it is the developer-environment gate. These are
two different environments and both matter.

## Pipeline map

**Two repos, by trust level.** GitHub is public, so nothing there may target the
self-hosted runner (rule 5); `.github/workflows-selfhosted/` is the PRIVATE
MIRROR's copy of the same steps — GitHub executes ONLY `.github/workflows/`, so
that directory is inert here, preserved for a mirror with the runner attached.

**Every gate has an EXECUTING hosted home (2026-08-25, completed 2026-09-02).**
The gates that need *a* Postgres — as opposed to *the installation's* Postgres —
run hosted, against a throwaway service container, in `.github/workflows/db.yml`.
That became possible once the suite stopped borrowing the developer's database:
the preload repoints to a dedicated one and refuses to fall back, and
`test:db:setup` builds it from bytes vendored in this repo. The `db` job runs the
in-process gates; the `instance` job runs the gates that BOOT A REAL SERVER over
the wire — the browser client suite (`scripts/ci/client_gate.sh`, 133 suites) and
the two code-update drills (`test:update`, `test:update:dev`) — on a FRESH suite
database of its own, because the `db` job's 725-file unit stage pollutes the
fixture the client baseline was measured on. Before the first step, 19 tripwires
ran on NO executing tier; before the second, those three commands were invoked
only from the inert directory and so ran on no CI at all (P0-1 residual of the
2026-08-26 deep audit). `test/unit/tier_wiring_tripwire.test.ts` now holds the
whole wiring: every `scripts/ci/*.sh` is reached from an executing workflow chain
or carries a self-hosted-only reason, every step of the parked tier has a hosted
twin, every stage `scripts/verify.ts` reports is executed by one, and every
`test:*`/`ci:*` package script is run by name on a hosted chain or is local-only
with a reason.

| Workflow | Trigger | Runner | Runs |
|---|---|---|---|
| `.github/workflows/ci.yml` | pull_request + push master/v7 | hosted ubuntu | `hermetic` (scripts/ci/hermetic.sh) |
| `.github/workflows/db.yml` | pull_request + push master/v7 + dispatch | hosted ubuntu + `pgvector` service (digest-pinned), one per job | `db` (scripts/ci/db_tier.sh): builds the suite database from repo-vendored bytes, then the DB-backed tripwires, the unit tier (advisory) and the parity tier; `instance` (scripts/ci/instance_tier.sh): builds its OWN suite database, then the browser client suite (scripts/ci/client_gate.sh) and both update drills (`test:update`, `test:update:dev`). Both source `scripts/ci/hosted_env.sh` |
| `.github/workflows/security.yml` | PR + push master + weekly cron + dispatch | hosted ubuntu | secret scan (gitleaks, digest-pinned image): working tree every run, FULL HISTORY weekly |
| `.github/workflows/codeql.yml` | PR + push master + weekly cron | hosted ubuntu | CodeQL dataflow SAST (javascript-typescript, `build-mode: none`) → Security tab |
| `.gitlab-ci.yml` | MR + default-branch push (GitLab mirror) | GitLab shared runners | hermetic tier only — the SAME scripts/ci/hermetic.sh |
| *— PRIVATE MIRROR ONLY (inert on the public repo; every step twinned hosted, held by tier_wiring_tripwire) —* | | | |
| `.github/workflows-selfhosted/selfhosted.yml` | dispatch (restore PR/push triggers on the mirror) | self-hosted mac | `verify` (scripts/verify.ts --base origin/master — the developer gate; its stages are twinned in hermetic.sh + db_tier.sh) + `full` (bun test test/unit test/parity — the `db` job's unit + parity tiers) |
| `.github/workflows-selfhosted/nightly.yml` | cron 01:00 UTC + manual | self-hosted mac | full `bun test` (unit+parity+integration/MariaDB — the MariaDB legs are the only thing that runs HERE and nowhere else) + client gate (the `instance` job) |
| `.github/workflows-selfhosted/deploy.yml` | manual dispatch | self-hosted mac | **PARKED** — loud failure until DEPLOY_HOST/DEPLOY_SSH_KEY secrets exist, then deploy/deploy.sh |

**Branch:** the workflows used to trigger on `main`, a branch that does not exist
in this repo — the old `main.yml` therefore NEVER FIRED, and `ci.yml`'s verify job
diffed against a non-existent `origin/main`. Fixed 2026-07-11: everything targets
`master`. `main.yml` itself (a push-to-master hermetic) was deleted 2026-09-02 as a
duplicate once `ci.yml` fired on every push to a landing branch. Branch names ARE
tripwired now: `tier_wiring_tripwire` leg G holds every workflow that runs a tier
root to `pull_request` (bare — no `paths`/`branches`/`types` narrowing) plus `push`
to EXACTLY its `LANDING_BRANCHES` constant (`master`, `v7`) — a branch added on one
side and not the other is red — and the GitLab hermetic job to its merge-request +
default-branch rules with no `allow_failure`/`when: manual`. If the branch work
lands on changes, change the constant and the two `on:` blocks together.

**Oracle (post-cutover):** `ORACLE_REQUIRED: "1"` is now largely VESTIGIAL. PHP is
decommissioned and `oracleMode()` defaults to `fixtures`, so parity replays the
frozen store credlessly and the live-oracle canary test is skipped. The flag is
kept so that an explicit `ORACLE_MODE=live` run still hard-fails on an absent
oracle instead of silently skipping. Ignore any older text below telling you to
"restart PHP at :8080" — there is no PHP to restart.

Two tiers, by dependency footprint:

**Suite-database build cost, measured 2026-08-25 (the repo recorded no figure
before):** `scripts/ci/db_tier.sh` end to end is **~907 s (~15 min)** on a warm
developer Mac — of which the install-seed restore is ~5 s (the marker row is
stamped at +5 s) and essentially all the rest is the `test` TLD ontology
materialization plus the 150-TLD hierarchy import. The built database is
**~7.65 GB**. The 19 gates themselves run in ~6 s: this tier is a build with a
test suite attached, not the other way round.

(An earlier note here said ~302 s. That was wrong — it timed the tail of a build
already 120 TLDs in, not the phase. Superseded by the end-to-end run above.) The cost is not the 127 MB of `\copy` input — `matrix_hierarchy`
carries two `AFTER INSERT … FOR EACH ROW` triggers that derive
`matrix_relation_index` (13.9 M rows) and `matrix_string_search` (5.6 M rows).
That is also why a `pg_dump -Fc` cache is NOT a free win: restoring normally
re-fires those triggers *and* loads the dumped derived rows into tables with no
unique constraint — silent duplication, slower than the build it replaces. A
cache would need `pg_restore --disable-triggers` (superuser) and `--no-owner
--no-acl`.

- **Hermetic** (any bare runner, no secrets): `bun install` + `bunx tsc
  --noEmit` + `bun run lint` + `bun run lint:browser` (the shrink-only error
  budget over the browser trees `biome.jsonc` excludes — a green `bun run lint`
  says nothing about them; P1-17) + the **100** DB-less/sibling-less tripwires
  (measured 2026-08-31 from the script itself; the previous figure of 76 had
  drifted) + the crap-ledger append-only check against a FETCHED reference
  (base-branch tip on a PR, first parent on a push — see the ratchets section) +
  the dependency-audit ratchet + the two isolated publication packages
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
  both directions), and the tier went 41 → 76 gates, ~16 s. Each entry
  was empirically re-verified DB-less (`DB_PORT` closed) before being added.
- **Instance** (hosted ubuntu, its own `pgvector` service — the `instance` job of
  `db.yml`, `scripts/ci/instance_tier.sh`): the gates that boot a real server and
  drive it over the wire. The browser client suite (`scripts/ci/client_gate.sh` →
  `bun run test:client`: the runner starts its own server on the suite database,
  logs in for real, pins the diffusion domain and the projects fixture, drives
  Mocha in the system Chrome), then `bun run test:update` and `bun run
  test:update:dev` (`scripts/update_drill.ts`: a real master builds and serves a
  release through the wire, a supervised consumer copy installs it across the
  planned-death restart; the dev channel is the only pass proving the post-swap
  identity story). A fresh suite database per job, because the `db` job's unit
  stage pollutes the fixture the client baseline was measured on. The checkout is
  `fetch-depth: 0` — the drill `git clone`s it, and git refuses a shallow source.
  The drills are configured from `scripts/lib/operator_config.ts` (the private
  file if present, overlaid by the CATALOG keys of the process environment —
  never PATH or a runner token; `update_drill_config_tripwire`), which is what
  lets them run where no `../private/.env` exists. And the release commit is cut
  through `scripts/lib/release_clone.ts` (`git checkout -B`, never `branch -m`):
  a `pull_request` checkout is a DETACHED HEAD (`refs/remotes/pull/N/merge`) and
  `branch -m` refuses it — the drills would die at STEP 1 on every PR run. The
  same gate runs that sequence against a detached scratch source. A tier job
  carries no `if:` and no `continue-on-error:`, `needs:` no job that carries an
  `if:` (a skipped upstream skips the tier, green), and the step's payload is
  EXACTLY `bash scripts/ci/<tier>.sh` — no `|| true`, no `; true`, no `run: |`
  block around it, no `| tee` (the default shell has no pipefail, so the tee's
  status would be the step's) — a conditioned job is silent on the events it
  excludes and a tolerated step is green whatever the tier said
  (`tier_wiring_tripwire` leg F). Inside every reached script each STAGE line
  (`bun …`, `bash scripts/ci/…`) either aborts the script bare under `set -e` or
  raises the accumulator through its `_rc` check; a `|| true` on a stage is red
  (leg H), with ONE reasoned, shrink-only `ADVISORY_STAGES` row for the unit tier
  vs its baseline, whose restore criterion db_tier.sh states.

- **Self-hosted** (the private mirror's Mac): a DUPLICATE of the hosted tiers
  with one addition a hosted runner cannot have — `test/integration/**`'s MariaDB
  legs actually run there (three of its four files are bound to a specific
  installation's records). Everything else it runs is twinned hosted, and
  `tier_wiring_tripwire` refuses a step there that is not.

  **What moved off it:** 2026-08-25, the tripwires that need only *a* Postgres
  (`db.yml`); 2026-09-02, the browser suite and the update drills (the `instance`
  job). The claims that used to justify it — "unit tests read real records", "the
  client gate needs the PHP tree", "a browser needs the Mac" — are all stale:
  ubuntu-latest ships Chrome and the runner already launches it `--no-sandbox`.

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
  week two. A plain `--update` REFUSES an advisory the baseline does not hold
  (compared by KEY, so a swap is a regression); accept one deliberately with
  `--update --allow-regression --reason "<why it is accepted rather than fixed>"`
  — the reason is validated by `scripts/lib/reason_validator.ts` (the ONE
  validator every ratchet shares) and written INTO the entry, where the check
  path and `ratchet_integrity_tripwire` read it; a commit message is read by no
  gate. Neither generator compares against "nothing": a missing baseline makes
  every entry NEW (the flag applies in full) and a conflicted or truncated one
  is REFUSED outright — resolving a merge by running the fix command launders
  nothing. The crap ratchet keeps its history the same way: an append-only
  `ledger` in `engineering/crap_complexity_baseline.json`, born at a line
  pinned in code (`LEDGER_BIRTH`), whose last line `summary` must equal, with
  every non-shrink line reasoned — so a merge resolution that raises the
  counters without the generator, or truncates the history to a fresh opener,
  is red without reading git. Against a REFERENCE commit,
  `bun run scripts/crap_baseline.ts --check --reference <rev>` ALSO proves the
  ledger is append-only line for line and that no per-file entry rose without
  a REASONED appended line — the edits the hermetic predicate cannot see (a
  hand-raised per-file entry with flat counters, or one laundered under an
  unreasoned net-shrink line). That step is a GATE, not a suggestion, and it
  runs in two places that are held paired by `tier_wiring_tripwire` leg C:
  `scripts/verify.ts`'s `crap:ledger` stage (always, against
  `git merge-base HEAD <base>` — `HEAD` itself by default, so an uncommitted
  hand edit is caught on the desk) and the `crap ledger` stage of
  `scripts/ci/hermetic.sh`, which FETCHES its reference rather than assuming
  history on a shallow checkout: the base branch's tip on a pull request (the
  checkout is the merge of the PR onto that tip, so the tip IS the merge-base),
  the first parent on a push. A reference that does not resolve — an empty
  merge-base, a base branch that cannot be fetched, a bare `--reference` — is
  a red run, never a comparison against the index (`ratchet_integrity_tripwire`
  proves that exit code). Both generators read their artifact FIRST,
  before any network or measurement, and `--baseline <path>` points them at a
  scratch copy (`--reference` reads an existing file path the same way) — that
  is how `ratchet_integrity_tripwire` proves the conflict-marker refusal and
  the `--reference` exit code offline, by subprocess; CI never passes a path.

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
wrapper, run by the `instance` job (and named by the mirror's nightly).

The `dedalo_ts_test_` table prefix is schema-enforced. Proven 2026-07-09: the
client gate ran green on :3510 while the dev server served :3500.

## Sibling paths on the runner

A GitHub checkout lands in `.../_work/<repo>/<repo>`, so the repo's two
out-of-tree assumptions resolve inside runner-owned space.
`scripts/ci/link_siblings.sh` (idempotent, first step of every self-hosted
job — and the ONE `scripts/ci` script no hosted chain may run, its reason in
`tier_wiring_tripwire`'s `SELF_HOSTED_ONLY`) plants symlinks: `../private` → the real private dir and
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

Consequence: nothing that needs the DATA HOST runs on GitHub — and since
2026-09-02 nothing the repo gates on does: the database, browser and update-drill
gates run hosted against throwaway services (`db.yml`). The private mirror is an
optional duplicate (plus the MariaDB integration legs), not the home of anything.
If the repo is ever made private again, retire rule 5 DELIBERATELY (with a
ledger line) rather than deleting it in passing.

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
   - merge to `master` → `ci / hermetic` fires again on the push (the old
     `main / hermetic` listened on a branch named `main` that does not exist here;
     it is gone).
5. **Branch protection** (public repos get this free) — OWNER-ONLY, and NOT GATED:
   nothing in the repository can observe a ruleset, so this step is a runbook, not a
   tripwire, and it is written here rather than pretended elsewhere. Settings → Rules →
   Rulesets → on **both** `master` **and** `v7` (development lands on `v7` directly;
   a rule on `master` alone protects the merge and nothing before it): require the
   three status checks `ci / hermetic`, `db / db` and `db / instance`, and require
   a PR to merge. Without it, the posture is only "a red run is the alarm".
   **Periodic check** (owner, with a token; put it in the calendar because no gate
   will fire): `gh api repos/renderpci/dedalo/branches/master/protection` and the
   same for `v7` must list exactly those three contexts under
   `required_status_checks.contexts` — a missing one, or a job renamed without
   the ruleset following, silently turns a required check into an optional one.
   The `instance` job's `timeout-minutes` (60) is a first pin from the `db` job's
   measured build plus the drills' documented runtimes: re-pin it from the first
   green run's wall clock, never from a guess.
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
