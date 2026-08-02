# WC-2026-08-02-register-tools-registry-state — `register_tools` get_value: the declared version, and ONE server-side drift verdict

- **Date adopted:** 2026-08-02.
- **Decision:** no DEC — a defect fix (the panel could not show the state it
  exists to show) plus the deduplication that keeps it fixed. Extends
  [WC-057](WC-057-register-tools-panel-joins-tools-tree.md), which introduced the
  registry ⋈ tools-tree join this builds on.

## Shape before (TS)

`register_tools::get_value` served `{datalist, errors}`, and each row's two
version fields came from ONE side of the join:

```js
version:           row.version,   // ← the dd1324 registry row
installed_version: row.version,   // ← the same value, again
```

WC-057 recorded this as deliberate ("the registry is this engine's only parsed
copy of a tool's declared version"). It is not tenable: the client contract has
always been `version` = *declared in register.json*, `installed_version` =
*stored in the ontology DB* (`render_register_tools.js` module header), and the
panel's whole purpose is to show them DIVERGING. Serving one value into both made
them equal by construction, so the client's mismatch alert (`installed_version
!== version` → red cell) and the widget's `danger` card badge were unreachable
code. Live example: `tools/tool_indexation/register.json` declared `2.1.1` while
dd1324 held `2.1.0`; the panel showed `2.1.0 / 2.1.0` and reported health.

Consumers each re-derived "is this tool drifted?" from the raw fields. The
maintenance map's Tools node (`render_area_maintenance.js`) had its own copy that
compared nothing — it warned only on `errors` (the dd1644 ontology pre-flight)
and otherwise printed `N tools / registered` in green, directly above a panel
rendering the drift in red.

## Shape after (TS)

`result` = `{datalist, errors, registry_state}`.

Each datalist row gains **`state`** — `'ok' | 'outdated' | 'unregistered' |
'missing'` — the widget's single classification of that row:

| state | meaning | resolution |
|---|---|---|
| `ok` | registered, on disk, same version | — |
| `outdated` | both versions known and different (the REGISTRY is stale) | press *Register tools* |
| `unregistered` | on disk, no registry row | press *Register tools* |
| `missing` | registered, no directory | the importer cannot reach it: delete the row or restore the files |

and `version` now holds what the directory's `register.json` DECLARES
(`readDeclaredVersion`, both register formats; `null` for a v6/unparsable file,
and `null` for a registry row with no directory — nothing declares anything
there). `installed_version` keeps its meaning: the dd1324 value.

`result.registry_state` is that same verdict summarised —
`{total, outdated:[names], unregistered:[names], missing:[names]}`, names in the
datalist's sorted order — so a consumer that only needs the verdict never walks
the rows.

## Reason

Two consumers read this response (the panel table and the map's Tools node) and
a third state (the `.version_notice` sentence above the table) is composed from
it. With the predicates living in each consumer they were free to disagree, and
they did: the map's summary contradicted the widget it summarises, which is worse
than no summary at all. The classification is a property of the JOIN, so it
belongs where the join happens. The client gates now read `item.state` and
`result.registry_state` and re-derive nothing.

## Gates

- `test/unit/register_tools_panel.test.ts`
  - `version is read from disk, installed_version from the registry` — every
    on-disk row's `version` equals `readDeclaredVersion(dir)`;
  - `registry_state is exactly the per-row states, summarised` — the summary is
    the rows' own classification, and the classification follows from the two
    sides of the join;
  - the ghost-row assertion pins `state:'missing'` and `version:null` for a
    registry row whose directory is gone.
- PHP oracle: none — `register_tools` widget responses are not in the frozen
  fixture store (`widgets_differential` covers other widgets), so no re-harvest
  is required. The PHP fossil for these fields is recorded in WC-057.
