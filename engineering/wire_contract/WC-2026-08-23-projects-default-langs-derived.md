# WC-2026-08-23-projects-default-langs-derived — `dedalo_projects_default_langs` is derived per install, in config order

- **Date:** 2026-08-23.
- **Decision:** none specific; follows the project premise (a gate that passes on
  one installation's records tests that installation, not the engine) and the
  standing "never silently narrow scope" rule.

## Shape before (PHP)

`page_globals.dedalo_projects_default_langs` is an array of
`{ label, value, tld2 }` entries, one per project language, built by resolving each
`lg-*` code against the languages section (`lg1`) for its display name and its
alpha-2 code.

Two properties of the old answer matter here, and both were accidents:

1. **The ORDER was the target table's physical heap order.** The resolver issued
   one set-membership `SELECT` over `matrix_langs` with **no `ORDER BY`**, so a
   bitmap heap scan returned the rows in block order. The frozen fixture's order
   (`nep, eng, deu, fra, vlca, ara, cat, ell, eus, ita, por, spa`) is that one
   installation's page layout on the day of the harvest: the last six entries are
   ascending `section_id` (insertion order), the first six are not — the exact
   signature of rows relocated to later pages by updates. The same query on
   another database with the same twelve languages returns a THIRD order
   (measured: `ara, ell, vlca, eng, eus, fra, ita, por, spa, cat, deu, nep`), and
   a `VACUUM FULL` or a plan flip changes it again on the same install.
2. **A code with no `lg1` record was silently DROPPED** — the membership query
   only returned matching rows, so a project language the languages section did
   not know about simply vanished from the list the client renders.

The TS engine's first port did not resolve anything: it returned a HARDCODED
twelve-entry list that mirrored the harvest install. It compared green only
because this development machine's `DEDALO_PROJECTS_DEFAULT_LANGS` happens to
hold the same twelve languages; on any other installation it served the wrong
list entirely.

## Shape after (TS)

`getProjectsDefaultLangs()` (`src/core/resolve/environment.ts`) derives the block
from `config.menu.projectsDefaultLangs`, one entry per configured code, each
resolved live through `src/core/resolve/lang_names.ts`
(`getLangNameFromCode` for the label, `getAlpha2FromCode` for `tld2`,
`string | null` when the code has no alpha-2 mapping). Element shape is
unchanged.

Two deliberate changes to the array itself:

- **ORDER = the configured order of `DEDALO_PROJECTS_DEFAULT_LANGS`, verbatim.**
  Deterministic, operator-owned, identical on every installation, and already the
  order the rest of the engine treats as authoritative (entry 0 is the main data
  language). Reproducing the fossil order would mean asserting a database's heap
  layout.
- **An unresolvable code KEEPS ITS PLACE**, labelled with its bare alpha-3, and
  every unresolved code is named in a boot-time `console.error`. Dropping it was
  the silent narrowing the standing rule forbids: a project language absent from
  the picker looks like a configuration that was never made.

The per-code RESOLUTION is unchanged and verified byte-identical against the
fixture — including the non-uniform cases (`Castellano`, `Valencià`,
`Arabic Cluster`, `Nepali`). Only the order differs.

The cache behind it changed with the derivation and is worth recording: the
single-slot module cache became a `createDataCache` **keyed by the request data
language**, because the label fallback chain consults that language — the old
slot would have served the first caller's language to every later request.

## Reason

The old TS value was a mirror of one installation pasted into the engine, which
is the same class of defect the generic-`test`-TLD law exists to stop: it was
right on `monedaiberica` and wrong everywhere else, and nothing said so. Deriving
it makes the client's language picker report THIS installation's project
languages; making the order the configured order makes two installations with the
same configuration answer the same thing, which the fossil order never did.

## Gate reconciliation

`test/parity/environment_differential.test.ts` — `page_globals: same key set;
same values outside engine-specific facts` — absorbs the divergence and is GREEN
(measured 2026-08-23: 3 pass / 0 fail, 54 assertions). It does NOT bucket the key
as engine-specific, because only the ORDER diverged and presence-only would have
thrown away the twelve values with it. Instead the key is compared twice and
skipped once:

1. **Entries, exactly, order-insensitively** — both sides sorted by `value`, then
   `toEqual`. A wrong label, a wrong `tld2`, a dropped language or an extra one
   still fails. This is what proves the derivation byte-identical to the fossil.
2. **Order, positively** — the TS array's `value` sequence must equal
   `config.menu.projectsDefaultLangs` verbatim, so "the order is the configured
   order" is an assertion rather than a claim in a comment.
3. The exact-value loop then skips this one key (`PROJECT_LANGS_KEY`); the key
   stays in BOTH objects, so the exact key-set compare above it is untouched.

The "roughly fifteen other harvest fixtures" carrying a `page_globals` block do
NOT need the same treatment — measured 2026-08-23, `environment_differential` is
the only parity gate that diffs `page_globals` at all (`grep -l page_globals
test/parity/*.ts`); in the other fixtures the block is inert payload nothing
asserts against.

**Fixture interaction (DEC-14b):** NO re-harvest — a re-harvest is impossible by
definition, and it would not help: the fossil order is a heap layout, not a
contract. The gate transforms before diffing (the WC-001 pattern).

## Addendum 2026-08-23 — the order is unreachable, measured

The entry above asserted the fossil order was a heap artefact. It was checked
rather than assumed, because the acceptance criterion offered was "resolve in
`matrix_langs` (lg1) RECORD order so the fixture goes green". It does not: the
same twelve codes, the same query, produce a different order on every database,
and record order is a fourth answer.

| Source | Order |
|---|---|
| Frozen fixture | `nep eng deu fra vlca ara cat ell eus ita por spa` |
| This installation (`@?` jsonpath, no ORDER BY) | `ara ell vlca eng eus fra ita por spa cat deu nep` |
| Its own suite clone, same query | `ell por cat eng ara deu eus fra ita nep spa vlca` |
| Either database, `ORDER BY section_id` (record order) | `ara cat deu ell eng eus fra ita nep por spa vlca` |

Two databases holding the SAME twelve language records disagree, which settles
it: the order is physical, not logical. And PHP cached the resolved block in its
page_globals file cache (`class.dd_core_api.php`, `$cache_data
['dedalo_projects_default_langs']`), so the fixture froze one heap at one
instant — even the oracle would not reproduce its own capture after a
`VACUUM FULL`.
