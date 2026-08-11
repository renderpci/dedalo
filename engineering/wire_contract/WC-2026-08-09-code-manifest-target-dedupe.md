# WC-2026-08-09-code-manifest-target-dedupe — an upgrade rung is advertised once, whatever the catalog key

- **Date:** 2026-08-09 (CRAP defect-ledger D17).
- **Decision:** — (DEC-12 gate: `test/unit/code_manifest.test.ts`, the dedupe
  case; `WC-024` remains the owning entry for `update_code` owned mode.)

### Shape before (TS, until 2026-08-09)

`linearUpgradeTargets` (`src/core/update/code_manifest.ts`) pushed one target
triple per matching catalog descriptor and deduped only the
`nextMinor ?? nextMajor` boundary candidate:

```ts
if (boundary !== null && !targets.some((t) => compareVersionArrays(t, boundary) === 0)) …
```

That guard was DEAD by construction: `boundary` is `[M, m+1, 0]` or
`[M+1, 0, 0]`, every pushed patch target is `[M, m, p+1]`, so the equality can
never hold. Two catalog keys naming the same release (a hand-edited or aliased
catalog, e.g. `'701'` and `'701_alias'`) therefore produced
`[[7,0,1],[7,0,1]]`, and `buildCodeUpdateInfo` pushed one `files[]` entry per
triple — the manifest served to a remote client advertised the same release
twice.

### Shape after (TS)

One dedupe over the whole target list (keyed on the joined triple) before the
ascending `compareVersionArrays` sort; the dead boundary guard is removed rather
than left as a second inert branch. `files[]` carries each release once. Order,
the boundary-vs-patch precedence and the `?? 0` client-version defaults are
unchanged.

**Latent today:** `UPDATE_CATALOG` is `Object.freeze({})` (`update/catalog.ts`)
and the catalog parameter is injectable only from tests, so no 7.x install's
served manifest changes bytes. The entry exists because the fix changes what the
engine would RETURN the moment a catalog is populated.

### Reason

The consumer is a remote Dédalo install walking the upgrade rungs in order. A
duplicated rung means downloading and applying the same release twice — at best
wasted work, at worst a second `forceUpdateMode: 'clean'` pass over an install
that has already been upgraded.

### Gate reconciliation

**No fixture re-harvest.** `get_code_update_info` has no oracle fixture and the
served manifest is empty on every current install; the behaviour is pinned by
the unit gate named above.
