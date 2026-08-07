# WC-2026-08-07-retouched-tier-is-a-master — the retouched image tier accepts raw uploads and re-encodes the derived tiers

- **Date:** 2026-08-07.
- **Decision:** — (media master-precedence rule; DEC-12 gates:
  `test/unit/media_two_masters.test.ts` (concept + precedence + ingest + delete +
  the master build refusal + the `deleted/` backups + rotation, on real
  ImageMagick fixtures), `test/unit/media_master_qualities_config.test.ts` (the
  set is DERIVED from `DEDALO_IMAGE_QUALITY_RETOUCHED`, never the literal
  `'modified'` — plus the canonical-literal belt), and
  `test/unit/media_versions_client_contract.test.ts` (both delete actions go
  through `deleteAndResyncCore`, and a rebuild failure reaches `msg`)).

### The domain model this restores

An image record has **TWO masters**, in precedence order:

1. the **retouched** tier (`DEDALO_IMAGE_QUALITY_RETOUCHED`, canonically
   `modified`) — the human-retouched master: colour-corrected, cropped,
   background removed. Full-size, lossless, in whatever the upload allowlist
   admits (`.tif`, `.psd`);
2. the **original** — the camera/scanner shot, stored as is, never mutated.

Everything else on the ladder is a DERIVATIVE of whichever master ranks
highest. This is v6's model, stated in the frozen engine:
`component_image::get_image_source` (`class.component_image.php:1569`) resolves
`modified` before `original`, `get_modified_quality` (:296) calls it "a
post-processed master … it takes precedence over 'original' as the source for
building lower-quality derivatives", and `build_version` (:1344, :1392) treats
`original` and `modified` alike as the two size-uncapped, quality-100 tiers.

### Shape before (TS, until 2026-08-07)

The engine had ONE notion of a master, `MediaTypeSpec.originalQuality`, so the
retouched tier was classified as a derivative tier. Three consequences, all
wire-visible:

- **`tool_import_files` / `tool_upload` / the MCP `media` tool REFUSED a raw
  upload into it**, one error per file:

  ```
  182843-A.tif: Cannot upload a '.tif' file into the 'modified' tier: it holds
  normalized .jpg / .avif files, so the upload would be shadowed by them.
  Upload into 'original' instead.
  OK. Imported 0 of 2 (match mode) with errors.
  ```

  `assertNormalizedExtensionForTier` exempted `spec.originalQuality` alone,
  so the retouched tier was held to the `[defaultExtension,
  ...alternateExtensions]` allowlist — which is `.jpg`/`.avif` on this install.
- **An accepted retouch re-encoded nothing.** `isOriginalTier` was true only
  for `spec.originalQuality`, so a `modified` upload took
  `regenerateMissingDerivatives`, which builds a derived tier only when ABSENT.
  On a record that already had tiers, the retouch changed nothing visible.
- **Nothing could ever be built FROM it.** `resolveOriginalSource` built its
  candidate paths at `spec.originalQuality` only.

### Shape after (TS)

`MediaTypeSpec` gains **`masterQualities: readonly string[]`** — the tiers that
hold raw uploads and act as derivative sources, highest precedence first.
`component_image` → `[<retouched>, <original>]` when the configured retouched
quality is actually in the ladder; every other model → `[<original>]` (no other
ladder has a retouched tier). `originalQuality` is unchanged and still means
"the archival tier" — `protection.ts` and `files_info.ts` keep depending on it.

| Wire surface | Before | After |
|---|---|---|
| `tool_import_files` / `tool_upload` / MCP `media`, `quality` = retouched, raw extension | per-file error, `Imported 0 of N` | accepted; the raw master is stored and indexed |
| the same, on a record that already has derived tiers | derived tiers untouched | web quality, thumb, SVG envelope and every already-existing higher tier RE-ENCODED from the retouch |
| the same, `quality` = a real derivative tier, raw extension | refused ("would be shadowed") | **unchanged — still refused** |
| a fresh ORIGINAL ingested while a retouch exists | derived tiers rebuilt from the original | derived tiers rebuilt from the RETOUCH; the original is stored + indexed |
| `tool_media_versions` `delete_version` / `delete_quality` on a master tier, when the delete CHANGES the best master | derived tiers keep depicting the deleted master | derived tiers rebuilt at once from the surviving master; a rebuild failure rides in BOTH `errors[]` and `msg` |
| the same, when the delete does NOT change the best master (a stray extension; the original while a retouch survives) | derived tiers untouched | **unchanged — still untouched** |
| `tool_media_versions` `build_version` with `quality` = a MASTER tier | built: for the retouched tier it re-encoded the master out of ITSELF | `result:false` — `'<q>' is a MASTER tier, not a derivative — a master is uploaded, never generated` |
| the refusal message for a genuine derivative tier | always `Upload into 'original' instead` | `Upload into '<original>' instead — or into '<retouched>' if this file IS the human-retouched master` |
| an existing derived tier re-encoded by a master change | n/a (higher tiers were never re-encoded) | previous bytes moved to the sibling `deleted/` first; the replacement named in a `console.warn` |
| an alternate-extension twin (`.avif`) of a derived tier, on a master change | left in place, still depicting the previous master, reported present + current | retired to `deleted/` and named — this engine has no builder for it |

Three decisions the operator stated, and where each lives:

1. **A new original while a retouch exists keeps building from the retouch**
   (`resolveMasterSource` precedence). Surprising and deliberate, so every path
   that writes a master calls `noteOutrankingMaster` — the ingest path and the
   posterframe writer — naming the record. It is SILENT when the tier just
   written is the resolved master, so the line only ever appears for the case it
   exists for.
2. **A retouch upload re-encodes all derived tiers, overwriting them**, thumb and
   SVG envelope included (`isMasterTier` → the unconditional ingest builders).
   `regenerateImage` additionally re-encodes every OTHER ladder tier that ALREADY
   EXISTS on disk: after a master changes, a `6MB` built from the previous one
   would serve the previous picture forever while `files_info` reported it
   present and current. An ABSENT higher tier is still not minted — tiers stay
   on-demand.
   **The cost is made recoverable, not hidden.** A derived tier is not
   necessarily machine-authored — `tool_image_rotation` rotates and crops the
   derived tiers in place, and an operator can park a curated file in any tier —
   so every file the pass replaces goes to the sibling `deleted/` first
   (`renameOldFiles`, the No-hard-delete law) and the replacement is named in a
   `console.warn`. Alternate-extension twins (`.avif`) are RETIRED to `deleted/`
   rather than re-encoded, because nothing in this engine can author one (v6's
   `create_alternative_version` was not ported), and a twin depicting a master
   the record no longer holds is a lie `files_info` reports as current.
3. **Deleting a master rebuilds the derived tiers from the survivor at once**
   (`deleteAndResyncCore` → `rebuildDerivedTiersAfterMasterDelete`), so what is
   served always matches the best available master — **but only when the delete
   actually changed the resolved master file.** Removing a stray `.jpg` beside
   the original `.tif`, or the original while a retouch survives, leaves the same
   file as master and rebuilds nothing.

**Deleting the LAST master does NOT wipe the derived tiers.** There is nothing
to rebuild them from, and on a partial-media box (masters on an unmounted
bucket) they are the only surviving picture of the object. Turning one deletion
into total loss of a record's image is not something a Cultural Heritage archive
may do. They are left standing and the re-scan reports them honestly.

**A MASTER IS NEVER A BUILD TARGET.** v6's `build_version` accepted one
(`:1391` — no resize, quality 100) and its `get_image_source` therefore needed a
special case (`:1575`) to stop `original` being built out of `modified`.
`buildVersionCore` refuses the whole class instead, which is the same rule with
no exception to keep in step and additionally stops the retouch being rebuilt out
of ITSELF: measured on the shipped precedence, one click of the panel's build
gear on a delivered retouch (jpeg quality 100, 3 169 136 bytes) resolved that
file as its own source and rewrote it at quality 82, 1 798 308 bytes.

**The retouched master IS mutated in place by `tool_image_rotation`**, and that
is deliberate (v6 `tool_image_rotation:190/:229` skip the literal `'original'`
and nothing else): rotating is a human retouching act, and it is the only way a
rotation survives, since the derived tiers are re-encoded from the master on
every master change. The archival original is never mutated by any path.

### Reason

The retouch is the curator's statement about what the object looks like. The old
classification made it unusable through every import/upload door on the install,
and — where an operator got a file in by other means — invisible, because
nothing built from it. The shadowing rationale the guard was written for is
still exactly right for a genuine derivative tier (the tier's canonical
`<id>.<defaultExtension>` shadows the upload and the record keeps serving the
previous image), so it is kept, and gated, for those tiers alone.

`files_info` needed no change: `scanFilesInfo` already walks every non-thumb
quality across the whole upload allowlist, so a raw `.tif` in the retouched tier
is indexed with no normalized twin — gated explicitly, because a retouch that is
stored but invisible is the same class of defect as one that is refused.

### Gate reconciliation

**No fixture re-harvest.** No response SHAPE changes: the same tool response
keys carry the same types. What changes is whether a given upload is accepted
and which bytes the derived tiers hold — neither is in the frozen store, whose
media fixtures are read-path scans of records that carry no retouched tier.

Every rule above was proven by mutation: reverting each one in the source turns
exactly its gate red, and only its gate (the shadowing exemption → the reported
import failure among them; `isMasterTier` → the re-encode case; master
precedence; the existing-higher-tier pass; the post-delete rebuild; the
rebuild-only-when-the-master-changed guard; the master build refusal; the
`deleted/` backup; the alternate-twin retirement; the `noteOutrankingMaster`
silence; hardcoding `'modified'` → the config-derivation case).

`masterQualities` carries the CANONICAL LITERAL as a belt beside the configured
name, exactly as `protection.ts masterQualities()` does. The two config keys are
independent and nothing ties them, so emptying or renaming
`DEDALO_IMAGE_QUALITY_RETOUCHED` while `DEDALO_IMAGE_AR_QUALITY` still carries
`modified` would otherwise reclassify a tier full of human-authored masters as an
overwritable derivative — measured before the belt: the retouch's centre pixel
went blue → red on one ingest.
