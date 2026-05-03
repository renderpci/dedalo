---
name: dedalo-css-styling
description: Guidelines for Dédalo's design system, LESS-based styling, and UI component architecture.
---

# Dédalo CSS Styling Skill

Dédalo uses a custom design system built with **LESS**. It relies on a centralized set of variables and mixins to maintain consistency across components and services.

## Design System Basics

### Core Variables (`vars.less`)
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

## Best Practices

1. **Avoid Hardcoding**: Never use `color: #f78a1c;` directly. Use `@color_orange_dedalo`.
2. **Responsive Design**: Respect breakpoints `@width_break_point_0` (1024px) and `@width_break_point_1` (960px).
3. **Focus States**: Use `.hilite_mixin` for consistent input focus styles.
4. **Transparency**: Use the `.transparent` class or `@opacity` parameter in button mixins to maintain the layering logic.
