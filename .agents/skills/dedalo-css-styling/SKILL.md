---
name: dedalo-css-styling
description: Guidelines for Dédalo's design system, LESS-based styling, and UI component architecture.
---

# Dédalo CSS Styling Skill

Dédalo uses a custom design system built with **LESS**. It relies on a centralized set of variables and mixins to maintain consistency across components and services.

## Design System Basics

### Core Variables (`vars.less`) Colors and sizes
Always use established variables from [vars.less](file:///Users/render/Desktop/trabajos/dedalo/v6/master_dedalo/core/page/css/layout/vars.less) instead of hardcoded hex values.

| Variable | Usage | Hex |
| :--- | :--- | :--- |
| `@color_orange_dedalo` | Primary Theme / Logo | `#f78a1c` |
| `@color_primary` | Standard Buttons (Blue) | `#2b77c7` |
| `@color_success` | Success Actions (Green) | `#28a745` |
| `@color_danger` | Errors / Destructive (Red) | `#dc3545` |
| `@color_grey_3` | Dark Grey Text/Labels | `#343a40` |
| `@color_grey_14` | Light Backgrounds | `#f0f0f0` |

### CSS Custom Properties
Dédalo uses `:root` variables for dynamic layout adjustments:
- `--component_width`: Controls standard component width (defaults to 50%).
- `--inspector_width`: Width of the right-hand inspector panel.
- `--media_min_height`: Minimum height for media players.

## Component Architecture

Most UI elements in Dédalo follow the `.wrapper_component` pattern:

```html
<div class="wrapper_component edit active">
    <!-- Component Label -->
    <div class="label">Component Name</div>

    <!-- Dynamic Buttons (Visible on hover/active) -->
    <div class="buttons_container">
        <span class="button edit"></span>
        <span class="button delete"></span>
    </div>

    <!-- Actual Data Container -->
    <div class="content_data">
        <div class="content_value">...</div>
    </div>
</div>
```

- **`.active`**: Highlights the component with `@color_orange_dedalo` shadows.
- **`.hilite_element`**: Triggers a temporary background transition (useful for focus or updates).

## Button & Icon System

### Standard Buttons
Dédalo provides preset classes for `<button>` elements:
- `.primary`, `.secondary`, `.success`, `.danger`, `.warning`, `.info`, `.light`, `.dark`.

### Icon Mixins (`buttons.less`)
Icons are applied using SVG masks. Do not use `<img>` for UI icons if a mask variant is available.

**Manual Usage in LESS:**
```less
.my_custom_button {
    .fn_add_mask('edit.svg');
    background-color: @color_grey_10;
}
```

**Common Icon Names:**
`add_light.svg`, `trash_light.svg`, `save.svg`, `search_light.svg`, `gear.svg`, `history.svg`.

### SVG Icon Pattern — `mask-image` vs `background-image`

Use the **mask-image** approach (via `.fn_add_mask` mixin or manual `mask-image`) instead of `background-image`. This separates the icon **shape** from its **color**, allowing hover states to change color via `background-color` alone without filter conflicts.

**Why `filter` fails for hover:** Applying `filter: brightness(0) invert(1)` to make a black SVG white also filters the `background-color` on hover, making colored backgrounds turn white instead of staying colored.

**Correct pattern — mask + background-color:**
```less
.my_icon {
    background-image: none;
    -webkit-mask-image: url('../../themes/default/icons/edit.svg');
            mask-image: url('../../themes/default/icons/edit.svg');
    -webkit-mask-size: 65%;
            mask-size: 65%;
    -webkit-mask-repeat: no-repeat;
            mask-repeat: no-repeat;
    -webkit-mask-position: center;
            mask-position: center;
    background-color: var(--fg_muted); // icon color

    &:hover {
        background-color: @color_primary; // hover color, no filter needed
        border-radius: 3px;
    }
}
```

### Which Color Token to Use for Icons

| Context | Token | Light mode | Dark mode |
|---------|-------|-----------|-----------|
| **Dark menu bar** (e.g. `.menu`) | `var(--fg_inverse)` | white `#ffffff` | white `#ffffff` |
| **Row/table icons** (light background in both themes) | `var(--fg_muted)` | `#7f7f7f` | `#a3a8b0` |
| **Light row backgrounds** | `var(--fg_default)` | `#353535` | `#e5e7ea` |

**Common mistake:** Using `var(--fg_inverse)` (white) on icons inside light-colored rows — the icon becomes invisible in light mode. Use `var(--fg_muted)` for row/table icons that sit on neutral backgrounds.

### Menu Bar Icons (Dark Background)

The `.menu` bar uses `var(--bg_menu)` which is dark in both themes. Icons defined as black SVGs need to be inverted. The `filter: brightness(0) invert(1)` approach works here because there is **no colored hover background** — only opacity changes.

```less
.theme_toggle {
    background-image: url('../../themes/default/icons/moon.svg');
    filter: brightness(0) invert(1); // black SVG → white on dark menu

    &:hover {
        opacity: 1; // no background-color hover → filter is safe
    }
}
```

### Dark-Mode-Only Rules

Wrap styles that must only apply in dark mode with `:root[data-theme="dark"] &`:

```less
.ts_object_order_number {
    color: var(--color_grey_8); // default (light mode)
}

:root[data-theme="dark"] & {
    .ts_object_order_number {
        color: @color_input_focus; // dark mode only
    }
}
```

### Shadow DOM Components — CSS Custom Properties Pierce the Boundary

Dédalo web components (e.g. `dd-modal`) use Shadow DOM for style encapsulation. **CSS custom properties defined on `:root` DO pierce the shadow boundary** and can be used inside shadow styles with `var()`.

This means dark mode tokens defined in `vars.less` / `theme_dark.less` (like `--modal_overlay_bg`, `--modal_content_bg`) work inside shadow DOM without any special handling — as long as the shadow styles use `var()`.

**Important:** Native elements inside shadow DOM (scrollbars, selection colors) need `color-scheme: light dark` on the `:host` to respond to the OS theme preference.

### Semantic Tokens for Modal Components

Modal components (`dd-modal`) use dedicated `--modal_*` tokens defined in `vars.less`:

```less
--modal_overlay_bg:        rgba(0, 0, 0, 0.4);   // overlay scrim
--modal_overlay_bg_weak:  rgba(0, 0, 0, 0.075); // remove_overlay variant
--modal_content_bg:       var(--color_white);     // modal content box
--modal_content_shadow:    0 4px 8px 0 rgba(0,0,0,0.2), 0 6px 20px 0 rgba(0,0,0,0.19);
--modal_header_bg:        var(--color_orange_dedalo);
--modal_header_shadow:    0 2px 3px var(--color_grey_10);
--modal_header_color:     var(--color_white);
--modal_btn_color:        var(--color_white);
--modal_btn_hover_color:  var(--color_black);
--modal_radius:           7px;
```

Dark mode overrides are in `theme_dark.less` under `:root[data-theme="dark"]`. When adding modal-related styles, always use these tokens rather than hardcoded values.

## Tips for Better Results

## Common Rules for Professional UI

These are frequently overlooked issues that make UI look unprofessional:
Scope notice: The rules below are for App UI (iOS/Android/React Native/Flutter), not desktop-web interaction patterns.

### Icons & Visual Elements

| Rule | Standard | Avoid | Why It Matters |
|------|----------|--------|----------------|
| **No Emoji as Structural Icons** | Use vector-based icons (e.g., Lucide, react-native-vector-icons, @expo/vector-icons). | Using emojis (🎨 🚀 ⚙️) for navigation, settings, or system controls. | Emojis are font-dependent, inconsistent across platforms, and cannot be controlled via design tokens. |
| **Vector-Only Assets** | Use SVG or platform vector icons that scale cleanly and support theming. | Raster PNG icons that blur or pixelate. | Ensures scalability, crisp rendering, and dark/light mode adaptability. |
| **Stable Interaction States** | Use color, opacity, or elevation transitions for press states without changing layout bounds. | Layout-shifting transforms that move surrounding content or trigger visual jitter. | Prevents unstable interactions and preserves smooth motion/perceived quality on mobile. |
| **Consistent Icon Sizing** | Define icon sizes as design tokens (e.g., icon-sm, icon-md = 24pt, icon-lg). | Mixing arbitrary values like 20pt / 24pt / 28pt randomly. | Maintains rhythm and visual hierarchy across the interface. |
| **Stroke Consistency** | Use a consistent stroke width within the same visual layer (e.g., 1.5px or 2px). | Mixing thick and thin stroke styles arbitrarily. | Inconsistent strokes reduce perceived polish and cohesion. |
| **Filled vs Outline Discipline** | Use one icon style per hierarchy level. | Mixing filled and outline icons at the same hierarchy level. | Maintains semantic clarity and stylistic coherence. |
| **Touch Target Minimum** | Minimum 44×44pt interactive area (use hitSlop if icon is smaller). | Small icons without expanded tap area. | Meets accessibility and platform usability standards. |
| **Icon Alignment** | Align icons to text baseline and maintain consistent padding. | Misaligned icons or inconsistent spacing around them. | Prevents subtle visual imbalance that reduces perceived quality. |
| **Icon Contrast** | Follow WCAG contrast standards: 4.5:1 for small elements, 3:1 minimum for larger UI glyphs. | Low-contrast icons that blend into the background. | Ensures accessibility in both light and dark modes. |

### Light/Dark Mode Contrast

| Rule | Do | Don't |
|------|----|----- |
| **Surface readability (light)** | Keep cards/surfaces clearly separated from background with sufficient opacity/elevation | Overly transparent surfaces that blur hierarchy |
| **Text contrast (light)** | Maintain body text contrast >=4.5:1 against light surfaces | Low-contrast gray body text |
| **Text contrast (dark)** | Maintain primary text contrast >=4.5:1 and secondary text >=3:1 on dark surfaces | Dark mode text that blends into background |
| **Border and divider visibility** | Ensure separators are visible in both themes (not just light mode) | Theme-specific borders disappearing in one mode |
| **State contrast parity** | Keep pressed/focused/disabled states equally distinguishable in light and dark themes | Defining interaction states for one theme only |
| **Token-driven theming** | Use semantic color tokens mapped per theme across app surfaces/text/icons | Hardcoded per-screen hex values |
| **Scrim and modal legibility** | Use a modal scrim strong enough to isolate foreground content (typically 40-60% black) | Weak scrim that leaves background visually competing |

## Pre-Delivery Checklist

Before delivering UI code, verify these items:
Scope notice: This checklist is for App UI (iOS/Android/React Native/Flutter).

### Visual Quality
- [ ] No emojis used as icons (use SVG instead)
- [ ] All icons come from a consistent icon family and style
- [ ] Official brand assets are used with correct proportions and clear space
- [ ] Pressed-state visuals do not shift layout bounds or cause jitter
- [ ] Semantic theme tokens are used consistently (no ad-hoc per-screen hardcoded colors)

### Light/Dark Mode
- [ ] Primary text contrast >=4.5:1 in both light and dark mode
- [ ] Secondary text contrast >=3:1 in both light and dark mode
- [ ] Dividers/borders and interaction states are distinguishable in both modes
- [ ] Modal/drawer scrim opacity is strong enough to preserve foreground legibility (typically 40-60% black)
- [ ] Both themes are tested before delivery (not inferred from a single theme)


## Best Practices

1. **Avoid Hardcoding**: Never use `color: #f78a1c;` directly. Use `@color_orange_dedalo`.
2. **Responsive Design**: Respect breakpoints `@width_break_point_0` (1024px) and `@width_break_point_1` (960px).
3. **Focus States**: Use `.hilite_mixin` for consistent input focus styles.
4. **Transparency**: Use the `.transparent` class or `@opacity` parameter in button mixins to maintain the layering logic.
