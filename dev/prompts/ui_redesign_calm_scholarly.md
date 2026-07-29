# Dédalo v7 — system-wide UI refinement ("Calm Scholarly")

Act as an expert senior product/web designer who also ships production CSS. You are working inside the Dédalo v7 repo (`master_dedalo`) — read `CLAUDE.md` first and obey it.

## Mission

Refine the entire Dédalo v7 interface — every area, section, component, tree/thesaurus, tool, widget, inspector, search, menu, login — into a **modern, balanced, quiet** design. This is a *refinement*, not a rebrand: pull the existing style up, make it coherent, remove noise.

## Who it's for (non-negotiable design stance)

Dédalo is used by investigators/researchers for many hours a day. The interface is a **service to the data** — the data is the star, the chrome must recede:

- **Calm & neutral**: low-chroma neutral surfaces; color only where it carries meaning. The Dédalo orange (`--color_orange_dedalo`) is the single accent — used sparingly (focus, primary action, identity), never as decoration.
- **Long-session comfort**: contrast tuned for hours of reading — no pure black on pure white, no vibrating hues; dark theme is a first-class citizen, not an inversion afterthought.
- **Hierarchy by typography and spacing**, not by boxes and colors: fewer borders, subtler elevation, consistent type scale off the existing `system-ui` stack (base 0.8125rem stays unless you can justify a change).
- **Density is a feature**: researchers scan lists, trees and grids — do not "air out" the UI into a marketing site. Balanced ≠ sparse.
- **Motion minimal**, focus states consistent and visible, WCAG AA contrast in both themes.

## Ground truth — where the design lives

- `client/dedalo/core/page/css/layout/vars.less` — THE palette + semantic tokens (`--color_*`, `--bg_app/--bg_surface/--bg_menu`, `--fg_default/--fg_muted`, `--border_default`, `--focus_ring`, `--space-0..8`, `--radius-*`, `--shadow-1..4`, motion tokens). **Token-level change is your primary lever** — a fix here restyles the whole app.
- `layout/theme_dark.less` — dark palette (`:root[data-theme="dark"]`); every light-token change needs its dark twin.
- `layout/theme_tokens.less` — separate `--ut_*` token set shared with the test client; keep it in step, don't merge the two systems.
- `layout/general.less`, `buttons.less`, `functions.less`, `layout.less` — base type, the icon/button mixin system, shared mixins, the `.wrapper_component` contract.
- Per-component styles: ~145 `.less` co-located under `client/dedalo/core/<subsystem>/css/` (areas `area_*/`, `section*/`, ~40 `component_*/`, `widgets/`, `inspector/`, `search/`, `menu/`, `ts_object/` for trees). Tools: ~30 separate entrypoints under `tools/tool_*/css/`.
- Read `docs/css-architecture.md` and `docs/core/ui/themes.md` before touching anything; update them when you change the token story.

## Hard constraints

- Vanilla-JS client with an exact wire contract: restyle with CSS only; **no HTML/DOM restructuring** unless indispensable, and never change server payloads for looks.
- Keep the CSS contract: one `.component_<name>` root per component, `&.edit/.list/.search` and `&.view_*` modifiers.
- `.less` edits are invisible until `bun run css:build` (+ hard reload). `main.css`/`.map` are **committed artifacts**; never hand-edit them; the css tripwire test enforces byte-match.
- Gates that must stay green: `bun run css:check`, `bun run test:client`, `client_serving.test.ts`, `bunx tsc --noEmit` (zero new errors).
- Verify in a real browser on the Bun server at :4000 (`DEDALO_DEV_MODE=true`; mint a session via `createSession(-1,'root',true)` + `dedalo_ts_session` cookie if login blocks you). NGINX :7070 is stale — never judge from it.
- **Both themes, always**: every change screenshotted/checked in light and `data-theme="dark"`.

## Workflow — mockup first, sign-off, then rollout

**Phase 0 — Audit.** Walk the live app (areas, a section list+edit, a thesaurus tree, 3–4 representative components, 2 tools, inspector, search, login) in both themes. Screenshot everything. Produce a short written critique: what's inconsistent, noisy, dated, unbalanced — token-level causes, not per-screen symptoms.

**Phase 1 — Design proposal (NO live .less edits yet).** Deliver for sign-off:
1. A revised token sheet (proposed values for the `vars.less` + `theme_dark.less` palettes, type scale, spacing/radius/shadow) with rationale per group.
2. Before/after mockups of 3–5 key screens (standalone HTML mockups reusing the real markup+classes are fine) in both themes.
STOP and get explicit approval before Phase 2.

**Phase 2 — Rollout.** Apply approved tokens in `vars.less`/`theme_dark.less`/`theme_tokens.less` first, rebuild, and sweep the app: fix per-component `.less` regressions area by area (areas → sections → components → trees → inspector/search/menu → widgets → tools → login). Verify each area in the browser, both themes, before moving on. Commit in small area-scoped commits (concise messages per CLAUDE.md).

**Phase 3 — Close.** Full-app pass in both themes; run all gates; update `docs/core/ui/themes.md` + `docs/css-architecture.md`; summarize what changed at token level and what remains as known follow-ups.

Do not silently narrow scope: if an area/tool is left untouched, say so explicitly in the final summary.
