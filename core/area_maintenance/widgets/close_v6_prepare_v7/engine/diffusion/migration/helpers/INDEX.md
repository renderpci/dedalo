# helpers/ — what to use, what to ignore

29 scripts accumulated here across several attempts at this problem. Most are **not**
part of the current loop, and two of them are near-namesakes of the ones that are. Use
this index before reaching for a file.

Full instructions: `../PARITY_RUNBOOK.md`. Brief: `../../test_diffusion_migration.md`.

## The current loop

| File | Role |
|---|---|
| `run_parity.sh` | **The entry point.** Orchestrates the whole thing. Despite the name it is install-agnostic — parameterised by `ELEMENT`, `V6_ROOT`, `V7_ROOT`, `HARNESS_DB`, `PHP`. |
| `run_v6_diffusion_full.php` | v6 publish pass — whole element, all sections, pins the run timestamp. |
| `harness_refresh_only.php` | Drops/recreates the harness DB. Runs before **every** pass, not just between them. |
| `harness_dump_db.php` + `_harness_dump.php` | Dumps the published MariaDB tables to JSON (deterministic ORDER BY). |
| `compare_publication.php` | **The comparator.** Pessimistic by design. |
| `harness_canonical_json.php` | Canonical JSON used by the comparator's normalisers. |
| `accepted_differences.<ELEMENT>.json` | Recorded decisions, **per install** (see below). |
| `backups/diffusion_parity_baseline/*.sql` | Restore scripts for every hand-patched data row. |

v7's publish side lives in the v7 repo: `v7/scripts/diffusion_harness_publish.ts`.

## Removed (2026-08)

The old single-record pipeline — `run_compare.sh` and everything only it called
(`compare_tables.php`, `compare_results.php`, `run_v6_diffusion.php`, `build_v7_dump.php`,
`dump_scratch_v7.php`) — plus the coverage reports (`coverage_v6.php`,
`coverage_compare.php`, `column_coverage.sh`) and two scratch test scripts. They were
superseded by `run_parity.sh` and were dangerous to reach for: the old comparator lacked
the row-key / UNTESTED / acceptance semantics this loop depends on, and
`run_v6_diffusion.php` published ONE section per process, which breaks v6's static memos.
Recoverable from git if ever needed.

## Situational

- `migrate_subtree.php` — migrate one ontology subtree instead of everything.
- `regenerate_ontologies.php` — ontology-cache regeneration. **Not** part of the loop;
  the harness instead refuses `--migrate` while a v7 server is live.
- `list_diffusion_elements.php` — find the element tipo for a new install.
- `coverage_v6.php`, `coverage_compare.php`, `column_coverage.sh` — column-coverage reports.
- `identify_tables.php`, `get_session_id.php`, `rebuild_media_index.php`,
  `retry_pending_deletions.php`, `setup_scratch_db.sh`, `inject_fixture.php`,
  `migrate_oh_section.php`, `test_*.php` — one-off/diagnostic.

## accepted_differences is PER INSTALL — do not share it

The harness resolves, in order: explicit `--accepted=<file>` → `accepted_differences.<ELEMENT>.json`
→ **none**, with a printed notice.

There is deliberately **no cross-install default**. Every entry records a judgement about
one corpus ("these bytes differ and the websites are still correct"). The previous shared
`accepted_differences.json` carried a bare, unscoped `related` key that would have hidden
that column on any other ontology. Start a new install from nothing and let real findings
appear.

Adding an entry is the **operator's** decision, recorded with who decided and why —
never the assistant's, and never inferred from an automated prompt. Accepted columns are
still compared and still reported; they only stop counting toward the exit code.

`--accepted=none` re-checks every decision from scratch. Worth doing occasionally: two
entries here became unnecessary once the underlying bug was fixed, and were deleted.
