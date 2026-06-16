# Dédalo v7 — UI Redesign Design Spec ("Calm Scholarly")

**Date:** 2026-06-15
**Status:** Design validated via interactive mockup. Pending team review before implementation planning.
**Author:** brainstorming session (devpacdd / alex@dedalo.dev)

---

## 1. Purpose & brief

Refresh the Dédalo v7 main UI so it is **both visually distinctive and measurably better to use day-to-day**, for cultural-heritage / museum / archive professionals who work in dense records for long sessions.

Agreed framing decisions (from brainstorming):

| Decision | Choice |
|---|---|
| Primary goal | **Both** — distinctive identity *and* better daily usability |
| Scope of change | **Restyle + targeted layout** — keep the navigation model and component arrangement; rework specific weak spots |
| Personality | **Calm scholarly tool** — quiet, low-chrome, content-first; distinctive through craft, not loud color |
| Brand color | **Dual accent**: official Dédalo **orange `#f78a1c` as primary**, **pine/deep-teal as a first-class alternate theme** |
| Pain points to fix | Visual noise/borders · heavy toolbar buttons · list density/readability · Inspector panel |

**Out of scope:** changing the navigation model, the information architecture, JS behavior/data flow, or the ontology/data model. This is a visual + targeted-layout redesign.

## 2. Approach

**Approach B — Token Retune + Pain-Point Rework.** Dédalo already has a centralized design-token system (`core/page/css/layout/vars.less`: ~70 color tokens, spacing scale, shadow scale, motion tokens, plus a working `data-theme="dark"` light/dark mechanism). Most of the refresh is achieved by **redefining tokens**; the four flagged areas get targeted component-level work on top. Staged so each piece ships independently.

A light dose of "design-system-first" is folded in: document tokens as they are defined (this spec is the start of that).

## 3. Visual language

### 3.1 Color — "surfaces over borders"

The core calming move: **groups are defined by whitespace + faint surface tints, not drawn boxes/lines.** Borders are removed except as rare faint hairlines where genuinely needed.

**Neutrals** — warm-leaning grey ramp (paper/ink feel, not cold steel):

- Light: app bg `#f7f6f4`, surface `#fffefc`, tinted panel `#f1efea`, sunken `#efece6`, text `#23211e`, muted `#8a857c`, faint `#b4afa5`, hairline `#e7e4df`.
- Dark (via `data-theme="dark"`): app `#1c1b19`, surface `#26241f`, tinted `#211f1b`, sunken `#181715`, text `#e8e5df`, muted `#989183`, faint `#6a655c`, hairline `#34322c`.

**Accent (used sparingly: primary action, selection, focus ring, links, brand mark).** Two swappable accents share the same neutral field:

- **Orange (primary / default):** fill `#f78a1c`; legible text/icon variant `#b5610c` (pure orange is too light for text on near-white); hover `#e07d12`; soft selection tint `#fbe7cf`. Dark: fill `#ffa54a`, text `#ffb968`, soft `#3a2c18`.
- **Pine / deep teal (alternate):** fill `#2f6b63`; text `#2f6b63`; hover `#28594f`; soft `#e3ece9`. Dark: fill `#5aa399`, text `#6fb3a9`, soft `#21302d`.

Architecture note: split the accent into `--accent` (fills) and `--accent-text` (text/icons on light) so accent swapping stays accessible. The existing token system makes the alternate accent a trivial `:root[data-accent="…"]` override.

**Status colors** (record states Pendiente/Validada/etc., toggles, errors): kept semantically clear but **desaturated** so they sit calmly in the neutral field — muted green/amber/red/violet, plus faint status-bg tints (e.g. danger-bg for destructive tool headers).

### 3.2 Typography

- One highly-legible humanist sans for all UI (system humanist stack, or IBM Plex Sans / Inter if a defined identity is wanted).
- **Stronger hierarchy than today:** section headers (IDENTIFICACIÓN…) stay uppercase but smaller, muted, with more letter-spacing — they label without shouting. Field **labels** small + muted; field **values** full-weight + higher contrast (today they compete — fixing this is a major readability win in ficha and Inspector).
- **Optional scholarly flourish (low-risk, droppable):** a serif used *only* for the record title/clave.
- Tabular figures for IDs, counts, dates.

### 3.3 Spacing, elevation, motion

- Apply the existing 8-step spacing scale consistently; give the ficha more vertical breathing room.
- **Flat by default.** Subtle shadow reserved only for things that genuinely float (modals, dropdown menus, overlaid Inspector).
- Reuse existing motion tokens (120/200/400ms), purposeful only; honor `prefers-reduced-motion`.

## 4. Component / surface designs

### 4.1 Top menu + unfolded (expanded) menu
- Menu bar on a surface with a single bottom hairline; brand mark carries the accent; active top-level item underlined in accent.
- **Unfolded menu = floating elevated panel** (one of the few places a soft shadow is used), two-column mega-menu: left = catalog tree with muted tabular record counts and accent marking the active branch only; right = "Registros recientes" on a faint tinted surface; footer with primary "Nuevo registro" + ghost actions, separated by one hairline.

### 4.2 List / records view
- Demoted toolbar: **one primary action** (Nuevo) + quiet text/icon buttons (no heavy orange button row); inline search box; a **density control** (Cómoda / Compacta).
- Clean data table: uppercase muted column headers, tabular IDs, calm hover, accent-soft row selection with an accent left-edge.
- **No sticky header** (Dédalo paginates ~10 rows/page, so the list is short; sticky caused a clipped-row artifact and bought nothing).

### 4.3 Record view ("ficha")
- Sections become quietly-tinted panels with generous padding and **no hard outlines**; dividers only as rare hairlines.
- Clear label/value typographic contrast; linked values in accent-text; empty values shown faint.
- Record title in the optional serif; status as desaturated radio set.
- Media grid for related records (e.g. Monedas) on sunken surface tiles.

### 4.4 Inspector + collapsed rail
- Right panel as a stack of **collapsible cards** (Información, Proyecto, Relaciones, Últimos cambios, Actividad) with clear card headers, accent icons, kv tables with tabular values, and a project tree.
- **Collapse toggle (⟩⟩)** collapses the ~320px panel to a slim **~46px icon rail** (matching the existing `--inspector_rail_width`): vertical stack of rounded-square icon buttons (expand · search · new · duplicate · delete · list · relations · | · info · project · links · history · activity), grouped by faint hairline separators, accent-soft hover, accent-filled expand button. Ficha widens to fill the reclaimed space.

### 4.5 Modals / tool boxes
- Modal chrome: elevated surface, **restrained accent top-edge** (replaces today's solid orange header bar), header with title + subtitle + minimize/close.
- **Tool variant (e.g. "Propagar datos de componente"):** when a tool is destructive, signal it with a **desaturated-danger top-edge + faint danger-tinted header** (not a full red bar). The component the tool acts on is shown inside, focused, in an accent-bordered card with its in-place **tool strip** (accent-filled icon row) + current value + **selection search box**. Explanatory line states the affected scope with an accent-highlighted count. Actions: primary (Reemplazar valores), outline (Añadir contenido), and a clearly-marked but calm danger action (Eliminar contenido).

## 5. Validated mockup

A self-contained, dependency-free HTML mockup demonstrates the full language across every major surface, two accents, and light/dark:

- Repo copy (version-controlled): `dev/mockups/dedalo_redesign_mockup.html`
- Shareable copy: `~/Desktop/dedalo_redesign_mockup.html`

Open directly in any browser (`file://`, no server/build needed). Controls: accent switch **Naranja Dédalo / Pino** (top-right), **◑** light/dark, view tabs **Lista / Ficha+Inspector**, **Densidad** control, Inspector **⟩⟩** collapse / **←** expand, and **⤴ Ver modal de herramienta** to open the tool modal (close via ✕ / outside click / Esc).

Demonstrated states: list view · ficha · expanded Inspector · collapsed Inspector rail · unfolded menu · tool modal — all in orange + pine and light + dark.

## 6. Implementation notes (for the future plan)

- Implement primarily by **retuning `core/page/css/layout/vars.less`** (palette, accent split, spacing usage, shadow/motion usage) + adding a `data-accent` override for the alternate accent.
- Targeted component LESS edits for: `core/menu/css/menu.less`, `core/dd_grid/css/dd_grid.less`, `core/section_record/css/section_record.less`, `core/inspector/css/inspector.less`, and `dd-modal` styles.
- Surfaces-over-borders is largely a token/strategy change applied app-wide; the four hotspots are component-scoped.
- Build via `npm run less:build`. Preserve the existing `data-theme="dark"` mechanism; no JS/behavior changes required for the visual layer (Inspector collapse already exists).
- Stage delivery: (1) token foundation → (2) list/toolbar → (3) ficha → (4) Inspector + rail → (5) menu → (6) modals.

## 7. Open questions for team review

1. Keep **orange as primary** with pine as the alternate, or ship both equally and let installations choose? (Architecture supports either.)
2. Adopt the **serif record-title** flourish, or stay sans-only?
3. Use a **named typeface** (IBM Plex Sans / Inter) for identity, or the neutral system stack?
4. Unfolded menu as the richer **two-column mega-menu**, or a simpler single-column list closer to v6/v7 today?
5. Confirm the **staged delivery order** and which stages are in the first milestone.
