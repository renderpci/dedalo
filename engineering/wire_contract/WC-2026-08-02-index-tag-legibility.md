# WC-2026-08-02-index-tag-legibility — the index badge's number is black and centred on the VISIBLE pill, not white and centred on the sprite box

- **Date:** 2026-08-02 (reported against the rendered badge: "center the number,
  change color to black for better read").
- **Decision:** none standing — a legibility fix to a faithfully-ported PHP
  rendering defect.
- **Shape before (PHP):** `core/component_text_area/tag/index.php` composited
  each badge in GD and the TS port reproduced it byte-for-byte in SVG
  (`src/core/components/component_text_area/tag_render.ts`):
  - the NORMAL (`n`) index state drew the number in **white**, the `r`/`d`
    states in black;
  - the label was anchored at `spriteWidth/2 + 2` — x=36 on the 68px sprite —
    for BOTH directions, and on the fixed baseline `21 + offsetY`.
  Both index sprites are 68x30 with a circular notch, so the opaque body at
  mid-height spans `0..54` for `indexIn` (centre 27) and `13..67` for
  `indexOut` (centre 40). The single `+2` therefore sat **9px right of centre**
  on `in` and **4px left of centre** on `out`, in native px — visible as a
  crowded number the wider the tag got, worst on 3-digit ids.
- **Shape after (TS):** same sprite, same size, same immutable-cache contract;
  only the overlaid `<text>` changed.
  - `fill="#000000"` on every index state. All three index fills are LIGHT
    (`#ffab01` normal, `#fc461a` to-review, `#2f8fff` removed) — black is the
    readable ink on each, and white-on-`#ffab01` was the worst pair of the set.
  - `x` is per-direction: 27 for `in`, 40 for `out` (the measured centres of the
    visible body), expressed as `offsetXFor(out)` overriding the flat `offsetX`.
  - vertical centring (`y=15` + `dominant-baseline="central"`) replaces the
    fixed `21 + offsetY` baseline, which sat ~2px low in the full-height pill.
  - `font-size="20"` (was 18) and `font-weight="600"`, to hold up at the
    client's 1x display size — the sprite is the native 2x asset, so the badge
    is read at 10px. Four digits at 20px measure ~36 native px against the 54px
    visible body, so the widest realistic id still clears the notch.
  Unchanged: `tc`, `geo`, `page`, `person`, `note`, `lang`, `draw` — their
  sprites are not mirrored and their inks were already correct.
- **Reason:** the badge IS the UI at this seam — it is an `<img>` the client
  cannot restyle, so a rendering defect can only be fixed in the generator.
  Faithfulness to a dead engine's GD arithmetic is not worth an unreadable and
  visibly off-centre number.
- **Gate reconciliation:** `test/unit/text_area_tag_grammar.test.ts` — the
  colour gate flipped from "white on the normal state (PHP parity)" to "black on
  every state", and a NEW gate pins the per-direction anchor (`x="27"` / `x="40"`)
  plus the central baseline, because a wrong anchor is invisible at one digit and
  glaring at three. **No re-harvest needed:** the frozen oracle store carries no
  badge bytes — the endpoint returns an image, and the fixtures that mention
  tags pin the `<img src>` GRAMMAR (`?id=[index-n-116-]`), which is untouched.

## Cache note (not part of the divergence)

The endpoint answers with `public, max-age=31536000, immutable`, so a browser
that already holds a badge will NOT revalidate it: the new rendering appears
after a hard reload (or for ids not yet cached). The ETag is content-hashed, so
any proxy that does revalidate picks the change up immediately.
