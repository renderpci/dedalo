# WIRE_CONTRACT — deliberate divergences from the PHP wire shape

Ledger of every DELIBERATE divergence between the TS engine's JSON API output
and the live PHP oracle (DEC-15). The byte-identical client is the real spec at
these seams; the PHP shape is recorded as the fossil it replaces.

**The entries live in `engineering/wire_contract/`, ONE FILE EACH.** This file is
the rules; that directory is the ledger. There is no index here on purpose — an
index is an append point, and an append point is the conflict this layout exists
to remove. `ls engineering/wire_contract/` IS the index: every filename carries
its id and a slug naming what diverged.

**Standing rule (DEC-02/DEC-12):** a deliberate divergence commit must touch its
parity gates in the same commit, and add (or amend) an entry the same day.
A red parity gate with no ledger entry is a REGRESSION, not a divergence.

## Adding an entry

Create `engineering/wire_contract/<id>-<slug>.md`, where the id is

    WC-<yyyy>-<mm>-<dd>-<slug>        e.g. WC-2026-08-01-queue-frame

the date being the day you adopt the divergence. **Do not continue the `WC-nnn`
numbering.** That grammar required every developer to know what number everybody
else had taken, and it failed exactly as you would expect: `WC-006` was issued
TWICE (2026-07-07 `tool_common` relocation, 2026-07-09 installer diagnostics
grid) and both ids went on to be cited from live code — nothing caught it for
three weeks. `WC-070` was meanwhile allocated and never used. A date plus a topic
slug needs no coordination: two people would have to diverge on the same seam on
the same day to collide, and `wire_contract_tripwire` fails loudly if they do.

One entry per file also means two developers adding entries touch two different
NEW files, so there is nothing for git to conflict on — that holds at two
developers and at twenty, and it covers amending an existing entry too.

The id is PERMANENT: it is cited from test files and from `docs/`. Renaming one
is a tree-wide rename, so pick the slug once, deliberately.

Entry format — the file's h1 is `# <id> — <title>`, then:

- **Date:** when adopted (+ the commit or decision that carried it).
- **Decision:** the DEC- reference, if there is one.
- **Shape before (PHP):** the fossil, concretely.
- **Shape after (TS):** what the engine emits now.
- **Reason:** why the client (the actual consumer) needs it.
- **Gate reconciliation:** which parity gate absorbs the divergence, and how.

Amending a landed entry: append a `## Addendum <date> — <what changed>` section
to its file rather than rewriting it in place.

**Fixture interaction (DEC-14b):** the PHP wire shape is also frozen in the
oracle-harvest golden store (`engineering/ORACLE_HARVEST.md`). A new entry must
state whether the affected gates need a re-harvest (they do NOT when the gate
transforms the PHP/fixture response before diffing — the WC-001 pattern).

## History

- **2026-08-01** — the 81 entries were split out of this file, one per entry,
  byte for byte (verified by reassembling the pieces and comparing against the
  original). Two edits were deliberate in the same pass: every entry's heading
  became an h1, since an entry is now its own document (which also settled
  `WC-067`, an h1 among h2s); and the SECOND `WC-006` was re-issued as
  `WC-2026-07-09-installer-diagnostics-grid`, with its four citations updated.
  The first `WC-006` keeps the id — it is older, and the parity gate
  `dedalo_files_differential` names it.
- **What the split cost:** per-entry git history. `WIRE_CONTRACT.md` carried 69 commits,
  and git cannot express one file becoming 81, so `git log` on an entry file starts at the
  split. To read why a clause changed, use `git log --follow -- engineering/WIRE_CONTRACT.md`
  (the whole pre-split history is intact there) and `git log -S'<phrase>'` to find the commit
  that touched it. Everything from the split forward IS per-entry, which is the direction
  that matters.
- Ids `WC-001`…`WC-081` are the legacy sequential grammar, frozen. They stay
  valid and stay cited; only new entries use the dated grammar.

Gate: `test/unit/wire_contract_tripwire.test.ts`.
