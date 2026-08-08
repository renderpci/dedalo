# WC-2026-08-08-media-thumb-handler — every media model gets its thumbnail the same way, and the wire says so

- **Date:** 2026-08-08.
- **Decision:** — (DEC-12 gates:
  `test/unit/media_thumb_census_tripwire.test.ts` (the declarations, the grammar,
  one-writer/one-handler), `test/unit/media_thumb_consistency.test.ts` (the
  behaviour on real binaries), `test/unit/media_svg_thumb.test.ts` (the svg
  renderer), `test/unit/media_versions_client_contract.test.ts` (the panel half),
  `test/unit/tool_posterframe.test.ts` (the posterframe seam)).
- **Supersedes nothing; amends** `WC-2026-08-07-media-alternate-version-builder`
  in one respect: the thumb tier is now built for all five models, so the twin
  exclusions that mention "the thumb" apply to five ladders, not four.

### The rule

**The thumb depicts its SOURCE; when that source changes or disappears, the thumb
is rebuilt or retired in the same seam.** The source is declared once per model
(`THUMB_SOURCE_BY_MODEL`, `src/core/concepts/media.ts`): the delivered file for
image/pdf/svg, the posterframe for av/3d. `media/thumb.ts` is the single handler
every trigger goes through. Only two things stay per-model, and both are
irreducible: the RECIPE (resize / pdf page 1 / librsvg render) and WHO MAY WRITE A
POSTERFRAME (`POSTERFRAME_WRITER_BY_MODEL`) — ffmpeg can pull an av frame here and
now, a mesh needs a renderer this engine does not have.

### What changes on the wire

Four client-visible changes; none of them changes a field's SHAPE, and each is a
divergence from what the TS engine emitted yesterday, not from PHP.

1. **`posterframe_url` is existence-checked.** It was built from the grammar
   alone, so every av/3d record without a posterframe handed the client a URL that
   404s — every fresh av record, and every DUPLICATED record (the posterframe is
   not among the files `duplicateMediaFiles` copies). It is now `null` when the
   file is absent, exactly like its sibling `base_svg_url`, which the same emitter
   has always existence-checked. The client fallback chain (`thumb` →
   `posterframe_url` → placeholder) only works if this field can be null; until
   now correctness rested entirely on `<img onerror>`.
   RESTORES PHP behaviour in effect, since PHP records had posterframes.

2. **`component_svg` projects a thumb into list mode.** `listQualities` is now
   `[default_quality, thumb_quality]` for every model — which is what PHP's
   `component_media_common::get_list_value` did with no per-type branch
   (`$ar_quality_to_include = [get_default_quality(), get_thumb_quality()]`,
   frozen :1554). The per-type switch this replaces carried one exception, svg,
   and that exception was the missing-thumb assumption, not a projection rule.
   EMITS NOTHING BY ITSELF: `media_list_value.ts` drops a quality with no file on
   disk, so a record gains the entry exactly when a thumb file appears. This is
   parity restoration — the divergence was TS refusing to project a tier PHP
   always projected.

3. **`build_version` on the thumb tier may report a MINTED posterframe in
   `built`.** For av, a missing posterframe is no longer a refusal: the engine
   extracts one and then builds the thumb (PHP `component_av::create_thumb`,
   frozen :581, did the same at a fixed t=10 — the TS mint clamps to
   `min(10s, duration/2)` so a short clip is not sampled past its end). The
   operator asked for a thumb and also got the still their lists now show, so the
   response lists both files. `built` was already `string[]`.

4. **`sync_files` rebuilds before it re-indexes, and reports what it could not
   rebuild in `errors`.** The panel's control is labelled "Regenerate files", its
   tooltip promises "re-create alternatives and thumb", and the client has always
   sent `regenerate_options.delete_normalized_files`; the handler read none of it
   and answered "Success" for work it did not do. It now runs the same
   missing-only pass `tool_update_cache` runs. The rebuild is NON-FATAL: the
   re-index is what the operator asked for, so a pass that throws becomes a value
   in `errors` rather than a failed request (measured: an unguarded await made a
   record with nothing to rebuild from answer `result:false` and never repaired
   its index).

### What an operator will notice

A fresh audiovisual record has a picture immediately, instead of the grey
placeholder it kept until someone opened tool_posterframe. An SVG record has a
thumbnail at all (rendered by librsvg — ImageMagick's SVG path emits MVG, which
the hardened policy disables; see `engineering/MEDIA_SPEC.md` §4.4). A 3D record
gets its posterframe from the media-versions thumb gear, which captures the live
scene. A thumbnail no longer survives the file it depicts: replacing a master or
deleting a posterframe retires it (av re-mints, 3d shows the placeholder until the
browser recaptures), and the deleted posterframe is now RECOVERABLE — it moves to
`deleted/` like every other media file instead of being the subsystem's one hard
unlink.

### Not changed

The identifier grammar, the quality ladders as configured, `files_info` entry
shape, the `posterframe` folder's position in the path grammar, and
`section/indexation_grid.ts`'s own export URL — which deliberately omits
`initial_media_path` for av/3d and is pinned against the oracle by the
indexation-grid corpus. It is a NAMED exemption in the census tripwire rather than
an oversight: unifying it would "clean up" the code by breaking a verified wire.
