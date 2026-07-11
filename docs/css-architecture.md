# Dédalo v7 CSS / LESS architecture

This document summarizes how styles flow from `core/page/css/main.less` through layout, components and widgets, and defines conventions to keep behavior predictable without changing the current visual design.

---

## 1. Entry point and layering

**Entry file**

- `core/page/css/main.less` is the single entrypoint that compiles to `main.css`.

**Import order (current, acceptable, and recommended to keep)**

1. Layout core:
   - `./layout/reset`
   - `./layout/vars`
   - `./layout/theme_tokens` (shared `--ut_*` tokens, also consumed by the test-client CSS — new in this checkout)
   - `./layout/theme_dark` (dark-palette overrides under `:root[data-theme="dark"]`, right after `vars`)
   - `./layout/functions`
   - `./layout/fonts`
   - `./layout/general`
   - `./layout/progress_bar`
   - `./layout/buttons`
   - `./layout/layout`
   - `./layout/page`
   - `./layout/list`

   See [themes](core/ui/themes.md) for the full light/dark token story; this
   page only tracks the import layering.
2. Services & commons:
   - `install`, `inspector`, `paginator`, `search`, `menu`, `dd_grid`, generic services (autocomplete, upload, ckeditor, time_machine, dropzone, tmp_section), `tool_common`.
3. Global areas:
   - `login`, `relation_list`, and all `area_*` bundles.
4. Sections & TS objects:
   - `section`, `section_record`, `ts_object`, `section_group`, `section_tab`.
5. Components:
   - All `component_*` bundles, e.g. `component_av`, `component_image`, `component_text_area`, etc.
6. Widgets:
   - All `widgets/*` bundles (e.g. `widgets/oh/media_icons`, `widgets/oh/av_duration`).

**Guideline**

- Keep this order stable: it guarantees that:
  - Tokens and mixins from `vars.less`, `functions.less`, `fonts.less`, `general.less`, `buttons.less`, `layout.less` are always defined before any component/widget uses them.
  - Higher-level features (areas, sections, widgets) can rely on lower layers but not vice versa.

---

## 2. Tokens, mixins and shared utilities

**2.1 Tokens**

- **CSS custom properties** (`:root` in `layout/vars.less`):
  - Used for high-level, runtime-tunable values:
    - `--component_height`, `--component_width`
    - `--media_min_height`, `--media_max_height`, `--media_min_width`
    - `--view_text_height`, `--view_line_height`
  - **Use these** for dimensions that must be shared across multiple components and potentially overridden by ontology CSS.

- **LESS variables** (also `layout/vars.less`):
  - Color palette (`@color_*`), breakpoints (`@width_break_point_*`), and semantic tokens for ontology and tags.
  - **Use these** inside LESS only; do not re-declare colors or breakpoints in component files.

**2.2 Mixins and helpers**

- `layout/layout.less`:
  - `.hilite_mixin(@outline_offset)` and `.hilite_element` for focus/active highlighting.
  - Media base structure:
    - `.media_wrapper.*.wrapper_component` including `.media_content_data`, `.media_content_value`.
    - `.media.view_text` for compact media text-view.
  - `.wrapper_component` defines the base structural contract for all components (`>.label`, `>.content_data`, `.buttons_container`, state modifiers `.edit`, `.list`, `.search`, `.active`, `.fullscreen`, etc.).

- `layout/buttons.less`:
  - Icon & button helpers:
    - `.fn_add_mask`, `.fn_build_button`, `.fn_append_icon`.
  - Generic button styles:
    - `.button`, `.icon_button`, and `button` element variants (`.primary`, `.secondary`, `.success`, `.danger`, `.warning`, `.info`, `.light`, `.dark`, `.link`).
  - Reusable icon classes (e.g. `.download`, `.file_av`, `.play`, `.pause`, etc.).

- `layout/general.less`:
  - Global page defaults (`html`, `body`, `.loading`, `#main`, etc.).
  - Utility classes: `.hide`, `.invisible`, `.unselectable`, `.centered`, `.debug`, `.tooltip_toggle`, `.error_*`, `.success_*`, `.warning_text`, etc.
  - Generic form control styles and reset helpers: `input[type=...]`, `select`, `.reset_input`.

**Guideline**

- **Do not** redefine generic behaviors (focus outlines, button visuals, media wrapper layout) inside components.
- **Do** call central mixins (e.g. `.hilite_mixin`) from component-level selectors when component needs the standard behavior.

---

## 3. Component CSS contract

**3.1 Root selector**

- Each component LESS file should:
  - Use a single root block: `.component_<name> { ... }`.
  - Avoid styling global tags or re-declaring `body`, `html`, etc.

Example (current pattern from `component_av.less` and `component_image.less`):

- Root: `.component_av { ... }`, `.component_image { ... }`.
- Modifier classes inside:
  - `&.edit`, `&.list`, `&.search`
  - `&.view_default`, `&.view_line`, `&.view_viewer`, `&.view_mosaic`, `&.view_player`, `&.view_text`, `&.view_print`
  - `_mini` suffix class: `&_mini { ... }` for compact inline rendering.

**3.2 Structure expectations**

- Components rely on the HTML structure defined by `wrapper_component`:
  - `>.label` – label row (text, icons, warning tags).
  - `>.content_data` – main content wrapper (flex/grid).
  - Inside `>.content_data`, a `>.content_value` wrapper often contains the actual media/content node.

- Media-related components (e.g. `component_av`, `component_image`, `component_pdf`, `component_svg`) are expected to:
  - Be wrapped with `.wrapper_component.media_wrapper` at the DOM level when needed.
  - Use `.media_content_data` / `.media_content_value` structure defined in `layout.less` for consistent sizing and resizing.

**3.3 View modifiers**

- Components define view modifiers that are **purely contextual**:
  - `.edit` – record edit mode.
  - `.list` – list row or gallery context.
  - `.search` – search form context.
  - `.view_*` – specialized visualizations:
    - `.view_player` (e.g. `component_av` player-only view).
    - `.view_viewer` (e.g. full-screen image/video viewer).
    - `.view_line`, `.view_mosaic`, `.view_text`, `.view_print`, `.view_tool`, etc.

**Guideline**

- Keep view modifiers defined but **avoid empty blocks** unless they are actively used in project-specific overrides.
  - If a view block is intentionally left empty as a hook (e.g. for ontology CSS), add a one-line comment `// reserved for ontology overrides` to avoid confusion.

---

## 4. Example: media components (`component_av` and `component_image`)

**4.1 `component_av.less`**

- Root: `.component_av { ... }`.
- Key patterns:
  - `.posterframe` inside `.component_av`:
    - Calls the shared `.media_posterframe_mixin()` (`layout/functions.less`) for
      fit/focus behavior (`object-fit: contain`, the `.hilite_mixin(-1px)` focus
      outline), plus its own outline/inset sizing.
  - `.av_control_buttons`:
    - Calls the shared `.media_control_buttons_mixin()` for the flex control-bar
      layout, plus its own `.smpte` timecode display with `@color_orange_dedalo`
      and text shadow.
  - `&.view_player`:
    - Hides `.label` and ensures `.content_data` fills available height with grid.
  - `&.view_viewer`:
    - Fullscreen-style view (absolute positioning, black background, centered
      content); the `.download` button calls the shared
      `.media_viewer_download_mixin()` for its fixed-position geometry.
  - `&_mini`:
    - Calls the shared `.media_mini_mixin()` (`img` height `2rem` by default).

**4.2 `component_image.less`**

- Root: `.component_image { ... }`.
- Key patterns:
  - Image container:
    - `.image_container` with flex centering and nested `.img` / `.image` using `object-fit: contain`.
    - Uses `.hilite_mixin(-1px);` for focus outline.
  - In edit mode:
    - Respects the same wrapper structure (`>.content_data > .content_value`).
  - Fullscreen viewer:
    - `&.view_viewer` uses fixed positioning; the `.download` button calls the
      same shared `.media_viewer_download_mixin()` `component_av` uses.
  - `&_mini`:
    - Calls the shared `.media_mini_mixin()`, same as `component_av`.

**Observation**

- Media components are **consistent** and rely on centralized `layout/functions.less`
  mixins for every pattern this section used to flag as duplicated: the
  fullscreen download-button geometry (`.media_viewer_download_mixin()`), the
  inline `_mini` image height (`.media_mini_mixin()`), the shared control-bar
  layout (`.media_control_buttons_mixin()`), and posterframe sizing/focus
  behavior (`.media_posterframe_mixin()`). This is the §7 refactor below,
  **already landed** in this checkout — see the note there.

---

## 5. Identified issues and risks

**5.1 Ordering assumptions**

- Many components assume:
  - `layout/vars.less`, `layout/buttons.less`, `layout/layout.less`, and `layout/general.less` have already been imported (for `@color_*`, `@width_break_point_*`, `.hilite_mixin`, `.fn_add_mask`, etc.).
- Because `main.less` imports layout before components, this is currently safe; however:
  - Adding a new entrypoint or changing the order can easily break these assumptions.

**Recommendation**

- Treat `main.less` as the **only entrypoint** into the CSS bundle.
- If additional entrypoints are ever needed (e.g. for public-facing minimal UI), they should:
  - Import at least: `reset`, `vars`, `functions`, `fonts`, `general`, `buttons`, `layout` in that order.

**5.2 Scope & leakage**

- Most component files properly scope under `.component_<name>`, which is good.
- Potential leakage exists when:
  - Components reach outside `.component_<name>` into generic classnames without the component root (less common in the files reviewed).
  - Global helpers in `general.less` and `layout.less` style generic selectors (`input[type='text']`, `button`, etc.), which is by design but should be documented.

**Recommendation**

- Keep **all component-specific styling under `.component_<name>`**, with:
  - DOM structure selectors (e.g. `>.content_data`, `.image_container`) nested inside.
  - No bare tags or global utility classnames from components unless they are doing opt-in usage of shared utilities.

**5.3 Redundancy / dead hooks — resolved**

- The empty `&.view_text` / `&.view_print` hooks this section used to flag in
  `component_av.less` and `component_image.less` have since been **removed**;
  neither file declares them any more (verified against this checkout). Both
  components now only declare the view modifiers they actually style
  (`edit`, `search`/`disabled_component`, `view_line`, `view_viewer`,
  `view_mosaic` on `component_image`, `view_player` on `component_av`, `_mini`).
- If a future component still carries a genuinely empty view block, apply the
  same recommendation: document it as an override hook with a one-line comment,
  or remove it once ontology/project CSS are confirmed not to rely on it.

---

## 6. Conventions going forward

**6.1 Layering rules**

- **Never** import component or widget LESS files directly from other components.
- **Only** `main.less` (and possibly a small number of secondary entrypoints) should import:
  - Layout → services/commons → areas → sections → components → widgets.

**6.2 Component LESS template**

For any new component `component_xxx`:

- File: `core/component_xxx/css/component_xxx.less`.
- Shape:

```less
/**
* component_xxx
*
* Included from main.less file
*/
.component_xxx {

	&.edit {
		>.content_data {
			>.content_value {
				// component-specific layout
			}
		}
	}

	&.list {
		// list context rules
	}

	&.search {
		// search context rules
	}

	&.view_default { }
	&.view_line    { }
	&.view_viewer  { }
	&.view_mosaic  { }
	&.view_text    { }
	&.view_print   { }

	&_mini {
		// compact inline representation
	}
}
```

**6.3 Use of tokens**

- Prefer:
  - `--media_min_height`, `--view_line_height` for sizes that must match layout-level expectations.
  - `@color_*` for colors and `@width_break_point_*` for breakpoints.
- Avoid:
  - Hard-coded pixel values where a token already exists (e.g. duplicating `5rem` instead of using `--view_line_height`).

---

## 7. Non-breaking refactors — landed

These started as **suggestions**; all five have since been implemented in this
checkout (verified against `client/dedalo/core/`). They are kept here, reworded
to past tense, both as a record and as the pattern to follow for the *next*
shared media pattern that shows up.

**7.1 Document and normalize empty view hooks — done via removal**

- The empty `&.view_text` / `&.view_print` hooks in `component_av.less` and
  `component_image.less` were removed outright rather than documented as
  reserved (see §5.3) — simpler than keeping empty override hooks around.
- Convention going forward: when adding new view-specific styles, place them in
  the component's own `&.view_*` block; don't create top-level view classes
  elsewhere. Only add an empty hook back (with a `// reserved for ontology
  overrides` comment) if a real future need for one arises.

**7.2 Extract shared media control patterns — done**

- `layout/functions.less` now defines `.media_control_buttons_mixin()` (the
  flex control-bar layout `component_av`'s `.av_control_buttons` and
  `component_3d`'s `.threeD_control_buttons` both call) and
  `.media_posterframe_mixin()` (the shared fit/focus behavior for posterframe
  images in `component_av` and `component_3d`). Landed under `functions.less`,
  not a new `layout/media.less` — no need to split further while the mixin
  count stays small.

**7.3 Align media viewer download buttons — done**

- `layout/functions.less` defines `.media_viewer_download_mixin()` — the fixed
  positioning/sizing every fullscreen `.download` button now calls
  (`component_av`, `component_image`, `component_3d`).

**7.4 Normalize mini media representations — done**

- `layout/functions.less` defines `.media_mini_mixin(@img_height: 2rem)` —
  called by every component's `&_mini` block (`component_av`, `component_image`,
  and others), with `component_svg` passing `var(--view_text_height)` for its
  own height instead of the `2rem` default.

**7.5 Consistent use of media tokens — done where touched**

- `component_image.less` uses `var(--media_min_height)` and
  `var(--view_line_height)` for the heights this section flagged as
  hard-coded. Keep applying the same preference (`var(--media_min_height)`,
  `var(--media_max_height)`, `var(--view_line_height)`) whenever a media
  component's sizing is next touched, rather than hard-coding a new pixel/rem
  value.

---

## 8. Summary

- `main.less` already follows a solid layered structure; keeping that entrypoint and order stable is critical.
- Layout and general layers provide a rich set of tokens and mixins that components should lean on instead of redefining behavior.
- Media components (`component_av`, `component_image`, `component_3d`, and related widgets like `media_icons`) share their common patterns through the `layout/functions.less` mixins (§7) rather than duplicating them.
- Empty view modifiers, where they show up, should either be documented or pruned once confirmed unused — the ones this document used to flag have been pruned (§5.3).
- This document is about the LESS/CSS layer only, which the TS rewrite copies **as-is** from the PHP-era client; nothing here changed for the server rewrite. See [themes](core/ui/themes.md) for the light/dark token layer and [ui/index](core/ui/index.md) for how this fits the rest of the client UI.


