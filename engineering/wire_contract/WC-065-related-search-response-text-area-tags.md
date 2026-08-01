# WC-065 — `related_search` response + text_area `tags_persons`/`related_sections` restored, TS-native shape (2026-07-29)

The v6 transcription helpers feed — `data.tags_persons` (the per-person insert
buttons / Ctrl+N shortcuts of the persons modal) and `data.related_sections`
(the modal's record grouping, the tools' parent-record `<select>`, the
tr_print header) — was never produced by the TS server. Restored (emit hook on
`component_text_area` EDIT data, gated on ontology `properties.tags_persons`;
dispatch route for `source.action:'related_search'` in
`section/read_facade.ts`; producer `src/core/resolve/related_sections.ts` +
`src/core/components/component_text_area/tags_persons.ts`), with a NORMALIZED
shape rather than PHP's mixed one:

- the sections item uses the **`value`** key (`{typo:'sections', tipo,
  section_tipo:[], value:[locators]}`) — the key the shipped v6-era CLIENT
  reads (`render_persons_list`, `render_related_list`). Late-PHP
  `sections_json.php` had switched this envelope to `entries`, a shape that
  client could never read — the TS server serves the client's contract, not
  the frozen PHP one;
- the sections item is **ALWAYS present**, `value: []` on zero hits (PHP
  omitted it, which made the persons modal bail even when the host record's
  own persons existed);
- **every `section_id` in the payload is a STRING** — the clients group with
  strict `===` against string ids (`instances.js` section_id is a string);
  PHP emitted mixed int/string;
- per-column data entries carry `{model, tipo, section_tipo, section_id,
  value: string[]}` — flat resolveCellValue strings (0..1 elements), which
  the two primary consumers `join(' | ')` raw. `tool_tr_print` (which
  expected `{value}[]` objects) got a one-line accommodation
  (`item?.value ?? item`);
- context lists, per referencing section, the SECTION entry FIRST
  (`{model:'section', tipo, section_tipo, label}`), then one
  `{model, tipo, section_tipo, label}` entry per relation-list column —
  column source = `getRelationListColumns` (section_map `relation_list`
  scope, else the legacy `relation_list` ontology node), the same source the
  Referencias panel uses;
- `tags_persons` elements are the PHP shape verbatim (`{type:'person',
  section_tipo, section_id (owning record), tag, role, full_name, state,
  tag_id, label, data:{person locator}}`), tag bytes identical to
  `TR::build_tag` on real data (label defensively '-'→'_' + 22-char capped,
  which PHP skipped — the grammar requires it);
- the person LABEL is the TARGET SECTION's own label, not a hardcode: it
  resolves through the standard term resolver (`getTermByLocator`, scope
  `default` with the main/thesaurus/relation_list fallback walk) against the
  people section's section_map (rsc197 → rsc1023) — the same label every
  relation list shows for that record, in the section's own component order
  and `fields_separator`. Initials generalize PHP's 3+2+2 rule to that word
  order (first word 3 chars + next two words 2 chars each). PHP instead
  hardcoded `rsc85`/`rsc86` for every install (`get_tag_person_label
  $ar_tipos`); that pair survives only as the fallback for a target section
  whose section_map resolves no term scope.

Gates: `test/unit/tags_persons.test.ts`,
`test/unit/read_facade_routing.test.ts` (related_search block).
