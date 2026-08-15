# WC-2026-08-14-llm-map-target-sections-plural — the LLM ontology map emits EVERY link target, under `target_sections`

- **Date:** 2026-08-14 (found while landing the relation `view: "tree"` → thesaurus picker;
  shipped with `src/ai/mcp/tools/llm_map.ts`).
- **Decision:** a link field's `target` (single string) becomes `target_sections` (string
  array carrying every declared target). (Canon: `engineering/EXTERNAL_SPEC.md` for the MCP
  surface. Precedent for a served ontology-io artifact: `WC-2026-08-11`.)

## The seam

`install/import/ontology/7.0/ontology_llm_map.json` is a SERVED distribution artifact
(`serveOntologyIoFile`), so its field names are a wire, not an internal detail.

## Shape before (PHP era, and TS until this change)

```json
{ "tipo": "oh115", "type": "link", "target": "ds1" }
```

`llm_map.ts` built that with `const target = (await targetSections(...))[0]` — the FIRST
resolved section only.

## Shape after (TS)

```json
{ "tipo": "oh115", "type": "link", "target_sections": ["ds1", "…"] }
```

- The key is `target_sections`, matching `discovery.ts` `describeSection`
  (`SectionMapField.target_sections`) — one vocabulary across the MCP surface instead of
  two names for the same fact.
- The value is EVERY section the field's `request_config` sqo resolves to, in resolution
  order. Absent (not empty) for a scalar field, exactly as `target` was.

## Reason

The single-target form was not a simplification, it was **wrong for every node that
declares more than one target**. `oh115` resolves `{"value":[4],"source":"hierarchy_types"}`
to all ACTIVE hierarchies of typology 4; truncating to `[0]` reported it as a plain link to
`ds1` and, because the map is what an LLM reads to understand the ontology, taught every
consumer a false shape of the model. Cataloguing decisions get made off this artifact, so a
silently narrowed one is worse than none.

The plural name is part of the fix: `target` singular invited the truncation in the first
place, and a consumer reading `target` on the new artifact now gets `undefined` — a loud
break — rather than silently keeping the first element of something it never saw was a list.

## What a consumer must expect

1. Read `target_sections` (array). `target` no longer exists on any field.
2. Absence still means "this field has no link target", unchanged.
3. A single-target field is the length-1 case; there is no scalar form to special-case.

## Gate reconciliation

- `test/unit/ontology_data_io.test.ts` — the llm_map case asserts the FULL list
  (`['rsc197','rsc176']` for a two-target field) and that a scalar field carries no
  `target_sections` key at all.

**Re-harvest: NOT APPLICABLE.** The artifact is generated, not harvested; no frozen fixture
carries an llm-map body (measured). Per `engineering/ORACLE_HARVEST.md` a re-harvest is
impossible by definition in any case — the unit gate above is this shape's only baseline.
