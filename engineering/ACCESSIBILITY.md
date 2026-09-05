# Accessibility — the cataloguing surface

**What this document is.** The permanent definition of how Dédalo's browser
client stays operable without a mouse and readable at WCAG 2.1 AA, and which
gates hold each half. It is `engineering/`, not `rewrite/`: the gates read it,
and anyone consuming this engine needs it.

**Why it exists.** A cultural-heritage engine whose vocabulary tree cannot be
operated by a keyboard-only or screen-reader cataloguer is not the best possible
system for the people who do this work — it excludes a class of them from its
distinguishing function. The 2026-08-26 audit (row P1-18; findings CLI-10,
CLI-11, CLI-22, CLI-23) measured that state: every field label a `<div>` that
named nothing, a thesaurus tree with exactly one `keydown` handler in the whole
widget (whose only job was `stopPropagation`), a dialog primitive with no role
and no focus management, and a default light theme failing AA in 72 rules.

---

## 1. The four laws

### 1.1 One helper owns operability
`client/dedalo/core/common/js/a11y.js` is the ONE place a non-native node
becomes a control. `a11y.make_activable(el, {on_activate, role, label,
pointer_event, expanded})` attaches the POINTER listener and the Enter/Space
listener **to the same callback**.

That single ownership is the point. The original defect was not only the missing
`tabindex`: the handlers were on **`mousedown`**, and keyboard activation
dispatches **`click`** — so a retrofitted tab stop would still not have made
Enter work, and a real `<button>` whose only listener is `mousedown` is
keyboard-dead for the same reason. One callback, reached both ways, cannot drift.

Gate: `test/unit/client_keyboard_activation_tripwire.test.ts` (TOTAL census of
the tracked `client/` + `tools/` JS) and, in the browser,
`client/dedalo/test/client/js/test_a11y_keyboard.js`, which dispatches real
`KeyboardEvent`s.

### 1.2 One chokepoint names every field
`ui.component.build_wrapper_edit` (and its search twin) builds every component
label. It calls `a11y.label_group(wrapper, label)`: the label node gets an id,
the wrapper is announced as a `group` named by it, and every unnamed control
inside is pointed at that label with `aria-labelledby`.

Controls arrive **asynchronously** (a component fills its `content_data` when its
own request resolves), so a one-shot pass cannot be the whole answer. ONE
document-level `MutationObserver` — never one per wrapper, which would be
thousands on a full record — names controls added later.

Icon-only buttons are named from the title they already carry
(`ui.build_button`), because the icon is a `::before` and invisible to the
accessibility tree.

**The owner is resolved PER CONTROL.** Component groups NEST: a portal wrapper is
a labelled group whose subtree holds one labelled group per column component, and
the whole subtree is committed in ONE append (the chokepoint names the group while
it is still empty). Reading the group label once, for the container the naming pass
was called on, therefore gave every column input in a portal row the PORTAL's name
— present, and wrong, which is worse than absent because axe sees a name and
passes. `a11y.name_controls` resolves `control.closest('[data-a11y-label-id]')` for
each control, so the nearest labelled group is what names it and a coarse call and a
precise one produce the same result. Surface: `component_group_nested`.

**A group without a label NODE is still a group.** The columns a curator really
sees render no label node: all 14 `view_line_edit_*` — the view a portal row and a
`section_record` line default to — call `build_wrapper_edit` with `label : null`,
because the column heading is drawn once by the list header, never per cell. With
no node there was no group, so `closest()` walked past the column and resolved to
the PORTAL again (and a line column outside a portal got no name at all). The
label TEXT exists in every one of those cases — it is `instance.label`, the
ontology's own; only the node is missing — so the suppressed-label branch of the
chokepoint calls `a11y.label_group_text(wrapper, label)`: same law, the name
carried in `data-a11y-label-text` and stamped on the controls as `aria-label`
instead of `aria-labelledby`. This also closes `show_interface.label === false`,
which took the same branch. Surface: `component_line_row` (the shipped shape,
including a line column with no labelled ancestor at all); the hermetic gate reads
WHICH a11y export that branch calls and executes THAT export, so a rename cannot
defeat it and a deletion reds it.

**A placeholder is not a label.** It disappears on the first keystroke, several
screen readers never announce it, and axe's `label` rule accepts any non-empty one
— so nothing mechanical would have caught it. Every text-entry control the LOGIN
screen creates (the first surface a curator meets, and its password-recovery
sibling) is named through `a11y.set_label`. Gates:
`test/unit/client_control_naming_tripwire.test.ts` — which EXECUTES the chokepoint
over a nested group tree and censuses the login area's source — plus the
`login_form` and `component_group_nested` surfaces in the browser tier.

### 1.3 A dialog is a dialog
`dd-modal` sets `role="dialog"`, names itself from its slotted header, moves
focus in and restores it to the element that really had it. **When it is modal
AND open** it also sets `aria-modal`, traps Tab inside itself and makes
everything outside it `inert`. Each of those clauses is subtler than it reads,
and each was wrong on the shipped surface first:

- **The name is applied LAZILY, on the header slot's `slotchange`.**
  `ui.attach_to_modal` — the one caller in the client that creates a
  `<dd-modal>` — appends the element FIRST (which is when `connectedCallback`
  runs) and slots the header afterwards, so reading `[slot="header"]` at connect
  time always found nothing and every dialog in the application was permanently
  named the literal string `Dialog`. A modal with no title keeps that generic
  `aria-label`, and it is REMOVED the moment a real header arrives.
- **The background is inerted along the ANCESTOR CHAIN**, level by level, up to
  and including `document.body` (`a11y.inert_background`). A sweep over
  `document.body.children` alone isolates nothing here: the modal is appended
  into `.wrapper.page`, inside `#main`, so the only body child that is not one of
  its ancestors is a hidden debug div — the record surface behind the dialog
  stayed live. Only the elements this dialog actually inerted are restored, so
  stacked dialogs cannot un-inert each other's background.
- **The trap reads BOTH trees a web-component dialog has**: the slotted light DOM
  (where every content control lives) and the shadow chrome (close, minimize).
  Scoping it to the shadow root left the content controls out of the candidate
  list entirely, so Tab was answered by yanking focus to the close button.
- Focus is restored to **`a11y.deep_active_element()` as it was at open time** —
  `document.activeElement` stops at a shadow host — and the un-inert runs BEFORE
  the restore, because an inert element cannot take focus. The opener is captured
  ONCE, at open, because isolation is applied and released several times in a
  dialog's life (see the next two points).
- **ISOLATION FOLLOWS THE DIALOG'S STATE, NOT ITS LIFETIME.** Minimizing parks a
  dialog in a 15rem corner strip, and the feature exists precisely so the record
  surface behind it stays usable. An isolation released only in
  `disconnectedCallback` therefore killed the application: minimize any modal and
  the whole page stayed inert — unclickable, unfocusable, absent from the
  accessibility tree — until it was restored or closed, and `minimizable`
  defaults to true. `_miniModal` now releases `aria-modal`, the inert sweep and
  the trap when it parks (without moving focus, which stays where the user's
  keystroke put it) and re-arms all three when it restores.
- **MODALITY IS DECLARED BY THE CALLER, NEVER INFERRED.**
  `ui.attach_to_modal` sets `modality` on the element before it is connected;
  `remove_overlay:true` means `'non_modal'`. Those callers (find-and-replace over
  the text editor, the diffusion panel) are documented as letting the user keep
  working on the surface behind them, so announcing `aria-modal`, inerting that
  surface or trapping Tab inside the panel would each be a lie about it. A
  non-modal dialog still gets the role, the name and the focus move + restore
  (`a11y.trap_focus`'s `trap:false`): non-modal is not "no contract".

The browser gate builds this surface through `ui.attach_to_modal`, in the
application's own construction order. A dialog surface hand-built in the inverse
order (content slotted first, element appended last) is green while production is
broken — that is not a hypothetical, it is how the naming defect stayed hidden.
And it builds the dialog THREE times, because the contract differs per state and
per declared modality: `modal` (open, isolating), `modal_minimized` (parked
through its own keyboard path, isolating nothing) and `modal_non_blocking`
(`remove_overlay`, never isolating). A gate that only ever mounts the open modal
state is green while the minimize button bricks the page.

### 1.4 Contrast is a measured number, not a habit
Every text-on-background pair a rule declares meets 4.5:1 (3:1 for large text) in
BOTH shipped palettes. The palette carries the roles that make this possible:

| Token | Role |
|---|---|
| `--color_orange_dedalo` | the accent FILL. Retuned in light to `#ad5e0d` (4.83:1 under white); the dark palette already retuned this same token, which is what proves the value is themeable and the brand lives in the logo asset. |
| `--color_orange_dedalo_bright` | the bright logo orange, for DECORATION only — never behind text. |
| `--fg_on_brand` | the ink on the brand fill. It flips per theme (white in light, near-black in dark), so no rule has to know which. |
| `--fg_on_accent` | the ink on a light COLOUR-CODED fill (the indexation amber and its siblings). Curators read those tags by hue, so the accessible fix is to flip the ink — 8.5:1 — not to mute the colour. |
| `--bg_fill_inverse` | a neutral fill that carries the inverse ink at AA. Column headers and chips used the grey ramp's mid steps with white text (1.92:1); the ramp is structural (borders, dividers) and must not be darkened to serve one use, so the use got its own token. |
| `--fg_inverse` | white in BOTH themes. `--color_white` is the theme's SURFACE ink and is DARK in dark, so a coloured chip's ink is `--fg_inverse`, never `--color_white`. |

Gate: `test/unit/contrast_ratio_tripwire.test.ts`.

---

## 2. The gates, and what each cannot see

| Gate | Tier | What it proves | Its stated limit |
|---|---|---|---|
| `contrast_ratio_tripwire` | hermetic | every rule declaring a colour AND a background meets AA, in both shipped palettes, over the built `main.css` (which `css_build_tripwire` proves equals the `.less`) | it cannot resolve the cascade: a rule whose background is inherited, `color-mix()`d, or overpainted by a `background-image` is not judged here |
| `client_keyboard_activation_tripwire` | hermetic | TOTAL census: every element a file creates and wires to a pointer event is keyboard-activable or enumerated in `engineering/client_a11y_backlog.json` | a listener on a node the file did not create has no resolvable element type; those sites are counted and floored, never judged |
| `client_control_naming_tripwire` | hermetic | the naming chokepoint EXECUTED over a nested group tree (each control named by its OWN group, a named control left alone) AND over the SHIPPED label-less line-view shape, through whatever export `build_wrapper_edit`'s suppressed-label branch really calls + a TOTAL floored census that every `view_line_edit_*` goes through that chokepoint + a TOTAL, floored census that every text-entry control the login screen creates is named in the same file | it runs the module against a minimal DOM and reads the login source; that a real screen reader hears those names on the real surfaces is the browser tier |
| `client_a11y_budget_tripwire` | hermetic | the axe verdict's every leg, and that the runner PROCESS exits on it (`--replay` subprocess) | whether axe finds a given violation is the browser tier's own run |
| axe phase of `bun run test:client` | browser | axe-core over the named surfaces, judged against `engineering/client_a11y_budget.json` | it judges the named surfaces, not every page of the application |
| `test_a11y_keyboard` (browser suite) | browser | real `KeyboardEvent`s activate the real surfaces; a portal row's sibling columns each announce their OWN label (never the portal's) whether the control was committed with the subtree or arrived after it; the login form's fields carry names of their own; the dialog — built through `ui.attach_to_modal`, in production order — names itself from the header slotted after connect, inerts a background control at its own nesting level, traps Tab across both trees, restores focus, gives the page back when PARKED (minimize, driven by its own Enter path) and re-arms on restore, and never isolates anything when the caller declared it non-blocking | it drives the surfaces the module builds, not a live record |

The two budgets — `client_a11y_budget.json` (axe, per surface and rule) and
`client_a11y_backlog.json` (unconverted pointer-only sites, per file) — are
**shrink-only in both directions**: over the number is red, and so is under it
without re-banking. An excuse may not outlive the defect it names.

---

## 3. Adding a surface, adding a control

- A new actionable element that is not a `<button>`, `<a href>` or form control
  goes through `a11y.make_activable`. A new `<button>` listens for `click` (add
  `mousedown` too only if pointer timing needs it).
- An icon-only control needs a name: `title_label` on `ui.build_button`, or
  `label` on `make_activable`.
- A new surface worth judging is added to `SURFACE_BUILDERS` in
  `client/dedalo/test/client/js/a11y_surfaces.js` **and** to
  `required_surfaces` in the budget — the gate reds a required surface the run
  did not mount, so a surface cannot be added and quietly skipped.
- A new palette token that will carry text needs its pair; the contrast gate
  reads the built CSS, so run `bun run css:build` in the same change.

## 4. What is NOT closed

- The thesaurus tree is operable and named, but it does not implement the full
  ARIA **tree pattern** (roving tabindex, arrow-key navigation between nodes,
  `role="tree"`/`treeitem`/`group`). Every node's controls are reachable by Tab
  and activated by Enter/Space, which is what WCAG 2.1.1 requires; the richer
  pattern is a separate, deliberate piece of work — a half-applied `treeitem`
  role without a conforming container is worse than none.
- `engineering/client_a11y_backlog.json` records the pointer-only activation
  sites outside the cataloguing surfaces this row names. They are enumerated,
  reasoned and shrink-only, not forgotten.
- The dialog's Tab ORDER puts the shadow chrome (close, minimize) before the
  slotted content, because the two roots are read in that order. Focus never
  leaves the dialog and every control is reachable; matching the composed visual
  order needs a flat-tree walk.
- The label-less line views are NAMED (§1.2, `label_group_text`), not given a
  VISIBLE label: the name is an `aria-label` carrying the component's ontology
  label, which is what a screen reader needs and what SC 1.3.1 / 4.1.2 require;
  a visible per-cell heading is a list-layout decision, not an a11y one, and the
  column header stays the sighted user's label.
- Axe is blind to naming by construction — a WRONG name is a name, and a
  placeholder satisfies its `label` rule. Every browser mutation of this row (the
  outermost-label naming, the unnamed login fields, the label-less columns) left
  `a11y: N surface(s), 0 violation kind(s)` untouched while `test_a11y_keyboard`
  went red. Naming is the browser suite's half, never axe's.
- The one document observer re-names a whole group on every added subtree; on a
  large portal render that is repeated whole-group scans, unmeasured against the
  record-edit render budget.
- The login form's OTHER accessibility questions (a visible programmatic label
  element rather than an `aria-label`, the two-step flow's focus and status
  announcements) are not addressed: the fields are NAMED, which is what CLI-10
  claims, not fully labelled in the visible sense of SC 3.3.2.
