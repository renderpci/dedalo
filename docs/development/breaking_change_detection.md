# Breaking change detection

> See also: [Testing](testing.md) · [Development overview](index.md)

How Dédalo guards against API, data-model and behavioral changes that could break client integrations. Three mechanisms cover it, and none of them is a bespoke tracker toolchain: the **frozen fixture store** pins the read-path wire shape, the **type system** pins internal signatures, and the **tripwires** pin the invariants that a type check cannot see.

## The wire contract is frozen, and the ledger is the law

The read-path wire shape is not re-derived on every run — it is **pinned to a frozen
fixture store** under `test/parity/fixtures/oracle_harvest/`. Each fixture is a
recorded `(request → response)` pair; a parity test replays the request against the
server and diffs the response against the stored one. `ORACLE_MODE` defaults to
`fixtures`, so `bun test test/parity/` runs offline, needs no credentials, and is
green on a plain clone.

This makes every wire-shape change **loud and deliberate**. You cannot quietly alter
a response: the fixture will not match, and the only way to make it match is to edit
the fixture — which is, by construction, an explicit act.

!!! danger "A fixture edit is a contract edit"
    Changing a fixture changes the contract every integrator depends on. It requires
    an entry in the wire-contract ledger (`engineering/WIRE_CONTRACT.md`, the `WC-nn`
    entries) **the same day**. That ledger is the wire law: if a divergence is not in
    it, the divergence is a bug. Never edit a fixture to make a failing test pass.

**Breaking** (a parity diff will flag it): a removed response field, a changed field
type, a renamed field, or a shape the client relies on going away.
**Safe**: a purely additive field, once the fixture is regenerated and the addition
is ledgered.

### `normalize.ts` — the one escape hatch, kept narrow

`test/parity/normalize.ts` is the single place a field may be excluded from the diff,
and it starts empty of cleverness. Every stripped field carries a written
justification in the file; anything not listed is compared byte-for-byte. Today only
`csrf_token`, `dedalo_last_error` and the `debug` block are stripped, all justified
in-file.

Over-normalization would hide exactly the breaking changes this is meant to catch, so
widening it is a deliberate, reviewed act — **never** a way to silence a diff. If a
field is genuinely volatile (random, transient, timestamped), justify it there; if it
is a real contract field, fix the code instead.

## The three concerns, mapped

### 1 — API contract changes → the frozen fixtures

Covered above: the fixture store is the golden master for every read action. A
`*_differential.test.ts` replays its fixture and diffs. This is the strongest of the
three guards, because it compares the *actual bytes* of a response, not a schema.

### 2 — Write-path contracts → the native gates

Writes are not fixture-replayable (they mutate state), so each one is pinned by a
TS-native contract test — the `test/unit/*_native.test.ts` gates. They assert the
exact record shape a save/delete/duplicate/counter/timestamp operation produces:
`save_component_native`, `delete_record_tm_native`, `duplicate_record_native`,
`dataframe_idkey_native`, and their siblings. A write-path change that alters the
stored shape fails one of these.

### 3 — Method signature changes → the type system

`tsc` (strict, `tsconfig.json`) fails the build on an incompatible change to an
exported function's parameters or return type, and Biome (`bun run lint`) guards
style. There is **no** cross-version signature baseline, so a *semantically* breaking
change that still typechecks is caught only insofar as a parity or unit test
exercises the affected action. That is the honest limit of this layer — and the
reason the fixture store carries the weight it does.

### 4 — Invariant changes → the tripwires

The class of breakage a type check cannot see — a module-level cache that would bleed
across requests, an unconfined SQL string, a config key read outside `src/config/`, a
descriptor registered without a column — is guarded by the **tripwires**, the
mechanical gates indexed in `engineering/TRIPWIRES.md`. They are the enforcement
backbone: an invariant that is merely *written down* is not enforced, so every stated
invariant either has a tripwire or does not exist. See [Testing](testing.md).

## Running the guard

There is no separate command — it is the test suite:

```bash
# everything
bun test

# the read-path wire contract (offline: replays the frozen fixtures)
bun test test/parity

# a single action's contract
bun test test/parity/read_differential.test.ts

# the write-path contracts and the tripwires
bun test test/unit
```

CI runs these on every push and pull request (`.github/workflows/ci.yml`), split into
a **hermetic** tier that needs no services and a self-hosted tier that has a database.
The pipeline map and the activation runbook are defined in `engineering/CI.md`.

## Handling an intentional contract change

When you deliberately change the wire contract (a new envelope, a renamed field), the
parity gate fails, because the response no longer matches its fixture. Resolve it
explicitly, in this order:

1. **Confirm it is intentional.** An accidental diff is a bug — fix the code, not the
   fixture. This is the default outcome and should be the common one.
2. **Check the client.** The client and the server share an exact wire contract; a
   field the server stops emitting is a field the client stops rendering. Move both
   together, and run `bun run test:client`.
3. **Ledger it.** Add the `WC-nn` entry to `engineering/WIRE_CONTRACT.md` describing
   the old shape, the new shape, and why. Same day, same commit.
4. **Then update the fixture** to the new shape, so the gate pins the new contract.
5. **Never silence a diff via `normalize.ts`** unless the field is genuinely volatile —
   and then only with a written justification in that file. Stripping a real contract
   field to make a test pass defeats the entire guard.
6. **Flag it in the commit message** with a `BREAKING CHANGE:` footer (Conventional
   Commits, see [Development overview](index.md#git-commit-style)).

## Known limits

- **No signature baseline.** A semantically-breaking-but-still-typechecking change to
  an internal API is caught only by whatever test happens to exercise it.
- **The fixture store cannot be re-harvested.** It was frozen against a single
  same-instant database snapshot. Fixtures can be *edited* (a deliberate contract
  change, ledgered) but the store cannot be regenerated wholesale — which is exactly
  what makes it a stable contract rather than a moving target.

## Related

- [Testing](testing.md) — the fixture store, `normalize.ts`, the tripwires, and the
  scratch-twin write hygiene the contract gates rely on.
- [Runtime & request-scoped context](runtime_and_workers.md) — `dispatchRqo()`, the
  surface the contract gates drive.
- [Development overview](index.md) — the Conventional Commits convention for flagging
  a breaking change.
- Definitions of record: `engineering/WIRE_CONTRACT.md` (the ledger),
  `engineering/TRIPWIRES.md` (the gate index), `engineering/CI.md` (the pipeline).
