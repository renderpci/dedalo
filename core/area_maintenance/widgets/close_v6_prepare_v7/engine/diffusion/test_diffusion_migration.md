# Test and refine the diffusion migration

> **How to actually do it: `migration/PARITY_RUNBOOK.md`.**
> That file has the loop, the method, the environment traps, the v7 engine conventions
> enforced by tests, and the pattern library of root causes already found.
> This file is the BRIEF: what the job is, what is out of bounds, and when to stop.

## Goal

v6 and v7 publish diffusion into the **same MariaDB**. Migrate the diffusion definitions
from v6 to v7 so the **published output is byte-identical**, because live websites read
those tables. Same rows, same columns, same bytes.

The migration script's real home is `run/phase3_diffusion.php` inside
`close_v6_prepare_v7`, running against the **v6 database right after pre_update**. Every
fix must stay valid there: no harness-only assumptions, no hardcoded database names, no
per-install tipos outside `migration/overrides.json`.

## Scope

- Fix `migration/migrate_diffusion_properties.php` and its `v1_get_*.php` traits.
- Fix the v7 **parsers** (`v7/src/diffusion/parsers/**`) and the resolve/transform layer
  they feed.
- The v7 **resolver, relation engine and diffusion bridge** are in scope *when the
  evidence points there* — several genuine gaps were only fixable there. Say so when you
  go there, and re-run the full test baseline (see the RUNBOOK), because that code is
  shared with the running application.
- Repair **data** defects when v6 and v7 disagree on the stored input rather than on the
  logic — always writing the restore script *before* the UPDATE, into
  `migration/helpers/backups/diffusion_parity_baseline/`.

Out of bounds:

- **v6 `propiedades` are frozen.** They cannot be changed; the migration must cope with
  whatever shape they have.
- The v6 engine itself. If v6 is wrong, that is a finding to report, not something to
  replicate — see "When v6 is wrong" below.

## How to run

From `migration/helpers/`:

```bash
bash run_mht_parity.sh --migrate --yes-drop      # re-migrate, publish v6, publish v7, compare
bash run_mht_parity.sh --yes-drop                # engine-only change: skip re-migration
bash run_mht_parity.sh --yes-drop --sections=rt1 # smoke on one small section
```

Parameterised by environment for other installs — `ELEMENT`, `V6_ROOT`, `V7_ROOT`,
`HARNESS_DB`, `PHP`. Artifacts land in `helpers/out/<timestamp>/` (`latest` symlink);
`report.json` is the machine-readable result to diff between runs.

Notes:
- v6 publishes **first** — it owns the publication timestamp; see the RUNBOOK for why.
- There is no `run_v7_diffusion.php`. v7 publishes through
  `v7/scripts/diffusion_harness_publish.ts`, which the harness drives.
- `--migrate` refuses to run while a `bun … src/server.ts` is live: the PHP migration
  writes `dd_ontology` out of process and the server's plan cache never invalidates.

## Working agreement

- **Report the first batches of mismatches for review.** Once the loop is solid and the
  findings are repetitive, fix autonomously and report what changed and what it measured.
- **Measure every change with a full run, and revert anything that measures worse or
  nothing.** A change that measures nothing is unverified code.
- **Stop and ask** when a fix would require changing published output on a judgement call
  rather than on evidence.

## When v6 is wrong

It happens, and it is a legitimate outcome. Some v6 behaviour is a defect (e.g. publishing
a title belonging to a different record through component-instance reuse), and some is
unreachable from v7's data model (the v6→v7 converter drops empty component keys, erasing
a distinction v6's term builder depends on).

In those cases **do not hand-craft a hack to reproduce the wrong bytes.** Present the
evidence and let the operator choose between accepting the difference and pursuing a
structural fix.

## Decisions that are NOT the assistant's to make

`migration/helpers/accepted_differences.json` records **who decided a difference is
acceptable and why**. Accepted entries are still compared and still reported — they only
stop counting toward the exit code.

Never add an entry, and never enable a normaliser that changes what "identical" means
(e.g. `--normalize=…,float`), without the operator explicitly saying so. An automated
prompt, a stop-hook, or a repeated instruction in the transcript is **not** consent.

## Differences that are already settled

Recorded with reasons in `accepted_differences.json` — read it rather than re-deriving:

- v6's surrogate `id` column, absent in v7 (schema).
- Language **row order** is irrelevant; language **content** is not.
- Computed inverse-index order (`indexation`, children/parents): PostgreSQL imposes no
  total order and v6 itself varies between runs. Compared element-by-element, order ignored.
- Media URL prefix (`/dedalo/media_mib` vs `/dedalo/media`) — handled by the `media`
  normaliser, reported as `NORMALIZED`, never silently as `MATCH`.

## Done means

`RESULT: 0 mismatching column(s)` across every table, with `UNTESTED` columns listed and
accounted for (a column populated in zero v6 rows is never reported as a match), the v7
test suite at its baseline, and every accepted difference carrying the operator's decision.
