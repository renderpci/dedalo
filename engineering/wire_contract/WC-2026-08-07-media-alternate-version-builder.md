# WC-2026-08-07-media-alternate-version-builder — the engine BUILDS the alternate-extension versions it has always advertised

- **Date:** 2026-08-07 (same day as, and a direct amendment of the last row of,
  `WC-2026-08-07-retouched-tier-is-a-master`).
- **Decision:** — (DEC-12 gates: `test/unit/media_alternate_versions.test.ts`
  (the behaviour, on real ImageMagick fixtures),
  `test/unit/media_alternate_versions_tripwire.test.ts` (the anti-recreation
  invariants + the model-capability census), plus argv gates in
  `test/unit/media_engine.test.ts` and the scan-order pin in
  `test/unit/media_files_info.test.ts`).

### The headline an operator will notice

**Automatic background removal becomes visible in Dédalo for the first time.**
`tool_image_rotation`'s browser-side background removal produces an alpha PNG,
which lands in the retouched master; every derived tier is then re-encoded as
`.jpg`, and jpg has no alpha, so `backgroundForTarget` composites the cut-out
back onto white. The tool asked for the one file that could have carried it —
`1.5MB × avif` (`tools/tool_image_rotation/js/render_tool_image_rotation.js:663`)
— got `undefined` from `get_quality_file_info`, and returned silently. Nothing in
the engine could write that file. The feature has therefore shipped, been
clicked, and shown nothing, on every install since it landed.

With the builder in place the alpha survives into the tier's `.avif` companion.
Measured end to end through `regenerateImage` on the real layered medal master
(618×850, the 1.5MB recipe): the jpg is `JPEG · sRGB · opaque=True · corner
srgb(255,255,255)`, the twin is `AVIF · sRGBA · opaque=False · alpha_mean
0.531173 · corner srgba(0,0,0,0)` — the exact alpha mean of the master, i.e. the
cut-out arrived intact.

**The engine half was not the whole story, and the review found the other half.**
`render_tool_image_rotation.js` refreshed the component with
`await self.main_element.build(true)`, which is a NO-OP on an already-built
instance (`component_common.build` returns immediately when `status === 'built'`),
and the `process_uploaded_file` response — the only fresh `files_info` in that
flow — was discarded by `upload_image`. So even with the file on disk, the
lookup a few lines below still read the PRE-removal scan and still returned
silently. Two client lines ship with this entry: the removal pipeline now
RESOLVES with the upload response, and the render module splices its `files_info`
into `data.entries[0]` before asking for the twin (plus a cache-buster on the
`<img src>`, since the twin's path does not change across rebuilds). Without them
the headline above would be true of the filesystem and false of the screen.

### What was wrong (why there is a divergence at all)

`DEDALO_IMAGE_ALTERNATIVE_EXTENSIONS` and its four siblings were read by SEVEN
modules and written by NONE — v6's `component_image::create_alternative_version`
was never ported at the cutover. That is *config read but never honoured*, and
it was not inert:

- the scanner walked those extensions, `files_info` advertised the slots, the
  versions panel rendered the cells, and `features.alternative_extensions`
  published the list to the client — for files the engine could not produce;
- the ONE class of twin that did exist (v6-migrated, e.g. `1.5MB/<id>.avif`)
  went stale on every master change and was reported present + current;
- `buildPdfCover` hardcoded `'jpg'`, so `DEDALO_PDF_ALTERNATIVE_EXTENSIONS` —
  the one key that ships non-empty (`['jpg']`) — was honoured BY COINCIDENCE. An
  install using the catalog's own former example, `["avif","jpg"]`, got an avif
  nothing wrote;
- `build_version`'s `extension` option looked like a build target and was
  threaded in as the SOURCE selector, so an API caller sending `extension:'avif'`
  got a `.jpg` built from whichever master that extension happened to resolve.

### Shape before (TS, until 2026-08-07)

Twins existed only if a v6 install had left them on disk. The 2026-08-07
stop-gap RETIRED such a twin to `deleted/` whenever a master changed — the
honest half of v6's retire-then-rebuild loop, with no rebuild half.

### Shape after (TS)

A twin is a per-tier **companion** of that tier's normalized file — same
picture, same tier, other container. The invariant, stated in the direction the
engine can actually hold at ALL times, for every DERIVED quality Q:

    exists(Q/<id>.<E>)  ⇒  exists(Q/<id>.<defaultExtension>)

**No twin without its companion, ever** — enforced by the reconciler AND by the
paths that REMOVE a companion rather than build one. That second half is not a
tidiness rule: a delete changes no master, so the reconciler never ran, and one
`delete_version('1.5MB','jpg')` click left the twin on disk where `files_info`
then reported it as the tier's FIRST (and only) entry — so `relation_list.ts` and
`media_list_value.ts`, which pick a tier by quality alone, served an AVIF url for
a record whose web version had just been deleted. The converse is a
RECONCILIATION and not a disk state: a twin may legitimately be absent (the key
is empty, the host cannot encode the format, an operator deleted that one file,
or the tier carries a rotation the master does not), and each of those is
reported rather than silently fixed.

Masters never (a machine-authored file in a master tier becomes resolvable AS
the master — `resolveMaster` walks `allowedExtensions`). The thumb never
(`files_info` scans thumb with the thumb extension alone, so a twin there is
permanently unindexable). Absent higher tiers are still not minted — twins
inherit `regenerateImage`'s standing rule. The source is always the MASTER,
never the tier's sibling jpg (that file is already flattened onto white:
measured, transcoding it yields `opaque=True`, PSNR 3.31 vs 44.56).

| Wire surface | Before | After |
|---|---|---|
| `files_info` on **component_image / component_pdf** | one entry per (quality, configured extension) whose file the engine could never write — `file_exist:false` slots, plus stale v6 twins reported present + current | the twin entries name files that EXIST, built from the current master; a tier with no normalized file carries no twin entry at all (the twin is retired to `deleted/`) |
| `files_info` on **component_av / component_svg / component_3d** | the configured alternates were scanned and indexed although no writer exists for any of them | those extensions are filtered out at spec construction (`mediaTypeOf`) and never scanned — the phantom entries are gone |
| `context.features.alternative_extensions` (`src/core/section/media_features.ts`) | the raw configured list, on every model | the list the engine really builds. av/svg/3d publish `[]` even when the key is set; the refusal is kept in `spec.refusedAlternateExtensions` and named ONCE in the boot log with its config key and the structural reason |
| `tool_media_versions` **`build_version`** `built[]` | exactly the tier's own file | the tier COMPLETE — its normalized file plus every configured twin (so a tier minted on demand satisfies the ⟺ invariant from birth) |
| the same, new **`errors[]`** + `msg` | no error channel: a format this host cannot encode was reported as a clean success | per-file failures, each naming the config key that asked for the format; `result` stays **true** when the tier itself built (a twin refusal is not a failed build, and `result:false` would tell the operator nothing was produced when the tier and its jpg were) |
| the same, **`target_extension`** (new, optional) | — | builds EXACTLY ONE file: that tier in that container. Recovers a single twin without re-encoding the tier's own file, and with it any rotation an operator applied. Refused by name outside `[defaultExtension, ...alternateExtensions]`, quoting `NO_ALTERNATE_BUILDER_REASON` on av/svg/3d, and refused when the tier holds no normalized file ("build the tier itself first") |
| the same, **`extension`** | read as the SOURCE selector while reading like a target | **REMOVED, no alias.** The client never sent it (`tool_media_versions.js` posts tipo/section/quality/async only), so nothing in the repo loses a capability; a caller that did send it now gets the documented `target_extension` instead of a silent wrong answer |
| ingest — `tool_upload.process_uploaded_file` `errors[]`/`msg`, MCP `media` `derivative_errors[]` | `derivativeErrors` was populated at exactly ONE site, so on a host that cannot write a configured format every upload reported a clean success | `regenerateImage` returns `{created, replaced, retired, errors}` and `regenerateMissingDerivatives` returns its non-fatal failures; both are threaded into `derivativeErrors`, so a twin that could not be written reaches the uploader (the file IS stored and indexed — WC-2026-08-04-import-derivative-failure-counts-as-imported still governs the count) |
| an existing twin on a MASTER CHANGE | retired to `deleted/` and named (`WC-2026-08-07-retouched-tier-is-a-master`, last row) | **REBUILT from the new master** where the tier holds its normalized file. Retirement survives as the FAILURE branch — a box with no AVIF delegate is left honestly twin-less rather than quietly stale |
| `tool_media_versions` **`delete_version` / `delete_quality`** | moved exactly the file named | moves that file AND retires (to `deleted/`) any twin whose companion it just took, in every derived tier; the response's `files_info` is the scan taken after that, so what is persisted is honest. New `retired[]` on the seam's result, and the operator reads in `msg` that more than one file left the tier. Deleting a TWIN alone is left alone — the tier keeps its file, and the build gear brings the twin back on request |
| `build_version` with `target_extension` on a tier an operator ROTATED or CROPPED | — (the option is new) | **refused**, naming both geometries and the config key. The twin's source is the master, which knows nothing about a transform applied to the tier; measured, the recovery produced an 852×620 jpg beside a 618×850 avif in one tier, reported present and current with no error. Same refusal on the unattended repair sweep, which is the migration case: the first `tool_update_cache` pass after an install turns the key on would otherwise manufacture one per already-rotated tier |
| `duplicate_record` file copy, and `files_info` on any model | enumerated `[default, allowed, alternates]` | enumerates `spec.managedExtensions` — every extension a file of this type may legitimately carry, INCLUDING the pdf cover (built whether or not the config lists it) and configured-but-REFUSED extensions an install may already hold from v6. Measured before: with `DEDALO_PDF_ALTERNATIVE_EXTENSIONS` emptied, duplicate_record dropped the jpg cover — the only visual a pdf record has in a list view — and no repair path ever rebuilt it; with `DEDALO_AV_ALTERNATIVE_EXTENSIONS=["ogg"]`, a legacy `404/<id>.ogg` stopped being scanned, copied or soft-deleted at all |
| pdf `build_version` / ingest / repair **`errors[]`** | `buildPdfCovers` threw one aggregate: a cover format this host cannot encode turned a build whose copy, thumb and jpg cover all landed into `result:false`, and could abort a repair sweep per item | the pdf path carries the same non-fatal channel as the image path (`regeneratePdf` returns `{created, errors}`); `result` stays true, the failure travels in `errors`, and the canonical jpg cover is never gated on the writability PROBE at all (it is the type's own output, not a configured alternate, and the probe is memoized per process) |
| pdf covers | `<defaultQuality>/<id>.jpg`, hardcoded | one cover per entry in `spec.coverExtensions` = `['jpg', ...alternates]`. The jpg cover is built and scanned WHETHER OR NOT the key lists it, so emptying `DEDALO_PDF_ALTERNATIVE_EXTENSIONS` can no longer un-index covers that exist on disk. Every cover is composited onto `'#ffffff'`, never `backgroundForTarget` |
| `tool_update_cache` / repair | twins untouched | MISSING twins are built (repair's contract: missing-only, never re-encoding or retiring what an operator may have authored), per-extension wrapped and placed AFTER the thumb + envelope block so a missing delegate can never abort what the sweep exists to fix |
| `tool_image_rotation.apply_rotation` — the client's **`alpha`** flag | sent on every call, read NOWHERE; the colour picker's value (white by default) was applied to every extension of the tier | the flag decides: ticked ⇒ the background resolves PER FILE (`backgroundForTarget`), so an alpha twin's exposed corners stay transparent while its jpg companion is still composited onto white; unticked ⇒ the picker's colour, for every file. MEASURED, and the plan's claim here was WRONG and is corrected rather than repeated: the rotate recipe carries no `-flatten`, so `-background '#ffffff'` never composited the picture — the medal twin comes out `opaque=False`, `mean.a 0.5339` (from 0.531173). What the background decides is the colour of the area the rotation CREATES |

Not wire-visible, recorded because they change the bytes on disk: every
ImageMagick output token now carries an explicit coder prefix on an absolute path
(`AVIF:/abs/x.avif`) — measured, `magick src.png out.jxl` exits 0 with EMPTY
stderr and writes 316 bytes of PNG into a file named `.jxl`, which passes
`nonEmptyFile`, passes the scene-count post-condition, enters `files_info` and is
served with the wrong MIME; with an absolute path the same unrecognised coder
exits 1 and writes nothing. Capability is probed with a REAL 1×1 encode, not
`magick -list format` (which reports `PS PS rw+` while the hardened policy
refuses `PS:`, and marks `PNG* PNG rw-`, i.e. an `rw+` test would refuse the
engine's own default extension). Compression is per target: png/webp 90,
everything else 82 — png's `-quality` is not quality but `zlib_level*10 +
filter_type`, and 82 costs **+34.9%** bytes on the medal at the 1.5MB tier
(721 858 B vs 535 300 B) and **+24.0%** on this install's largest master at full
size (12 347 424 B vs 9 957 081 B).

### Reason

The client is the consumer at all four of these seams, and every one of them was
being told about files that did not exist. `component_image.js:622` builds
`active_extensions = [extension, ...features.alternative_extensions]` and the
versions panel renders one cell per (quality, extension) from the disk scan —
so the versions panel needs no client change at all — it renders from the fresh
disk scan. The background-removal seam is the exception, and it ships its own two
lines (see the headline): it reads `files_info` off an instance that nothing in
that flow refreshes. Conversely, on av/svg/3d the same
lists were pure fiction, and the honest answer is to stop publishing them rather
than to keep an operator hunting for a version that cannot exist.

The narrowing is deliberately made at spec construction (`mediaTypeOf`), not at
each consumer: every existing reader becomes correct with zero edits, and the
refusal stays VISIBLE (`refusedAlternateExtensions` + the boot line naming the
key, the value and the structural reason) instead of being silently dropped.
Refusing at config-read time, at boot, or at ingest were all rejected — they
brick scripts and tests, turn "no ImageMagick" into "no engine", or refuse
inconsistently.

### Gate reconciliation

**No fixture re-harvest.** No response SHAPE changes on any read path: the same
`files_info` entry shape and the same `features` keys carry the same types.
What changes is which files exist (and therefore how many entries a scan
returns) and two ADDITIVE tool-response fields (`errors`, `target_extension`).
The frozen oracle store's media fixtures are read-path scans of records that
carry no alternate-extension twin, so nothing in it moves.

Behaviour is gated by `test/unit/media_alternate_versions.test.ts`, whose
load-bearing assertion is the alpha one: the twin is built FROM THE MASTER, so
`opaque=False` — building it from the tier's jpg (the cheaper, tempting shape)
gives `opaque=True` and turns the whole change into a no-op that still passes
every existence check. The invariants are pinned by
`test/unit/media_alternate_versions_tripwire.test.ts`, whose load-bearing
assertion is the ANTI-RECREATION gate for this exact defect class, written
against the CENSUS: every builder `ALTERNATE_BUILDER_BY_MODEL` declares must
EXIST and its own body must turn the type's extension list into written files.
The weaker "some module reads the list and also builds something" shape was
tried first and is GREEN on the tree this change replaces (its `processing.ts`
carried `for (const extension of spec.alternateExtensions)` in the retire-only
loop plus three `buildImageVersion(` calls — verified against HEAD~), which is
exactly the failure mode a tripwire must not have; the census form is RED there
for every model with a builder, because neither `buildAlternateVersions` nor
`buildPdfCovers` existed. Six further invariants hold the census to being an
exact complement over the five `component_*` strings, keep a twin out of masters
and the thumb, keep its removal a MOVE into `deleted/`, hold every enumeration of
a record's files to `spec.managedExtensions`, and stop the per-file rotation
background being defeated by its only caller.

**Known-open, stated rather than narrowed:** (a) repair is missing-only, so a
v6-era STALE twin is corrected by the next master change and not by a sweep — the
engine cannot tell a stale twin from an operator-authored one without per-tier
provenance; (b) twins in MASTER tiers left by v6 are neither rebuilt nor removed,
for the same reason; (c) the companion-geometry check that refuses to build a
twin for a transformed tier reads DIMENSIONS, so it cannot see a 180° rotation
nor a 90° one of an almost-square image, and an EXIF orientation outside
`getDimensions`' two swaps reads as a disagreement that is not one (a loud,
non-destructive false refusal). Its durable fix is the one already ledgered in
`tools/rotation.ts`: store the rotation/crop as RECORD STATE and re-apply it
after any rebuild, at which point no heuristic is needed; (d) a twin build is
SYNCHRONOUS on the upload request path — see the catalog prose and
`engineering/MEDIA_SPEC.md` §6.5 for the measured cost.
