# WC-2026-08-14-tm-ddo-mode-retired — the ddo/display mode `'tm'` is retired

- **Date:** 2026-08-14. Adopted with the Time Machine unification (S3).
- **Decision:** DEC-15.

## Shape before (PHP / TS-before)

`'tm'` was overloaded onto two unrelated axes:

1. **a row source** — `sqo.mode === 'tm'` selects `search_tm` (PHP) /
   `tmReadSource` (TS), i.e. read from `matrix_time_machine` instead of `matrix`;
2. **a display mode** — every ddo, context entry and data item of a dd15 read
   was stamped `mode: 'tm'`, and 29 client `prototype.tm` slots existed to
   receive it — every one of them a verbatim alias of `prototype.list` (verified
   mechanically before deletion; see below).

Meaning (2) bought nothing and cost everything: each generic per-cell policy
gates on `ddoMode === 'list'`, so a mode that is a synonym of `list` everywhere
silently opted dd15 out of all of them (see the companion entry
`WC-2026-08-14-tm-cells-obey-list-emit-policy`).

## Shape after (TS)

**`'tm'` survives only as a row source.** It is legal in three positions —
`sqo.mode`, `source.data_source`, and the `pickReadSource` token — plus two
DECLARED, shape-pinned exemptions in `section/read.ts` (both listed with their
reasons in `tm_mode_retired_tripwire`): the null-record KIND label for the
tool's preview pane, and the INPUT ALIAS that normalizes a stale client's
`source.mode:'tm'` to `list` instead of 500-ing it (tool JS ships with no
cachebust; a stale client's per-ddo `'tm'` modes degrade its TM list until a
hard reload, and only that list).

- every dd15 ddo / context entry / data item emits **`mode: 'list'`**;
- read-only-ness travels on the request-scoped TM read (`tm_scope_context.ts`,
  opened for every `sqo.mode==='tm'` request) plus the consultation-only
  PERMISSION cap (level 1) the read pipeline already applies. Chrome (toolbar /
  search panel) is a CALLER decision: the embedded surfaces pass
  `buttons:false, filter:false`; the standalone dd15 browse keeps both.

Tripwired by `tm_mode_retired_tripwire`, which covers `src/` **and** `client/`.

### The two ACTIVE divergences (not synonyms)

Most `mode === 'list' || mode === 'tm'` clauses were synonyms and are simply
deleted. Two sites genuinely branched on `'tm'`:

- `relations/relation_core.ts` — `portalMode !== 'tm'` suppressed the
  `autocomplete_hi` ddinfo breadcrumb chain. RE-GATED on the request-scoped TM
  read (`isTimeMachineRead()`), preserving the suppression;
- `relations/request_config/explicit.ts` — the `'tm'` propagation arm of the
  unset-mode default. DELETED as dead: with the display mode retired no caller
  can pass `context.mode === 'tm'`, so the arm had no reachable input.

### Two re-gates that are write-side, not display-side

- `api/handlers/dd_core_api.ts:1612` — the `logReadActivity` skip is re-gated on
  `source.data_source === 'tm'`. **Without this, every dd15 browse, inspector
  history block and tool open would start writing dd542 Activity rows** — a
  write side effect introduced by a read-only unification, into dd15's own
  consultation-only twin.
- `client/dedalo/core/common/js/ui.js:529` — the ontology `element_css` strip is
  re-gated on `consultation_only` / `data_source`. TM cells must NOT take
  ontology CSS. Frozen fixture on this surface:
  `component_list_css_strip_differential`.

### The client prototype slots — all 29 assignments verified identical

`prototype.tm` was assigned in 29 places. Each was mechanically compared against
its own `prototype.list` twin before deletion; **all 29 resolved to the same
function**, so removing them is behaviour-neutral.

`client/dedalo/core/paginator/js/paginator.js:85` looked like the exception —
`paginator.prototype.tm = render_paginator.prototype.edit` reads as "TM lists get
the EDIT paginator". It is not: two lines above,
`paginator.prototype.list = render_paginator.prototype.edit // same as edit`.
The two slots were already the same function, and the TM paginator was in any
case constructed with `mode: self.mode` where the service pins `self.mode` to
`'list'`. **No visible paginator change.**

### What replaced the guards

Retiring the mode removes the flag ~10 client sites tested. Each was resolved to
what it actually meant:

- the toolbar / search-panel guards (`self.buttons && mode!=='tm'`,
  `self.filter && mode!=='tm'`) were EFFECTIVELY ALWAYS TRUE for every surviving
  instance once no section renders in mode 'tm', so they are simply
  unconditional now. Chrome suppression is a CALLER decision: the embedded TM
  panels pass `buttons:false, filter:false`; full pages keep their chrome.
  (A first cut re-gated these on a server-stamped `consultation_only` flag —
  wrong signal: consultation-only means READ-ONLY, not "no search", and it
  silently stripped search from the dd15 AND dd542 standalone pages. Reverted;
  no such context flag is emitted.);
- the ontology `element_css` strip (`common/js/ui.js`) → `section_tipo !== 'dd15'`,
  since every TM cell — meta column or snapshot column — is emitted under dd15;
- the live-edit `sync_data` subscription skip
  (`component_common/js/events_subscription.js`) → `data_source !== 'tm' &&
  section_tipo !== 'dd15'`. This is a REPAIR as well as a port: the tool's
  preview pane renders from an EDIT template with `data_source:'tm'`, so the old
  `mode !== 'tm'` test never excluded it and a live edit could overwrite the
  historical value on screen.

### The row source is NOT the render mode

`sqo.mode === 'tm'` survives untouched and is load-bearing:
`service_time_machine`'s base SQO must keep it. Setting it to `'list'` makes the
read return the caller section's **live records** instead of its history —
silently, with no error, a correct-looking list of the wrong rows. The base SQO
now carries an inline warning to that effect.

## Reason

A display mode that is a synonym of `list` in every renderer is not a mode; it
is a hole in every policy that keys off `list`. Collapsing it removes the hole
by construction rather than by remembering to write `|| 'tm'` at each new
policy site — the failure mode that produced the untruncated text_area cell.

## Gate reconciliation

New tripwire `tm_mode_retired_tripwire` (red before the last deletion, green
after), registered in `engineering/TRIPWIRES.md` and `scripts/verify.ts`.

The two write-side re-gates needed NO fixture reconciliation: for every non-TM
read the old and new conditions coincide (`source.mode !== 'tm'` was always true
where `sqo.mode !== 'tm'` is, and the `element_css` strip's `mode !== 'tm'` was
always true where `section_tipo !== 'dd15'` is), so
`component_list_css_strip_differential` and `activity_read_differential` replay
byte-identical. The five TM differentials are retired — see the companion
entry.
