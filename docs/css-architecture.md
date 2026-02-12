### Dédalo v7 CSS / LESS Architecture

This document summarizes how styles flow from `core/page/css/main.less` through layout, components, and widgets, and defines conventions to keep behavior predictable without changing current visual design.

---

### 1. Entry Point & Layering

**Entry file**

- `core/page/css/main.less` is the single entrypoint that compiles to `main.css`.

**Import order (current, acceptable, and recommended to keep)**

1. Layout core:
   - `./layout/reset`
   - `./layout/vars`
   - `./layout/functions`
   - `./layout/fonts`
   - `./layout/general`
   - `./layout/progress_bar`
   - `./layout/buttons`
   - `./layout/layout`
   - `./layout/page`
   - `./layout/list`
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

### 2. Tokens, Mixins, and Shared Utilities

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

### 3. Component CSS Contract

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

### 4. Example: Media Components (`component_av` and `component_image`)

**4.1 `component_av.less`**

- Root: `.component_av { ... }`.
- Key patterns:
  - `.posterframe` inside `.component_av`:
    - Uses `@color_grey_14` outline and `object-fit: contain;` — consistent with media wrapper behavior.
    - Calls `.hilite_mixin(-1px);` on `&:focus` for a global focus style override.
  - `.av_control_buttons`:
    - Flex row of control buttons, uses `.smpte` for timecode display with `@color_orange_dedalo` and text shadow.
  - `&.view_player`:
    - Hides `.label` and ensures `.content_data` fills available height with grid.
  - `&.view_viewer`:
    - Fullscreen-style view (absolute positioning, black background, centered content, fixed-position `.download` button).
  - `_mini`:
    - Compact inline icon with `img` height `2rem`.

**4.2 `component_image.less`**

- Root: `.component_image { ... }`.
- Key patterns:
  - Image container:
    - `.image_container` with flex centering and nested `.img` / `.image` using `object-fit: contain`.
    - Uses `.hilite_mixin(-1px);` for focus outline.
  - In edit mode:
    - Respects the same wrapper structure (`>.content_data > .content_value`).
  - Fullscreen viewer:
    - `&.view_viewer` uses fixed positioning and a `.download` button very similar to `component_av`.
  - `_mini`:
    - Same pattern as `component_av`.

**Observation**

- Media components are **mostly consistent** and already rely on centralized layout helpers, but still duplicate some patterns for:
  - Fullscreen download button geometry.
  - Inline `_mini` image height.
  - Posterframe/image sizing and focus behavior.

---

### 5. Identified Issues and Risks

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

**5.3 Redundancy / dead hooks**

- Several view blocks are present but empty (e.g. `&.view_text`, `&.view_print` in `component_av.less` and `component_image.less`).

**Recommendation**

- For now, keep them for compatibility, but:
  - Consider either documenting them as override hooks, or
  - Removing clearly unused ones in a future cleanup, once ontology and project CSS are confirmed not to rely on them.

---

### 6. Conventions Going Forward

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

### 7. Suggested Non-breaking Refactors

These are **suggestions** intended to be safe: they preserve visual output but improve structure and reuse.

**7.1 Document and normalize empty view hooks**

- In `component_av.less` and `component_image.less`:
  - Add a short comment to empty view modifiers (e.g. `&.view_text`, `&.view_print`) to indicate they are reserved for ontology overrides.
  - When adding new view-specific styles, always place them in these blocks rather than creating top-level view classes elsewhere.

**7.2 Extract shared media control patterns**

- From `component_av.less`:
  - `.av_control_buttons` layout and `.smpte` styling are good generic patterns for timeline-like controls.
- Suggested approach:
  - Introduce a small, shared helper in `layout/layout.less` (or a dedicated `layout/media.less` if you decide to split later):
    - Example mixins: `.media_controls()` and `.media_timecode()`.
  - Refactor `component_av.less` to call those mixins instead of duplicating structural properties in other media-related widgets/components.

**7.3 Align media viewer download buttons**

- Both `component_av.less` and `component_image.less` define a fixed-position `.download` button in full-screen views with near-identical geometry.
- Suggested approach:
  - Introduce a common rule in `layout/layout.less` under a generic selector like:
    - `.media_viewer_download` (or a mixin `.media_viewer_download_button()`).
  - In component files:
    - Add that class to the button element or call the mixin to reuse the positioning and size logic.

**7.4 Normalize mini media representations**

- `_mini` in `component_av` and `component_image` both set `img { height: 2rem; }`.
- Suggested approach:
  - Introduce a shared rule in `layout/layout.less`, e.g.:
    - `.media_mini img { height: 2rem; }`.
  - Have component markup (or LESS) ensure `_mini` uses that common pattern (e.g. `.component_av_mini.media_mini`).

**7.5 Consistent use of media tokens**

- Some heights in media components are hard-coded while layout already defines:
  - `--media_min_height`, `--media_max_height`, `--view_line_height`.
- Suggested approach:
  - When touching media components in the future, prefer:
    - `height: var(--media_min_height);`
    - `height: var(--view_line_height);`
  - This keeps visual consistency and allows ontology-driven overrides via `:root`.

---

### 8. Summary

- `main.less` already follows a solid layered structure; keeping that entrypoint and order stable is critical.
- Layout and general layers provide a rich set of tokens and mixins that components should lean on instead of redefining behavior.
- Media components (`component_av`, `component_image`, and related widgets like `media_icons`) are structurally consistent but can share more of their patterns through central helpers.
- Empty view modifiers in components are useful hooks but should either be documented or pruned once confirmed unused.


