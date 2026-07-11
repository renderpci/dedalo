# Breaking change detection

> See also: [Testing](testing.md) · [Development overview](index.md)

How the TS server guards against API, data-model and behavioral changes that
could break client integrations or diverge from the system it replaces.

## Overview

The whole TS rewrite is a breaking-change-detection exercise: its contract is to
match the PHP reference byte-for-byte at the client seam. The guard is therefore
the **differential parity harness** (`test/parity/`, see [Testing](testing.md)),
not a separate snapshot/tracker toolchain. Each `*_differential.test.ts` replays
an identical RQO against the live PHP oracle and the TS server and diffs the
results — so any change that alters the wire contract shows up as a failing diff
against PHP, immediately.

!!! warning "The PHP tracker toolchain is not ported"
    The PHP reference shipped three dedicated tools — a PHPUnit **contract
    snapshot** suite (`test/server/contract/`), a **method-signature tracker**
    (`dev/signature_tracker/`) and an **ontology tracker**
    (`dev/ontology_tracker/`) — wired into a `.github/workflows/phpunit.yml`
    pipeline. **None of these exist in the TS repo.** There is no `dev/`
    tracker directory, no golden-master snapshot files, no `UPDATE_SNAPSHOTS`
    flag, and no committed CI workflow. This page documents how the same three
    concerns are covered (or ledgered as a gap) in the TS server.

## The three concerns, mapped

### 1 — API contract changes → differential parity + minimal normalization

The PHP contract snapshots froze the JSON *shape* of API responses. The TS
harness does something stronger: it freezes the JSON against the **actual PHP
output**, field by field. The one place a field may be excluded from the diff is
`test/parity/normalize.ts`, and that file starts empty of cleverness — every
stripped field carries a written justification, and anything not listed is
compared byte-for-byte (today only `csrf_token`, `dedalo_last_error`, and the
`debug` block are stripped, all justified in-file). Over-normalization would hide
exactly the breaking changes this is meant to catch, so widening it is a
deliberate, reviewed act.

**Breaking** (a differential diff will flag it): a removed response field, a
changed field type, a renamed field, or a shape the client relies on going away.
**Safe**: additive fields the PHP oracle also emits (they appear on both sides
and match).

### 2 — Method signature changes → the type system

The PHP signature tracker used reflection to catch a changed public method
signature. In TS this concern is largely handled by the **compiler**: `tsc`
(strict, `tsconfig.json`) fails the build on an incompatible change to an
exported function's parameters or return type, and Biome/`bun run lint` guards
style. There is **no** cross-version signature baseline that would catch, e.g., a
*semantically* breaking change that still typechecks — that gap is covered only
insofar as a differential test exercises the affected action.

### 3 — Data-model changes → shared schema + parity gates

The PHP ontology tracker watched `dd_ontology` / `matrix_dd` for `tipo → model`
remaps and column changes. The TS rewrite's absolute constraint is that it uses
the **same PostgreSQL matrix schema and the same `dd_ontology`** as PHP — it does
not own or migrate the schema, so a schema change is not a TS-side event. What
the TS server must not break is its *reading* of that schema, and that is guarded
by the DB-backed parity/unit gates (`json_codec_roundtrip`, `matrix_read`,
`read_differential`, `ontology_parser_differential`, …) which fail if a resolved
row diverges from PHP or from the stored JSON.

## Running the guard

There is no separate command — it is the test suite:

```bash
# the full differential + unit suite (needs the live PHP oracle configured)
bun test

# just the contract-shaped parity gates
bun test test/parity

# a single action's contract
bun test test/parity/read_differential.test.ts
```

The differential gates no-op when the PHP credentials are absent
(`hasPhpCredentials()` — see [Testing](testing.md)); a meaningful contract check
requires the oracle present.

## Handling an intentional contract change

When you deliberately change the wire contract (a new envelope, a renamed field),
the parity gate against the *current* PHP oracle will fail — because the two
servers now disagree. Resolve it explicitly:

1. **Confirm it is intentional.** An accidental diff is a bug — fix the TS code so
   it matches PHP again.
2. **If the change is a joint client+server decision** (the client is copied and
   shared, so both servers must agree), the PHP oracle and the client contract
   move together; update the TS code to match the agreed shape and update the
   affected differential test's expected projection to the new shape.
3. **Never silence a diff by adding the field to `normalize.ts`** unless it is
   genuinely volatile (random/transient) — and then only with a written
   justification in that file. Stripping a real contract field to make a test
   pass defeats the guard.
4. **Document the change** in the commit message with a `BREAKING CHANGE:` footer
   (Conventional Commits, see [Development overview](index.md#git-commit-style)).

## Gap ledger

- **No signature baseline** — a semantically-breaking-but-still-typechecking
  change to an internal API is caught only by whatever differential test happens
  to exercise it, not by a dedicated tracker. (STATUS.md is the authoritative
  ledger of subsystem coverage.)
- **No committed CI workflow** in the TS repo yet — the suite is run with
  `bun test`; wiring it into CI is a deployment task.
- **No `UPDATE_SNAPSHOTS`-style golden masters** — the "golden master" is the live
  PHP server, which is the point of the differential design.

## Related

- [Testing](testing.md) — the differential harness, `normalize.ts`, and the
  scratch-twin write hygiene the contract gates rely on.
- [Runtime & request-scoped context](runtime_and_workers.md) — `dispatchRqo()`,
  the surface the contract gates drive.
- [Development overview](index.md) — the Conventional Commits convention for
  flagging a breaking change.
