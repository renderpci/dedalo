# WC-2026-08-23-diffusion-langs-widgets-derived — the two diffusion widgets report the DERIVED language set, not the raw key

- **Date:** 2026-08-23.
- **Decision:** none specific; follows DEC-12 (an invariant is tripwired or
  deleted — the catalog's declared `type` is now load-bearing) and the standing
  "never silently narrow scope" rule.

## Shape before (PHP)

Both widgets answered from the raw environment string, split on commas at the
point of use:

- `publication_api.dedalo_diffusion_langs` — `[]` whenever
  `DEDALO_DIFFUSION_LANGS` was unset or empty, because the split had nothing to
  split. The panel then reported "no publication languages" on an installation
  that publishes in five.
- `diffusion_server_control.data.config.langs` — the same split, same empty
  answer, and the same shredding when the key held a JSON array: the v6→v7
  config migration JSON-encodes the v6 array, so a comma-split of
  `["lg-spa","lg-cat","lg-eng","lg-fra"]` produced the four PHANTOM codes
  `["lg-spa`, `"lg-cat"`, `"lg-eng"`, `"lg-fra"]` — and the widgets published
  them to the operator as if they were languages.

## Shape after (TS)

`DEDALO_DIFFUSION_LANGS` is resolved EXACTLY ONCE, at boot, into
`config.diffusion` (`src/config/config.ts`, `resolveDiffusionLangs`): the key is
declared `string_list` and read with `readList`, so a JSON array and a comma
list parse identically, and an unset or empty key DERIVES the set from
`DEDALO_PROJECTS_DEFAULT_LANGS` verbatim, order included. Both widgets now read
that one resolved value:

- `publication_api.dedalo_diffusion_langs` — `string[]`, the derived set. Shape
  unchanged (the client already documents it as an array,
  `client/dedalo/core/area_maintenance/widgets/publication_api/js/render_publication_api.js`);
  the VALUE changes from `[]` to the real language list on the unset case, and
  from phantom codes to real ones on a migrated install.
- `diffusion_server_control.data.config.langs` — `string[]`, same change.
- `diffusion_server_control.data.config.native_elements` — **shape deliberately
  unchanged**: still a comma string, or `null` when nothing is routed, because
  that is what the renderer consumes. Only the SOURCE moved
  (`config.diffusion.nativeElements`), which means a JSON-array-valued
  `DEDALO_DIFFUSION_NATIVE_ELEMENTS` no longer leaks through as a bracketed
  literal.

The out-of-project case is now strictly refused rather than reported: a
diffusion language that is not one of the project languages, or a code that is
not `lg-xxx` (the `all` sentinel included), prints at boot and makes
`compileElementPlan` / `validate` refuse the plan. See
`engineering/DIFFUSION_SPEC.md` §4.3.

## Reason

The widget is the only place an administrator sees the effective publication
language set, and it was the one place that could not be trusted. Two failures
met in it: an unset key read as "none configured" instead of "derived from the
project languages", and a migrated key read as four codes that name no language
at all. Because publication writes one target row per language, the phantom
codes were not a display bug — the engine published them, and the widget agreed
with the garbage instead of exposing it. Serving the ONE resolved value makes
the panel report what the publication plan will actually do, which is the only
useful thing a diagnostics panel can say.

The KNOWN-OPEN fallback in `publication_api.ts` — the whole-body `catch` arm
that still answers `dedalo_diffusion_langs: []` — is deliberately unchanged. It
is a separately ledgered behaviour (a thrown diffusion-map scan collapsing into
a "not configured" panel) and is not part of this divergence.

## Gate reconciliation

The frozen store's `widgets_differential.json` capture of
`dedalo_diffusion_langs` (line 11391) is the FULL derived set
(`lg-spa, lg-cat, lg-vlca, lg-eus, …`) harvested on an installation whose
`DEDALO_DIFFUSION_LANGS` was unset — i.e. the fixture always recorded the
derived answer, and it was the TS engine's `[]` that diverged from it. This
change moves TS TOWARD the fixture, so `test/parity/widgets_differential.test.ts`
needs no new normalization for this field.

TS ground truth is pinned natively rather than differentially:
`test/unit/diffusion_plan_compile.test.ts` drives the pure
`resolveDiffusionLangs` (unset ⇒ project langs; empty project langs ⇒ the data
lang; JSON-array input; comma input; order preserved verbatim; phantom codes and
`all` ⇒ `malformed`; out-of-project ⇒ `outsideProject`) and `langPolicyErrors`
(clean / malformed / out-of-project / both), and
`test/unit/config_declaration_tripwire.test.ts` makes the catalog declaration
load-bearing so no future site can re-introduce a raw split.

**Fixture interaction (DEC-14b):** NO re-harvest. The frozen PHP-side capture
already holds the derived set.
