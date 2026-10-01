# CI/CD — pipeline map, local gate, invariants, runbooks

CI runs on `renderpci/dedalo` (GitHub), a **PUBLIC** repo whose default branch is
**`master`**; development lands directly on **`v7`**. Both facts shape everything
below (see Security posture). Active since 2026-07-11. Invariants in the workflow
files are enforced by `test/unit/ci_workflow_tripwire.test.ts` (rules numbered in its
header) and `test/unit/tier_wiring_tripwire.test.ts` (legs A–H).

The design in one paragraph: every check CI runs is runnable on the desk **in CI's own
image** before the push leaves (`scripts/hooks/pre-push` → `bun run ci:local
--docker`); ratchet IMPROVEMENTS are banked mechanically before the push
(`bun run baselines:bank`); one command publishes both landing branches to every
remote with the gate run once (`bun run push`); on GitHub each sha is verified once,
not once per branch (the `dedupe` job); and the checks whose input is the CALENDAR,
not the commit, run nightly instead of on the push (`nightly.yml`).

> **ONE IMAGE, EVERY HOST** (landed 2026-09-26): GitHub's hermetic/db/instance jobs
> (`container:`), GitLab's hermetic job (`image:`) and `ci:local --docker` all run the
> build `ci/image.json` locks, by digest, as uid 1001 (`scripts/lib/ci_image.ts`;
> `ci_workflow_tripwire` rule 1b holds every copy equal to the lock and the lock's
> fingerprint equal to the checkout's). Before it only `ci:local` used the image — and a
> LOCAL build of it — so a desk verdict predicted neither host.
>
> **PART 2 PENDING** (not landed — do not describe it as done):
> 1. **Blocking unit tier.** The unit tier stays ADVISORY in `db_tier.sh` (its one
>    reasoned `ADVISORY_STAGES` row in `tier_wiring_tripwire` leg H) until
>    `engineering/unit_baseline.json` is re-recorded IN the image. The jobs already run
>    in it; the baseline was recorded outside it, so blocking now would block on the
>    recording environment, not on the code.

## Pipeline map

GitHub executes ONLY `.github/workflows/`. `.github/workflows-selfhosted/` is the
PRIVATE MIRROR's copy of the parked self-hosted steps — inert here, every step twinned
by a hosted one (`tier_wiring_tripwire` leg B).

| Workflow | Trigger | Runner | Runs |
|---|---|---|---|
| `.github/workflows/ci.yml` | pull_request + push master/v7 | hosted ubuntu, `hermetic` in the CI image (uid 1001) | `dedupe` → `hermetic` (`scripts/ci/hermetic.sh`) |
| `.github/workflows/db.yml` | pull_request + push master/v7 + dispatch | hosted ubuntu, each tier job in the CI image (uid 1001) + a `pgvector` service (digest-pinned) reached as `postgres` | `dedupe` → `db` (`scripts/ci/db_tier.sh`: builds the suite database from repo-vendored bytes, starts the suite MariaDB target, then, in this order, the DB-backed tripwires → the unit tier (advisory — Part 2) → the parity tier → the MariaDB tier (blocking — PUB-05, LAST on purpose: see *CI tiers → DB* below; tier_wiring leg K)) and `instance` (`scripts/ci/instance_tier.sh`: its OWN fresh suite database, then the browser client suite via `scripts/ci/client_gate.sh`, the tool phone contract and both update drills). Both source `scripts/ci/hosted_env.sh` |
| `.github/workflows/nightly.yml` | cron 04:17 UTC daily + dispatch | hosted ubuntu | the TIME-BASED checks the push gate defers: `scripts/ci/audit.ts --force --require-network` with the vendor calendar ON; `image_pin` (`bun run ci:image:pin --check`: the lock is the latest published build); `report` keeps one `ci-nightly` issue open/updated/closed |
| `.github/workflows/ci-image.yml` | push master/v7 touching the image definition + weekly cron (cache OFF) + dispatch | hosted ubuntu-24.04 amd64 + arm64 (native, no QEMU) | builds `ci/Dockerfile`, smoke-tests the exact bytes, pushes `ghcr.io/renderpci/dedalo-ci` (`fp-<fingerprint>`, `<YYYYMMDD>`, `latest`) as a multi-arch manifest list |
| `.github/workflows/security.yml` | PR + push master + weekly cron + dispatch | hosted ubuntu | secret scan (gitleaks, digest-pinned image): working tree every run, FULL HISTORY weekly |
| `.github/workflows/codeql.yml` | PR + push master + weekly cron | hosted ubuntu | CodeQL dataflow SAST (javascript-typescript, `build-mode: none`) → Security tab |
| `.github/workflows/docs.yml` | PR + push master, both narrowed to `docs/**`/`mkdocs.yml` | hosted ubuntu | the mkdocs manual build (not a tier: legs F/G do not bind it) |
| `.gitlab-ci.yml` | MR + default-branch push (GitLab mirror) | GitLab shared runners, in the CI image (digest-pinned, uid 1001) | hermetic tier only — the SAME `scripts/ci/hermetic.sh` |
| *— PRIVATE MIRROR ONLY (inert on the public repo) —* | | | |
| `.github/workflows-selfhosted/selfhosted.yml` | dispatch (restore PR/push triggers on the mirror) | self-hosted mac | `verify` + `full` (`bun test test/unit test/parity`) — both twinned hosted |
| `.github/workflows-selfhosted/nightly.yml` | cron 01:00 UTC + manual | self-hosted mac | full `bun test` (incl. `test/integration/**`, whose MariaDB legs the hosted `db` tier's blocking MariaDB stage also runs, on the suite's own server — PUB-05) + client gate |
| `.github/workflows-selfhosted/deploy.yml` | manual dispatch | self-hosted mac | **PARKED** — loud failure until DEPLOY_HOST/DEPLOY_SSH_KEY exist, then `deploy/deploy.sh` |

**Every gate has an EXECUTING hosted home.** `tier_wiring_tripwire` holds the whole
wiring: every `scripts/ci/*.sh` is reached from an executing workflow chain or carries
a self-hosted-only reason (A); every parked self-hosted step has a hosted twin (B);
every stage `scripts/verify.ts` reports is executed by one (C); every `test:*`/`ci:*`
package script is run by name on a hosted chain or is local-only with a reason (D);
every tier root keeps its independent-stage accumulator and every suite-building job
its own service (E); a tier job is unconditioned except the sanctioned dedupe `if:`,
untolerated and runs EXACTLY `bash scripts/ci/<tier>.sh` (F); every tier workflow fires
on bare `pull_request` and on `push` to exactly `LANDING_BRANCHES` = `master`, `v7`
(G); every stage line carries its verdict (H). Change the branch list in the constant
and the `on:` blocks together.

`scripts/verify.ts` is the DEVELOPER-environment gate (your `../private/.env`, your
Postgres, your libc) and is run by no workflow; its stages are twinned hosted (leg C).
It is not replaced by the CI-environment gate below — two environments, both matter.

### One verification per sha — the dedupe (2026-09-26)

`bun run push` lands ONE sha on both `master` and `v7`, so every push fired `ci` and
`db` twice on identical bytes. Now:

- **Concurrency.** A PUSH run is grouped by its SHA (`ci-<sha>` / `db-<sha>`) and
  never cancelled: the second landing branch's run QUEUES behind the first (a queued
  run bills nothing). A sha has at most two push runs (one per landing branch), so
  the group's single pending slot never evicts one. A pull request keeps the old
  shape — grouped by ref, a superseded run cancelled. Every OTHER event (a `db`
  `workflow_dispatch`) is keyed by its own run id: in the sha group, a newly queued
  run would CANCEL the pending push run whatever `cancel-in-progress` says. Honest
  limit: re-running a finished run while the other branch's run of the sha is still
  pending re-enters the group and would evict that pending run — dispatch `db`
  instead of re-running while one is queued.
- **`dedupe` job** (first job of both files, byte-identical in the two): holds only
  `actions: read`, runs no action and no repository code, and outputs `skip=true`
  iff the event is `push` AND a push run of the same workflow on ANOTHER branch
  CONCLUDED `success` for the same sha. Serialization decides which run defers, not
  run-id order (admission order is not documented to follow run ids): whichever of
  the two starts second skips. Only success is deferred to — never a run in
  progress: a skip is a green check and may only ever stand next to a green one. A
  red, cancelled or missing first run makes the second run in full. An API error
  fails OPEN (`skip=false`). A re-run of a run whose sibling succeeded defers too —
  to force the tiers, use `workflow_dispatch` (`db`) or push a new sha.
- **Tier jobs** `needs: dedupe` with
  `if: ${{ !cancelled() && (github.event_name != 'push' || needs.dedupe.result != 'success' || needs.dedupe.outputs.skip != 'true') }}`.
  `!cancelled()` replaces GitHub's implicit `success()`, so a FAILED or timed-out
  dedupe RUNS the tiers (the dedupe's own red still makes the run red). The only
  skip is a push whose dedupe concluded success AND said `true`; every non-push event
  runs whatever dedupe says. A skipped tier job shows as **skipped**, not red — and a
  required check treats skipped as passing, which is exactly why a broken dedupe must
  never produce one.
- **Gates.** `ci_workflow_tripwire` rule 19 EXECUTES the probe script from the real
  file under bash against a stubbed `gh` (skip only in the one case above, whatever
  the sibling's run id; never for a PR/dispatch/schedule, the same branch, a red or
  running run, another sha; fail-open on API error) and holds the job's shape, its
  identity across the two files, every other job's `needs`, and the concurrency keys
  (ref / sha / run id). `tier_wiring_tripwire` leg F EVALUATES each tier job's `if:`
  over event × dedupe result × output (closed grammar: an optional
  `!cancelled() && ( … )` around `||`-joined `==`/`!=` comparisons; the implicit
  `success()` is modelled, so an unguarded condition — a failed dedupe skipping the
  tier — is red; `always()`, `success()`, a bare `&&`, negation, functions are red).

## The local gate — CI's verdict before the push

Until 2026-09 every check ran only after the push, on the runner, so the runner was
the debugger (~10 min and a pasted log per iteration): a ratchet red on an
IMPROVEMENT nobody banked, an ubuntu-vs-macOS difference, a baseline nobody
re-recorded. The same verdict now happens on the desk.

### `bun run ci:local` — the tier scripts, as the runner runs them

    bun run ci:local                      # HOST mode: every tier on this machine
    bun run ci:local --hermetic|--db|--instance
    bun run ci:local --docker [--hermetic|--db|--instance]   # IN THE CI IMAGE
        [--ref <rev>]        # that commit exactly (no working-tree overlay)
        [--build]            # build ci/Dockerfile locally, not the locked image
        [--base <branch>]    # behave as a pull_request against <branch>
        [--audit-base <sha>] # the push's `before` (the audit's skip base)
    any mode: [--fail-fast]  # stop after the first red tier; the rest report `not_run`
              [--skip-advisory] # skip the db tier's ADVISORY unit stage (desk only; no
                                # workflow sets it — ci_local_native)
              [--summary <file.json>]

It runs `scripts/ci/hermetic.sh`, `db_tier.sh` and `instance_tier.sh` UNCHANGED with an
EMPTY private dir — the runner's condition; every `DEDALO_*` key the tiers need they
compose themselves (`scripts/ci/hosted_env.sh`), which is the property under test.

- **Host mode** borrows only the Postgres CONNECTION from your machine. It catches the
  class where the developer environment supplies something the runner does not
  (measured 2026-08-31: four of twelve defects in one day). It cannot reproduce the
  platform: libc, GNU vs BSD userland, media tools, the browser, the uid. On macOS run
  the instance tier under a short `TMPDIR` (`TMPDIR=/tmp/dd`; the drills bind unix
  sockets and macOS caps the path at 104 bytes).
- **`--docker`** runs the tiers inside the CI image (`ci/Dockerfile`) via
  `ci/compose.yml`: db/instance against the SAME pgvector digest `db.yml` pins, reached
  by its name `postgres` (`DB_HOST=postgres`) as a hosted container job reaches it;
  hermetic with no database at all;
  every tier command as the unprivileged `runner` user (uid 1001, the hosted runner's).
  Nothing is read from `../private`. The tree judged is the working tree made into one
  commit on HEAD, or `--ref` exactly; the host repo is mounted read-only. It runs as a
  push to the host's current branch (`GITHUB_REF`, the checkout's branch name), a
  detached HEAD as a push to `master`; `--base` makes it a `pull_request` instead.
- **The image**: the LOCKED build (`ci/image.json`), pulled once and run by digest —
  the bytes GitHub and GitLab run (an Apple-Silicon Mac gets the arm64 half of the same
  multi-arch build). Only while `ci/Dockerfile`/`.bun-version` differ from the lock's
  fingerprint (a definition not yet published) is `dedalo-ci:local` built from
  `ci/Dockerfile` instead, and the run says so; `--build` forces that. The label is
  verified before a tier starts.
- **The audit base** (`--docker`, push shape only): the push's `before`, which
  `hermetic.sh`'s dependency audit diffs against (`DEDALO_CI_AUDIT_BASE`). `--audit-base`
  wins — all zeros or a sha this clone never fetched passes through and the audit RUNS
  (the safe direction); default: merge-base of the tree under test with the host
  branch's `@{upstream}`, none → the audit runs. Never HEAD/HEAD^. Refused together
  with `--base` (a PR diffs against its target).
- **Verdicts.** Each tier is `green`, `red` or `not_run`; stages are parsed from the tier
  scripts' own `== <tier>: …` lines (`green`/`red`/`skipped`/`advisory`; a red or advisory
  stage carries its fix hint). `--fail-fast`: once a tier is red the run is red whatever follows, so
  later tiers are not run — REPORTED `not_run` in the summary and the JSON, never
  silently absent (`ci_local_native`). `--summary` writes
  `{mode, tiers:[{tier, verdict, exit_code, duration_s, stages}]}`. Exit: 0 green,
  1 red, 2 could not run (no docker/image/Postgres, bad arguments).

### `bun run baselines:bank` — improvements banked mechanically

Most ratchets are red in BOTH directions: growth is a regression, and a count that FELL
without being re-frozen is a stale entry that would let debt climb back. That second
rule is right — and it was the largest single cause of red CI. The bank runs the
improvement direction mechanically and keeps refusing the other exactly as loudly:

- every registered ratchet prints one verdict under `--check --json`
  (`scripts/lib/ratchet_check.ts`: `{ratchet, baselines, improvements, regressions}`);
- improvement-only → the ratchet's OWN flagless writer runs (which independently
  refuses growth — two locks), then the check must come back clean;
- any regression → nothing is written for that ratchet, exit 1, and the deliberate
  path is named (`--allow-regression --reason "…"` where that writer takes one). The
  bank has NO such flag: accepting debt is never automatic.
- exit 0 no drift · 3 improvements written (commit them) · 1 regression / error.
- `--with-db` also measures the unit + parity red baselines; `--with-network` the
  advisory baseline (removals only — its home is the nightly). The registry is TOTAL:
  `baseline_registry_tripwire` discovers every baseline a gate reads and fails on one
  missing from the bank's `REGISTRY` (unbankable ones carry a reason).

### `scripts/hooks/pre-push` — the gate git runs

Installed by `bun install` (`package.json` `prepare` sets `core.hooksPath=scripts/hooks`
in a developer checkout; a no-op in CI, the image and a release tree). The header of
`scripts/hooks/pre-push` is the full contract; gate: `pre_push_gate_native` (by outcome,
against local bare remotes with stubbed bank/ci:local). For the pushed refs it:

0. requires that what is pushed IS the checkout (every pushed ref with new commits
   points at HEAD; no tracked file differs from HEAD). Untracked files are only noted:
   neither the bank nor the tiers see them;
1. runs `baselines:bank -- --ephemeral` in a throwaway `git worktree` of the pushed
   commit (the checkout's `node_modules` — real or symlinked, as a linked worktree's
   is — lent in by symlink). Exit 3 commits the banked files there as
   `chore(baselines): bank improvements`, fast-forwards the checkout onto it
   (`--ff-only`: never over a local untracked file) and stops the push (git cannot add
   a commit to a push in progress; re-run it). Exit 1 blocks, reported as ERROR (a
   check that could not run — usually the environment) when the bank printed one,
   else as REGRESSED with the `--allow-regression --reason` path;
2. runs `ci:local --docker --fail-fast --hermetic --ref <sha> --audit-base <base>
   --summary <file>` — blocks on red, listing each red stage `✗` (advisory `!`) with
   its fix hint; with `--fail-fast` a red tier ends the run and the later tiers are
   `not_run`, so a red hermetic does not wait for db + instance;
3. adds `--db --instance` unless every file the pushed range touches (renames count
   both paths; a merge is diffed against its first parent; >500 new commits or a URL
   remote count as everything) is in its `HERMETIC_ONLY_PATHS` allow-list (anything
   unlisted selects the full gate), or always with `DEDALO_PREPUSH=full`. With them
   goes `--skip-advisory`: the db tier's ADVISORY unit stage (~5 min) cannot change the
   verdict, so the desk skips it; the runner still runs it on every push.

**The audit base is the remote's sha**, per ref as git hands it: one gated remote sha
this clone has → that sha; a new branch (`000…`), an unfetched remote tip, or gated refs
whose remote tips differ → FORCED (`--audit-base 000…`, the audit runs, as GitHub runs
it for a new branch). Never ci:local's `@{upstream}` fallback, which is another remote's
state.

**The repository is discovered, never inherited**: git exports `GIT_DIR` into a hook run
from a LINKED worktree, and a caller may export its own; once the pushing checkout is
resolved every `git rev-parse --local-env-vars` variable is unset, so the bank worktree's
diff/add/commit act on the bank worktree, never on the pushing branch. A checkout that
cannot then rediscover the same git dir is refused.

A GREEN verdict is remembered in `$(git rev-parse --git-path dedalo-prepush-green)` as
`<sha> <level> audit:<forced|base>` (last 50): reused only for the same sha, a covering
level (full answers hermetic) and the SAME audit base — or a forced audit, which answers
any base — and only on a clean tree. A red is re-measured every time. So a sha pushed to
several remotes (or two refs in one push) is gated once. **Docker is required** — there
is no silent skip; the visible bypass is `git push --no-verify` (CI still runs). Exit:
0 push proceeds · 1 red / refused · 3 improvements banked, re-run the push.

### `bun run push` — publish both branches, gated once

Aligns `v7` and `master` on one commit (fast-forward either way; DIVERGED branches are
refused — a merge is a decision, not a push step), runs the pre-push gate ONCE with the
stdin git would hand it (remote tips from `git ls-remote`), re-aligns and re-gates by
itself when the bank committed improvements (exit 3), then pushes both branches to every
remote (`gitdedalo`, `github`, `gitlab`) with `--no-verify` — the gate already ran on
exactly these shas. `--dry-run` prints the plan. No flag skips the gate.

### The banking flow, end to end

    edit → commit → bun run push
      → pre-push: baselines:bank (worktree of the pushed sha)
          improvement-only → commit "chore(baselines): bank improvements" → exit 3
          → push.ts re-aligns + re-gates (bounded)
          regression → exit 1 (nothing written; the reasoned path is named)
      → ci:local --docker --fail-fast (hermetic; + db/instance unless provably hermetic-only)
      → git push --no-verify to every remote
      → GitHub: ci/db on master (runs) + on v7 (queues, then dedupe → skipped)

## Tiers

- **Hermetic** (`scripts/ci/hermetic.sh` — GitHub AND GitLab call it, so the platforms
  cannot drift; no secrets, no DB): `bun install`, `bunx tsc --noEmit`, `bun run lint`,
  `bun run lint:browser` (the shrink-only budget over the browser trees `biome.jsonc`
  excludes), every DB-less tripwire (the list is the script's; rule 3c of
  `ci_workflow_tripwire` requires every tripwire in `scripts/verify.ts` to be wired here
  or assigned to the DB tier with a reason in `NOT_HERMETIC` — stale rows red both
  ways), the crap-ledger append-only check against a FETCHED reference, the
  dependency-audit ratchet (only when the push changed its inputs — see Time-based
  checks), and the two isolated publication packages (`site_builder`,
  `server_api/v2`: install + tsc + test). Required config keys get harmless stubs;
  `DB_PORT` points at a closed port so any accidental DB touch fails loudly. No
  hermetic gate starts a server: `suite_mariadb_target_native` (which drives the lane's
  own `mariadbd`) is a DB-tier gate (`NOT_HERMETIC` row + `DB_TIER_TRIPWIRES`).
- **DB** (`db` job, `scripts/ci/db_tier.sh`): builds the suite database from bytes
  vendored in the repo (`scripts/test_db_setup.ts`; the `test` TLD ontology, the
  hierarchy copies; it stamps `dedalo_test_marker`), then the DB-backed tripwires
  (`DB_TIER_TRIPWIRES` = `NOT_HERMETIC` exactly), the unit tier (ADVISORY vs
  `engineering/unit_baseline.json` — Part 2), the parity tier, and LAST the MariaDB tier
  (BLOCKING — `scripts/ci/mariadb_tier.ts`, see *Suite MariaDB target* below). Last
  because its leg 1b re-runs ~170 Postgres-writing unit and parity files in one extra
  batch: before parity, that extra pass would move the suite database away from the state
  the unit and parity baselines were recorded in (one unit pass, then parity). The order
  is gated, not described: tier_wiring leg K executes every root that runs the stage
  (commands stubbed) and reds any command recorded after it but the EXIT trap's stop
  (mutation H1 — the stage moved ahead of the tripwires — left every other gate green). Before the tripwires it
  starts the suite MariaDB target (`scripts/ci/suite_mariadb.ts start`, stopped by an
  EXIT trap that tier_wiring leg J EXECUTES: a later `trap … EXIT` replacing it, or one
  set after the start, is red) and installs `publication/server_api/v2` for the API
  smoke. The service image is
  `pgvector/pgvector` (the RAG store needs `CREATE EXTENSION vector`), digest-pinned.
  Measured build cost (2026-08-25, warm Mac): ~15 min end to end, ~7.65 GB database,
  gates ~6 s — dominated by the per-row triggers deriving `matrix_relation_index` and
  `matrix_string_search`; that is also why a `pg_dump` cache is not a free win
  (re-fired triggers + duplicated derived rows).
- **Instance** (`instance` job, `scripts/ci/instance_tier.sh`): its own FRESH suite
  database (the unit stage pollutes the fixture the client baseline was measured on),
  then the browser client suite (`scripts/ci/client_gate.sh` → `bun run test:client`:
  own server on the suite DB, real login, pinned diffusion domain + projects fixture,
  Mocha in the system browser), `bun run test:tools:phone` (every tool at 360×740, same suite
  server door) and `bun run test:update` / `test:update:dev` (a real
  master builds and serves a release; a supervised consumer copy installs it across the
  planned-death restart). The checkout is `fetch-depth: 0` (the drills `git clone` it);
  the release commit is cut with `git checkout -B` (a PR checkout is a detached HEAD).
  Drill config comes from `scripts/lib/operator_config.ts` (catalog keys of the process
  env; `update_drill_config_tripwire`).
- **Self-hosted** (private mirror's Mac): a duplicate of the hosted tiers. Everything it
  runs is twinned hosted — including the `test/integration/**` MariaDB legs, which ran
  nowhere else until PUB-05 moved them onto the suite's own MariaDB server and into the
  DB tier's blocking MariaDB stage.

### Suite MariaDB target (PUB-05, 2026-09-30)

MariaDB is the fourth suite-owned surface, beside the suite Postgres database
(`dedalo_test_marker`), the media root (`.dedalo_test_media`) and the vector database
(`dedalo_test_rag_marker`). Before it, a test process reached the INSTALLATION's MariaDB
(`DEDALO_DIFFUSION_DB_SOCKET` from `../private/.env`): a developer run created and
dropped tables in a real publication database, and a runner without that socket skipped
every live leg GREEN.

- **Per lane.** The lane (`testDatabaseName()`) keys a root
  `../private/test_mariadb/<suite db>/` (marked `.dedalo_test_mariadb`; datadir, pid,
  logs, `acquisitions.ndjson`) and a socket `/tmp/dedalo_tmdb_<sha256(root)[:12]>/s`
  (dir 0700 — macOS caps a socket path at 104 bytes). The server runs
  `--skip-networking`, so the filesystem is the access control.
- **Armed by a preload.** `test/preload/suite_mariadb.ts` sets `DEDALO_DIFFUSION_DB_*`
  (the lane socket, the suite user, a blank host/port) in EVERY `bun test` process,
  unconditionally and without I/O. Nothing exports them in CI.
- **Acquired, never skipped.** A MariaDB gate calls
  `requireSuiteMariadb(import.meta.path, databases)` in `beforeAll`
  (`test/helpers/suite_mariadb.ts`): the names must be `database` nodes of the
  registered situations (zzd, zzdif) — an installation's database is refused by name;
  the process must be armed; the server is installed/started/provisioned; each
  database's marker row, read through the engine's `getTargetPool`, must name this
  lane. It throws otherwise, and appends an acquisition row when it does not.
- **Grants = production posture.** The diffusion user has
  `SELECT,INSERT,UPDATE,DELETE,CREATE,ALTER,DROP,INDEX` per target database, no global
  privilege, no CREATE DATABASE, and SELECT only on `dedalo_test_mariadb_marker.targets`
  (so the marker cannot be forged). Every ensure self-checks errno 1044 / 1142. Two
  control databases (`zzd_unmarked_control`, `zzd_foreign_marker_control`) are granted
  but refused by the classifier. A third, `zzd_granted_absent`, is granted (no CREATE)
  and never created: the one name that answers errno 1049, since every ungranted
  absent name answers 1044 first. The engine's 1049 branch is gated on it.
- **The stage.** `scripts/ci/mariadb_tier.ts` runs `test/integration/**` (minus the
  shrink-only `INSTALL_BOUND_EXEMPT`) plus every `test/unit` file that imports the
  helper at runtime (resolved by Bun's transpiler, not a regex), EACH FILE IN ITS OWN
  `bun test`, and requires per file: reported, >0 cases, 0 skipped, 0 failed, >0
  assertions, an acquisition row; and that the rows the SUITE USER changed during THAT
  file's run (`information_schema.USER_STATISTICS`, `--userstat=1`: inserted, deleted,
  updated) match its declared `ROW_CONTRACT` row — every counter it declares rises, a
  declared reader moves none. Per file because a set-wide sum rose whenever the
  helper's own gate (which writes rows to prove the measure) passed, whatever the
  product gates wrote. Not global `Com_*`: those count statements dispatched by anyone,
  including the helper's root provisioning and its refused self-check insert
  (measured). The measure is CALIBRATED live on every run: a planted file that only
  acquires must move it by exactly 0, one that inserts, updates and deletes a row by
  more than 0. A measure that cannot be read is a structured fault in the same report.
- **The no-contact population.** Every `test/unit` and `test/parity` file (the preload
  arms both) OUTSIDE the set whose runtime
  import closure reaches `src/diffusion/targets/mariadb/db.ts` (the module that opens
  pools) is derived — transitively, through `test/helpers`, `src` and `tools`, static and
  literal dynamic imports, crossing the reasoned `SEAM_EDGES` of the product modules
  that import by a computed path (the tool loader, the boot warm-up; an unlisted one is
  red) — and RUN in one armed batch with the suite server up (173 files: 136 unit + 37
  parity, measured 2026-09-30; parity replays the frozen fixtures, credless). The suite user's CONTACTS (`TOTAL_CONNECTIONS` + `DENIED_CONNECTIONS`)
  must not move; a non-zero batch is re-run file by file and each file that opened a
  pool without acquiring is named with its import chain; a contact no single file
  reproduces reds the batch itself (fail-closed: an order-dependent or late contact is
  bisected, never passed). Every population file must RUN ≥1 case — reported, not all
  skipped (bun's `tests` counts skipped cases), and ≥1 assertion executed (a file whose
  `beforeAll` threw reports one failed `(unnamed)` case and 0 assertions: it never ran) —
  unless a reasoned, shrink-only `NO_CONTACT_IDLE` row (the three live-PHP-oracle parity
  differentials) says why it runs nothing by construction; a row whose file runs, or left
  the population, is red. Partial skips are printed, not judged; pass/fail is the unit /
  parity tier's verdict. The contact measure has its own
  live calibration: a file that imports the pool module and opens nothing moves it by
  exactly 0; one that opens a pool unacquired (after proving it is armed at a live
  socket) by more than 0 — which also proves the child is armed. Not closed here: a
  contact made only in a situation the suite database does not hold, and a test-side
  computed import.
- **Bun's TCP fallback.** Measured: the `mariadb` adapter given a socket path that does
  not exist connects to `localhost:3306` instead. The helper checks the socket exists
  before any pool opens and its CLI forces `--protocol=socket`, so a gate that acquires
  through `requireSuiteMariadb` never meets the fallback. Arming does NOT close it for
  other `getTargetPool` callers while the lane server is down; only the engine seam
  PUB-05b (`buildTargetOptions` refusing a socket that is not a unix socket;
  `DEDALO_TEST_DIFFUSION_DB_SOCKET`) does.
- **Lifecycle.** The server is detached and outlives the `bun test` that started it.
  `scripts/ci/suite_mariadb.ts stop` ends it; `sweep` also deletes the lane root (only a
  root carrying `.dedalo_test_mariadb`). Ensure/stop are serialized per lane by a
  kernel-released `flock` on `<root>/.lock`, so a killed run leaves no stale lock; a
  stop issued while another process holds it waits (`suite_mariadb_target_native`
  leg j). A sweep stops the server AND renames the root off its path (same directory,
  atomic) under that lock, then deletes it marker-last: the lane path is marked until
  the instant it is absent (leg k), a process queued on the lock is told the lane was
  swept instead of holding a lock over it — every flock is re-validated against the
  current `.lock` inode (leg l) — and a killed sweep's `.<lane>.swept-…` leftover is
  collected by the next one (leg m). Every client call and the installer have a
  deadline, so a hung one cannot hold the lane lock (leg n); a waiter's lock wait is
  DERIVED from those deadlines (the holder's worst ensure plus a margin), so it reports
  the holder's real failure, never "lock held" (leg q). A start that misses its deadline
  stops the server it spawned (leg o); a server that ANSWERS with a server-side error
  (1040, 1045…) is alive and is surfaced, never restarted (leg p). The lane root is
  claimed atomically — built marked under `.<lane>.claim-<pid>-<n>`, then renamed onto
  its path — and a dead claimer's temp is collected by the next sweep (leg r). Before it
installs, starts on or sweeps a datadir, the holder FENCES it: every process whose command
line names that datadir is stopped, not only the pid-file server — an installer orphaned
by a killed holder, a stray server (leg t) — and a stop returns only once the process is
gone, SIGKILL included, or throws naming the survivor (leg s).
  `sweepSuiteMariadbLanes(match)` (`test/helpers/suite_mariadb_lanes.ts`) sweeps every
  marked lane root a matcher names — the shard runner's teardown for its
  `<template>__shard<N>` lanes: `sweepShardClones` (`scripts/lib/test_shard_db.ts`) calls
  it at the entry sweep, the exit sweep and `--sweep`. An unmarked lane root at a shard
  name is REFUSED and a marked one whose sweep fails is a FAILURE with its real error —
  each refuses the run and makes `--sweep` exit non-zero, through ONE pure verdict,
  `sweepBlockers` (`shard_mariadb_sweep_native`, a DB-tier tripwire, which sweeps only a
  probe template it built, never the lane's own).

Locally (needs `mariadbd`, `mariadb-install-db`, `mariadb`; without them the MariaDB
gates are RED, not skipped):

```sh
export DEDALO_TEST_DATABASE=<app db>_test_l3        # the lane key
bun run scripts/ci/suite_mariadb.ts start           # optional: a gate's beforeAll starts it too
bun test --timeout=30000 test/integration/diffusion_mariadb.test.ts
bun run scripts/ci/mariadb_tier.ts                  # the blocking stage, as CI runs it
bun run scripts/ci/suite_mariadb.ts stop            # the server outlives bun test until stopped
```

Every tier root keeps the independent-stage accumulator: each STAGE line aborts bare
under `set -e` or raises `tier_status` (leg H); a `|| true` on a stage is red, with ONE
shrink-only `ADVISORY_STAGES` row (the unit tier), whose restore criterion `db_tier.sh`
states. A root that starts the suite MariaDB must stop it on exit (leg J, executed with
stubbed commands: to the end, and SIGTERMed at the first start), and a root that runs
the MariaDB stage runs it LAST (leg K, the same stubbed run).

### Time-based checks — the nightly (2026-09-26)

Three inputs of the dependency-audit ratchet change with the CALENDAR, not the commit:
the `bun audit` registry, the GitHub advisory feed, and the vendored trees' review
windows / acceptance expiries (`vendor/vendor_manifest.json`). On the push gate they
made the same sha green on Monday and red on Tuesday, landing on whoever pushed next.
So `hermetic.sh` runs `audit.ts --changed-since <base>` (only when a lockfile, a
`package.json`, `vendor/` or the audit's inputs changed — the base is the push's
`before`, covering EVERY pushed commit; rule 18 executes that resolution) and runs the
vendor tripwire's tree-only legs (`DEDALO_VENDOR_DATED_CHECKS=0`). `nightly.yml` runs
the whole thing daily, forced, network-required, calendar ON; its red is the run's red,
and the `report` job — the ONE job holding `issues: write`, running no repository code
— keeps a single `ci-nightly` issue: opened/updated when red or when a window closes
within 21 days (warning), closed when green. Rule 17 holds the pair: a deferral with no
nightly home that can fail and report is red. The ratchet itself (DEC-12) is unchanged.

### The CI image (`ci/Dockerfile`, `ci-image.yml`)

One definition for the desk and both hosts: bun at `.bun-version`,
postgresql-client-18, the media tools (ffmpeg, ImageMagick 7, poppler, ghostscript,
rsvg), MariaDB, chromium, git/zip/jq; the fingerprint (sha256 of `ci/Dockerfile` ++ `.bun-version`) in
`/etc/dedalo-ci-image` and the `org.dedalo.ci.fingerprint` label. `ci-image.yml`
publishes on a push that moved the definition, weekly with the layer cache OFF (the
updater for the distro half — a cached rebuild would republish old packages forever) and
on dispatch; never on `pull_request` (publishing needs `packages: write`, which a fork
must never reach). Dependabot's `docker` and `docker-compose` ecosystems (directory
`/ci`) propose the base-image and `ci/compose.yml` pin bumps. The `pgvector` digest is
held in THREE places — `db.yml`'s two services and `ci/compose.yml` — bump them in one
change (Dependabot does not see workflow services, so its `/ci` PR moves only the compose
copy). Gate: `ci_workflow_tripwire` "every pgvector image in the workflows equals
ci/compose.yml's digest" turns that PR red until the workflow pins follow.

**The pin** (`ci/image.json` + the literal digest in `ci.yml`, `db.yml`,
`.gitlab-ci.yml`). `bun run ci:image:pin` is its updater: it resolves the digest
`ci-image.yml` published for the checkout's fingerprint and rewrites the lock and every
literal in one diff. What each place asserts (`ci_workflow_tripwire` rule 1b):

- **IN the image** (every tier, every host): `/etc/dedalo-ci-image` = the checkout's
  fingerprint — the tier runs in an image of THIS definition.
- **Every host's literal** = the lock's digest, as uid 1001; the lock's freshness is
  nightly's `image_pin` (`ci:image:pin --check`), which reports into the `ci-nightly`
  issue.

So a `ci/Dockerfile`/`.bun-version` change (a hand edit or Dependabot's `/ci` docker PR)
flows: the local gate builds the new definition (`ci:local` sees the lock is behind and
builds `dedalo-ci:local`) and is GREEN, so the push lands; `ci-image.yml` publishes it;
the hosts, still on the locked older build, are RED on rule 1b until `bun run
ci:image:pin` is committed — that red is the pin-me signal, not a failure of the change.
(Merge a Dependabot `/ci` PR locally and push through the gate; on GitHub it is red by
construction — its tiers run the locked, older image.) Run the updater also when the
nightly `image_pin` is red: the weekly no-cache rebuild published distro security fixes
the lock does not take yet. (Rule 1b asserted `lock == checkout` until review on
2026-09-26 found it deadlocked the push that publishes a new definition.)

## Non-negotiables (each is tripwired)

- **Bun pin**: every tier runs the CI image `ci/image.json` locks, whose fingerprint
  must equal sha256(`ci/Dockerfile` ++ `.bun-version`) — the image installs exactly
  `.bun-version`; the remaining `setup-bun` steps pin `bun-version-file: .bun-version`;
  `scripts/ci/env_guard.sh` re-checks the actual binary. Never fix a mismatch by
  editing the pin in CI — fix the runner.
- **Oracle flag (post-cutover, largely vestigial)**: PHP is decommissioned and
  `oracleMode()` defaults to `fixtures`, so parity replays the frozen store credlessly.
  Self-hosted parity/verify jobs still set `ORACLE_REQUIRED: "1"` so an explicit
  `ORACLE_MODE=live` run hard-fails on an absent oracle instead of skipping. There is no
  PHP server to restart.
- **ONE self-hosted runner, ever** (private mirror): a single slot serializes every
  self-hosted job machine-wide — the isolation guarantee for shared scratch surfaces.
- **GitLab runs no DB tier.**
- **Least privilege** (rule 7): every workflow declares a top-level `permissions:`
  block, read-only; a job widens only itself — `dedupe` (`actions: read`), nightly's
  `report` (`issues: write`), ci-image's publishers (`packages: write`), codeql
  (`security-events: write`). `write-all` and `contents: write` are red;
  `pull_request_target`/`workflow_run` are forbidden.
- **No expression in a `run:` script** (rule 7d): inputs, `github.event.*`, secrets and
  job/step outputs reach a script through `env:`.
- **No secret in `.github/workflows/`** (rule 11): a fork PR must find nothing. The
  runs that need a token use the run's own `github.token`.
- **Pinned actions** (rule 8): every `uses:` is a 40-hex SHA with the version in a
  trailing comment; Dependabot (`github-actions`) proposes bumps. It scans only
  `.github/workflows/` — bump `workflows-selfhosted/` by hand in the same change
  (rule: one action, one SHA across both tiers).
- **Pinned images** (rule 12): every `image:` and `container:` is digest-pinned.
- **CodeQL init and analyze move TOGETHER** (rule 9): one SHA. Dependabot models them as
  two and WILL propose the split (it did, PR #77); take the version, bump both.
- **The secret scanner keeps its default ruleset**: `.gitleaks.toml` sets
  `[extend] useDefault = true` (GitLab loads the same file wholesale).
- **Dependency advisories ratchet, never bare-audit**: `scripts/ci/audit.ts` vs
  `engineering/dependency_audit_baseline.json`. A NEW advisory is red; an accepted one
  is data. A plain `--update` REFUSES an advisory the baseline does not hold (compared
  by KEY); accept one with `--update --allow-regression --reason "…"` — validated by
  `scripts/lib/reason_validator.ts` and written INTO the entry. A missing baseline makes
  every entry NEW; a conflicted or truncated one is refused.
- **The crap ledger is append-only**: `engineering/crap_complexity_baseline.json`'s
  `ledger`, born at `LEDGER_BIRTH`, last line = `summary`, every non-shrink line
  reasoned. `crap_baseline.ts --check --reference <rev>` proves append-only line for
  line against a reference: `verify.ts`'s `crap:ledger` (merge-base with the base) and
  `hermetic.sh` (FETCHED: the base tip on a PR, the first parent on a push), paired by
  leg C. An unresolvable reference is red, never a comparison against the index.

## CI seam environment (why CI never collides with interactive dev)

Externally provided values win over `test/preload/session_db.ts` defaults and over
`../private/.env` (readEnv precedence).

| Var | CI value | Protects |
|---|---|---|
| `DIFFUSION_JOBS_TABLE` | `dedalo_ts_test_ci_diffusion_jobs` | the live diffusion job queue |
| `DIFFUSION_ACTIVITY_TABLE` | `dedalo_ts_test_ci_activity_diffusion` | live activity rows |
| `SERVER_TCP_PORT` | `4390`+ (set by the client runner) | the dev server on 3500 |
| `SERVER_UNIX_SOCKET` | scratch path (runner) | the `/tmp/dedalo_ts.sock` double-start guard |
| `DEDALO_SESSION_DB_PATH` | scratch sqlite (runner; `bun test` preload mkdtemps its own) | the live session store |
| `DEDALO_TS_STATE_PATH` | scratch json (runner) | real maintenance-mode state |
| `DB_NAME` / `DEDALO_DATABASE_CONN` | the SUITE database (runner) | the application's records |
| `DEDALO_TEST_MEDIA_ROOT` | `../private/test_media/<suite db>` (runner and preload) | the installation's media tree; the key also ARMS the `.dedalo_test_media` refusal |
| `DEDALO_DIFFUSION_DB_SOCKET` / `_USER` / `_PASSWORD` / `_HOST` / `_PORT` | `bun test` ONLY: the lane's suite MariaDB socket, its suite user, blank host/port — set by `test/preload/suite_mariadb.ts`, which OVERRIDES any externally provided value (the exception to the precedence rule above). NOT yet the client suite's server (see below) | the installation's MariaDB publication databases |

`scripts/client_test_runner.ts` starts its own server with all of these EXCEPT the
`DEDALO_DIFFUSION_DB_*` row, so `bun run test:client` on a desk gets the isolation CI
gets for everything but MariaDB: its server still resolves `DEDALO_DIFFUSION_DB_*` from
`../private/.env`, i.e. the installation's MariaDB, until `scripts/client_test_server.ts`
composes `suiteMariadbEnvironment` and starts the lane's server first (arming alone is
not enough: an absent socket falls back to TCP `localhost:3306`). Held as a tethered
PENDING row, `CLIENT_SERVER_MARIADB_PENDING` in `suite_mariadb_target_native` leg (u): the
leg composes the server's environment and goes red the day it is armed while the row still
stands, so the row and this paragraph leave together. The `dedalo_ts_test_` table
prefix is schema-enforced (rule 14 extracts the engine's own guard regex).

## Sibling paths and client libraries

`scripts/ci/link_siblings.sh` (first step of every self-hosted job, and the one
`scripts/ci` script no hosted chain may run — `SELF_HOSTED_ONLY` in
`tier_wiring_tripwire`) symlinks `../private` on the mirror's runner. Override with
`DEDALO_CI_PRIVATE_DIR`. Client libraries are not a sibling path: they come from
`bun install` and the committed `vendor/` tree, with no install-time fetch. `mocha`/`chai`
are devDependencies — a `--production` install cannot serve the client harness. Index:
`src/core/client_libs/registry.ts`; gate: `client_libs_tripwire`.

## Deploy (PARKED)

No staging/production server exists yet. `deploy/deploy.sh` is written and reviewed but
has NEVER run against a real host: git-based deploy, pinned-bun `install
--frozen-lockfile --production`, `systemctl restart dedalo-ts`, `/health` wait over the
unix socket, automatic rollback on red health. Boot migrations run inside the server
(`engineering/PRODUCTION.md`). Unparking: provision per `PRODUCTION.md` + `deploy/`
units and run `STAGING_VALIDATION.md` once; set `DEPLOY_HOST` + `DEPLOY_SSH_KEY` and the
`staging`/`production` environments (manual approval on production); the first dispatch
against staging IS the deploy.sh test.

## Security posture (THE hard constraint — tripwired)

**The self-hosted runner must never be attached to the public repo.** It executes
workflow code with the real `../private/.env` and the live matrix Postgres; on a public
repo anyone can fork and open a PR, and a `runs-on: self-hosted` PR job would be remote
code execution on the data host. Rule 5 of `ci_workflow_tripwire`: no `runs-on:` naming
`self-hosted` under `.github/workflows/`. Nothing the repo gates on needs the data host:
the database, browser and update-drill gates run hosted against throwaway services. If
the repo is ever made private again, retire rule 5 deliberately, never in passing.

Repo settings (owner, UI): Actions → "Require approval for all outside collaborators";
restrict allowed actions to the census — `actions/*`, `github/codeql-action/*`,
`oven-sh/setup-bun`, `docker/setup-buildx-action`, `docker/build-push-action`,
`docker/login-action` (+ `webfactory/ssh-agent` on the mirror), all SHA-pinned; the
secret scanner is a digest-pinned container, not an action. Also enable **secret
scanning + push protection** and **private vulnerability reporting** (`SECURITY.md`).

### Scanners

- **Secret scanning** (`security.yml`, gitleaks): working tree on every PR, full history
  weekly. The first full-history run (2026-08-03: 178 hits over 38,980 commits) was
  triaged entirely to third-party example keys in the deleted PHP trees, public Mapbox
  `pk.` tokens and entropy false positives — no live credential was ever committed; the
  allowlist carries that triage.
- **CodeQL** (`codeql.yml`): `security-extended`, vendored/generated paths excluded in
  `.github/codeql/codeql-config.yml`. Advisory; output is the Security tab.
- **GitLab is deliberately asymmetric**: its own SAST (Semgrep) and Secret Detection
  templates. What must not differ across platforms is the repo's OWN gate — hence one
  `hermetic.sh`.

## Activation runbook — GitHub

1. **Actions allowed**: allowlist the action census above.
2. **Fork-PR safety**: "Require approval for all outside collaborators".
3. **Never register a self-hosted runner here** (rule 5).
4. **Branch protection — OWNER-ONLY and NOT GATED** (a ruleset is unobservable from the
   repo): on **both** `master` and `v7`, require `ci / hermetic`, `db / db` and
   `db / instance`, and a PR to merge. Do NOT add `dedupe` itself as a required check.
   A dedupe-skipped job reports **skipped**, which a required check treats as passing —
   safe because a tier skips ONLY when the dedupe itself concluded success after
   seeing another branch's run of the same sha CONCLUDE success; a failed, timed-out
   or cancelled dedupe runs the tiers (`!cancelled()`, leg F), so no dedupe fault can
   post a skip (see the dedupe). **Periodic check** (calendar it; no gate fires):
   `gh api repos/renderpci/dedalo/branches/<b>/protection` for both branches must list
   exactly those three contexts.
5. **Timeouts**: the `instance` job's 60 min is a first pin from the db build plus the
   drills' documented runtimes — re-pin from the first green run's wall clock.
6. **The image**: `ci-image.yml` publishes; `bun run ci:image:pin` moves the lock and
   every literal to it (see "The pin").
7. **GitLab mirror**: the same `.gitlab-ci.yml` hermetic tier on shared runners, in the
   locked image as uid 1001.

## Activation runbook — the self-hosted tier (PRIVATE mirror)

1. Push `master` to a PRIVATE repo (or the `gitdedalo` remote).
2. On that mirror only, move `.github/workflows-selfhosted/*.yml` into
   `.github/workflows/` and restore the commented triggers in `selfhosted.yml`.
3. Register ONE runner (macOS/arm64, `~/actions-runner-dedalo/`, label `dedalo-mac`,
   name `dedalo-mac-1`), `./svc.sh install && ./svc.sh start`; put the pinned bun dir in
   its `.path` (env_guard catches drift). A sleeping Mac queues jobs.
4. GitHub pauses cron schedules after ~60 days of inactivity — re-enable from the
   Actions tab (applies to `nightly.yml` and `ci-image.yml` on the public repo too).
5. Dispatch `deploy.yml` → the loud PARKED failure is the passing test.
