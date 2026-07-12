# area_ontology

> The back-office area that edits **Dédalo's own ontology tree** — the same
> tree-editing machinery as `area_thesaurus`, retargeted at the ontology
> hierarchy. Superuser-only.

> See also: [area_thesaurus](area_thesaurus.md) · [area](area.md) ·
> [Ontology](../ontology/index.md) · [TS tree / ts_object](../ontology/ts_object.md) ·
> [Architecture overview](../architecture_overview.md)

This page assumes you have read [area_thesaurus](area_thesaurus.md):
`area_ontology` is the same tree area pointed at a different hierarchy, and the
two share one implementation. For the conceptual model of *what an area is*, read
[area](area.md) first.

!!! danger "Superuser-only, fail-closed"
    `area_ontology` is reserved for the **superuser** (`DEDALO_SUPERUSER`). The
    gate runs *before* any ontology read:

    - `dispatchAreaRead` (`src/core/area/read.ts`) refuses with `403` unless
      `principal.userId === SUPERUSER_ID` — checked both when the request
      declares the `area_ontology` model and when its `source.tipo` is the
      ontology area tipo (`dd5`).
    - The menu walk (`src/core/api/handlers/menu.ts`) filters the `dd5` node out
      of every non-superuser menu.

    A global admin who is not the superuser gets nothing. Editing the ontology
    rewrites the active schema of the whole installation, so this area fails
    closed by design.

## Role

`area_ontology` is the ontology model of the **Ontology editing area**.
Functionally it is the same hierarchical tree editor as the Thesaurus area, but
pointed at a different hierarchy: instead of editing curatorial thesauri (the
`hierarchy*` family stored in `matrix_hierarchy_main`), it edits **Dédalo's own
ontology** — the nodes that define sections, components, areas and tools —
stored in the `ontology*` family in `matrix_ontology_main`.

Like every [area](area.md) it holds no records of its own: it has a `tipo` but no
`section_id` and no matrix row. Its `tree` behavior means a read serves the
hierarchy boot payload the client's tree widget renders, not a dashboard.

## One implementation, two areas

The single most important fact about this area: **it is the same machinery as
`area_thesaurus`, differentiated by an argument, not by parallel code.**

`readAreaHierarchyData` (`src/core/area/tree.ts`) is one function that takes the
area model as its first argument and branches on it. There is no
`area_ontology`-specific resolver:

| concept | `area_ontology` | `area_thesaurus` |
| --- | --- | --- |
| hierarchy section tipo | `ontology35` | `hierarchy1` |
| main table | `matrix_ontology_main` | `matrix_hierarchy_main` |
| children component tipo | fixed `ontology14` | resolved per target section (its `component_relation_children`) |
| typology section id | fixed `14` | resolved per hierarchy record |
| `active_in_thesaurus` skip | **not applied** — inactive hierarchies are kept | applied |
| "no root terms" skip | **not applied** — rootless hierarchies are kept | applied |

The ontology area keeps entries a thesaurus would skip because an ontology
hierarchy must always be reachable for editing, even when it is not published.

The tree nodes themselves are built by the [`ts_object`](../ontology/ts_object.md)
stack — the ontology is just another hierarchy of parent/children relations,
walked through `component_relation_parent` / `component_relation_children`.

### Model view

The client can ask for the **model view** by sending
`source.build_options.terms_are_model = true`. `readTreeArea`
(`src/core/area/read.ts`) passes it through to `readAreaHierarchyData`, which
then reads the model-view root terms instead of the ordinary ones. In that mode
the tree line displays each node's `model`, which is what makes the ontology
readable as a schema rather than as a vocabulary.

## Reading the area

There is nothing to instantiate. A read is dispatched off `(model, tipo)`, the
superuser gate runs, and the shared resolver builds the payload:

```ts
// src/core/area/read.ts — dispatchAreaRead refuses with 403 here unless
// principal.userId === SUPERUSER_ID, before any ontology read happens.
const item = await readAreaHierarchyData('area_ontology', 'dd5', 'lg-spa', termsAreModel);
```

The dispatcher also validates the request: if `source.model` and the real
ontology model of `source.tipo` disagree, the read is refused with `400`. An
unvalidated client string cannot choose a server code path.

The response is the standard area envelope — `{context, data}` — where `data[0]`
carries the active hierarchies, their root terms and the typologies. See
[area_thesaurus](area_thesaurus.md) for the payload shape in full.

## How it fits with the rest of Dédalo

- **[area_thesaurus](area_thesaurus.md)** — the sibling tree area and the same
  implementation. Read it for the payload and the search path.
- **[Ontology](../ontology/index.md)** — the data this area edits: the active
  schema (sections, components, areas, tools) stored in `matrix_ontology_main`.
  This area is the back-office UI over that tree.
- **[TS tree / ts_object](../ontology/ts_object.md)** — the node builder,
  repository and term resolver that turn parent/children relations into
  renderable tree nodes.
- **[Sections](../sections/index.md)** / **[Components](../components/index.md)**
  — the record-bearing leaves the ontology *defines*. Editing an ontology node in
  this area changes how those sections and components behave at runtime, with no
  code change.
- **[Menu](../ui/menu.md)** — `area_ontology` is a root menu area, hidden from
  every non-superuser.

!!! warning "Extend the shared machine, not this area"
    `area_ontology` deliberately carries no logic of its own. Before adding
    behavior "for the ontology area", check whether it belongs in the shared
    resolver (`src/core/area/tree.ts`) behind its existing model branch — the two
    tree areas are intentionally kept as one machine.

## Related

- [area_thesaurus](area_thesaurus.md) — the sibling tree area (full behavior).
- [area](area.md) — the area reference.
- [Ontology](../ontology/index.md) — the active schema this area edits.
- [TS tree / ts_object](../ontology/ts_object.md) — the hierarchical-tree node stack.
- [Sections](../sections/index.md) · [Components](../components/index.md) — the
  record-bearing nodes the ontology defines.
- [Architecture overview](../architecture_overview.md) — areas → sections →
  components → data, and the ontology-as-active-schema model.
