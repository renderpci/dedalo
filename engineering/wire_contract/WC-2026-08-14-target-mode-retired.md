# WC-2026-08-14-target-mode-retired — `properties.target_mode` / `target_values` are no longer read

- **Date:** 2026-08-14 (landed with `src/core/ontology/model_section.ts`; same change as
  `WC-2026-08-14-relation-model-target-in-sqo` and
  `WC-2026-08-14-non-section-target-refused`).
- **Decision:** retire a model-private target grammar in favour of the sqo every other
  component already uses. (Canon: `engineering/RELATIONS_SPEC.md` §6.7;
  `docs/core/components/component_relation_model.md`, the "Retired" admonition.)

## Shape before (PHP)

`component_relation_model::get_ar_target_section_tipo` (v6
`class.component_relation_model.php:143-150`, frozen v7 `:143-150`) short-circuited on a
node property before it ever consulted the registry:

```php
switch ($target_mode) {
    case 'free':
        $ar_target_section_tipo = (array)$this->properties->target_values;
        break;
    default: /* the hierarchy registry, then tld+'2' */
}
```

So a node declaring

```json
{ "target_mode": "free", "target_values": ["dd922"] }
```

served `dd922`'s records as its options, and emitted `target_sections: [{tipo: "dd922"}]`.

## Shape after (TS)

Both keys are IGNORED. The node resolves by the ordinary rule (its declared sqo, else the
model default), and the engine emits ONE `console.error` per build naming the node and the
exact replacement sqo:

```
[request_config/build] node 'test169' carries RETIRED properties.target_mode ('free') —
no longer read. Replace it with an explicit sqo section_tipo entry
{"source":"section","value":["dd922"]}. Resolving by the ordinary rule.
```

Emitted from `reportRetiredTargetMode` (`src/core/relations/request_config/build.ts`).

## Reason

`target_mode:'free'` + `target_values` is a second grammar for a fact the sqo already
states: "this component's options come from section X" is
`sqo.section_tipo: [{"source":"section","value":["X"]}]` for every other component in the
system. Keeping it would mean every reader of a `component_relation_model` node has to
check two places to learn where it points, and every new target source would have to be
taught twice. It appears in NO shipped ontology seed (`install/`), and on the reference
install its only carrier is the playground node `test169`.

## Blast radius and the migration

A node still carrying the retired keys does not silently keep working — it resolves by the
ordinary rule, which for `test169` (section `test3`, no registry row) is the `<tld>2`
fallback `test2`: a real but semantically unrelated section. That is why the retirement is
**loud** rather than silent, and why the ontology migration is not optional:

| node | replacement `sqo.section_tipo` |
|---|---|
| `test169` | `[{"source":"section","value":["dd922"]}]` |

Until that lands, `test169` emits the error above on every build and offers `test2`'s
records. No other node on the reference install is affected.

## Gates

- `src/core/relations/request_config/build.ts` — `reportRetiredTargetMode`, the tripline.
- `bun run test:client` drives `test169`
  (`client/dedalo/test/client/js/test_component_relation_model.js`), so the client suite
  is where a missed migration surfaces as behaviour rather than as a log line.
