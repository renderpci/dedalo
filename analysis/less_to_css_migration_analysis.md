# LESS → Native CSS Migration Analysis

**Scope:** 162 `.less` files across `core/` and `tools/`, bundled via `main.less` using `@import`.

---

## What LESS features are currently used

| Feature | Count | Files |
|---|---|---|
| `@variable` references | ~2127 | all files |
| `darken()` / `lighten()` | 63 | `buttons.less`, `layout.less`, `general.less`, `area_thesaurus.less`, `view_indexation.less` |
| Mixin definitions & calls | ~250 | `functions.less`, `buttons.less` |
| `@{interpolation}` in URLs | 3 active | `buttons.less` (icon name in mask-image / CSS var) |
| `// single-line comments` | widespread | all files |

---

## Feature-by-feature migration map

### 1. `@variable` → CSS custom property (`--variable`)
**Feasibility: ✅ Straightforward**

Every LESS `@color_xxx` and `@width_break_point_x` variable gets replaced by a CSS `--color_xxx` custom property in `:root {}`.

```diff
- @color_primary: #2b77c7;
+ :root { --color-primary: #2b77c7; }

- color: @color_primary;
+ color: var(--color-primary);
```

`vars.less` already uses `:root {}` for some values — those just stay as-is.

---

### 2. `darken()` / `lighten()` → `color-mix()` or hardcoded values
**Feasibility: ⚠️ Requires attention**

Native CSS has `color-mix(in srgb, ...)` (supported in all modern browsers since 2023), but the syntax differs.

```diff
- background-color: darken(@color_primary, 5%);
+ background-color: color-mix(in srgb, var(--color-primary), black 5%);

- background-color: lighten(@color_orange_dedalo, 45%);
+ background-color: color-mix(in srgb, var(--color-orange-dedalo), white 45%);
```

There are **63 occurrences**, all in a small set of files (`buttons.less` dominates with ~56 of them — a repetitive pattern for color variants of `button.primary`, `.secondary`, etc.). This is very mechanical to migrate.

> [!TIP]
> Since button colors are already fixed values (not user-overridable), you could also just hardcode the computed hex values using a one-shot LESS compile — no `color-mix` needed at all.

---

### 3. Mixins → `@layer` / placeholder classes or inlined rules
**Feasibility: ⚠️ Most significant change required**

LESS mixins (`.fn_add_mask()`, `.fn_build_button()`, `.fn_append_icon()`, `.fn_build_tag_*()`, `.button()`) have **no direct CSS equivalent**. Three strategies:

#### Option A — Inline / unroll (recommended for most)
Replace each mixin call with its expanded CSS. Since mixin calls are already in structured LESS blocks, the result is the same visually. Best for: `.fn_add_mask()`, `.truncate_text()`, `.fn_build_tag_*()`.

#### Option B — Convert to `@layer` + shared class (for `.button()` mixin)
`.button()` is called inside `.fn_build_button()` to apply the base button style. Convert it to a real selector class and use `@layer` or cascade to control ordering.

#### Option C — CSS `@property` + custom properties for parameterized mixins
`.fn_build_tag_indexation(@bg_color, @text_color)` etc. are called with different colors. Convert to CSS classes that accept `--bg-color` and `--text-color` custom properties:

```css
/* Define the mixin as a reusable class */
.fn_build_tag_indexation {
    display: flex;
    background-color: var(--tag-bg, #f78a1c);
    color: var(--tag-color, #ffffff);
    /* … rest of properties … */
}

/* Usage: callsite injects the property */
.some_tag {
    --tag-bg: var(--color-tag-indexation-normal);
    --tag-color: #fff;
}
```

---

### 4. `@{icon_name}` string interpolation → CSS custom property in `url()`
**Feasibility: ⚠️ Requires a small workaround**

`buttons.less` uses `@{icon_name}` inside a `url()` to build mask paths dynamically:
```less
mask-image: url('../../themes/default/icons/@{icon_name}');
```

**Good news:** The code *already* has a working CSS-native fallback — it sets `--icon-path` as a custom property and reads it via `var()`. The interpolation only needs to stay for the definition line. Migration path: just hardcode the path per icon-class (which is what the icon class blocks already do).

---

### 5. `@import` → native CSS `@import` or `<link>` tags
**Feasibility: ✅ Trivial**

CSS supports `@import` natively. The compiler (LESS) currently bundles everything into one output file — the same can be done with a PostCSS bundler, or by keeping `@import` statements and letting the browser load them (with HTTP/2 this is fine).

---

### 6. `// single-line comments` → `/* block comments */`
**Feasibility: ✅ Trivial**  
CSS does not support `//`. All single-line comments must be changed to `/* … */`. A simple sed pass handles this.

---

### 7. Nesting (`&`, `> .child`, `&:hover`) → stays identical
**Feasibility: ✅ Already native CSS**

CSS Nesting is now baseline (Chrome 112+, Firefox 117+, Safari 16.5+). The `&` parent selector works identically. **No changes needed here.**

---

## Migration strategy (phased)

### Phase 1 — Automated pass (low risk)
1. Rename all `.less` → `.css`
2. Convert `@variable` → `--variable` globally
3. Replace `@color_xxx: val;` with `:root { --color-xxx: val; }` in `vars.css`
4. Replace `@width_break_point_x` in `@media` queries with hardcoded px values (or `--bp` vars)
5. Convert `//` comments to `/* */`
6. Update `@import` statements to remove `.less` extensions (or keep — CSS imports work either way)

### Phase 2 — Mixin expansion (medium effort)
7. In `buttons.less`: expand the 8 button color variant blocks — each `.primary`, `.secondary`, etc. block is ~6 lines with `darken()`. Replace with `color-mix()` or precomputed values
8. In `functions.css`: convert each `.fn_*()` mixin to either:
   - A reusable CSS class with `--` custom property parameters (for parameterized mixins)
   - Inlined rules at every call site (for simple wrappers like `.fn_add_mask`)

### Phase 3 — Callsite cleanup
9. Replace every `.fn_add_mask(@icon_name)` callsite with the 4 inlined mask properties
10. Replace every `.fn_append_icon()` / `.fn_build_button()` callsite with inlined CSS
11. Replace `.fn_build_tag_*()` callsites with the class + `--` property override pattern

---

## Summary

| Category | Effort | Risk |
|---|---|---|
| `@variable` → `--var` | Medium (mechanical) | Low |
| `darken`/`lighten` → `color-mix` | Low (63 occurrences, repetitive) | Low |
| Mixins → inlined / class | High (~250 callsites) | Medium |
| `@{interpolation}` | Low (already soft-handled) | Low |
| `@import`, nesting, `//` | Trivial | None |

> [!IMPORTANT]
> A **one-shot LESS compilation** of the current codebase produces valid, readable CSS (with nesting preserved via `lessc --no-ie-compat`). This compiled output could serve as the starting point for Phase 2–3 cleanup, eliminating all variable and mixin work automatically. Only mixin bodies and tag-building classes would need restructuring for maintainability.

**Conclusion:** The migration is feasible. The biggest effort is replacing the ~250 mixin callsites and converting the ~5 mixin definitions to CSS-native patterns. The rest is mechanical and can be scripted.
