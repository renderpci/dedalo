# area_thesaurus

> The back-office area that renders and edits the **hierarchical thesaurus
> trees** (taxonomies under the `hierarchy` TLD and project thesauri), and the
> host of the client tree widget.

> See also: [area](area.md) · [area_ontology](area_ontology.md) ·
> [TS tree (ts_object)](../ontology/ts_object.md) ·
> [Sections](../sections/index.md) · [Components](../components/index.md)

This page assumes you already know what an [area](area.md) is — a top-level menu
grouping that is an ontology node, owns no records of its own, and groups
sections. The tree machinery itself (node builder, mutations API, client widget)
is documented in [TS tree](../ontology/ts_object.md); this page covers only how
`area_thesaurus` *drives* that machinery.

## Role

`area_thesaurus` presents **every active thesaurus as an expandable tree** in one
screen. It resolves which hierarchies are active, groups them by typology,
supplies the root terms each tree starts from, and powers thesaurus search with
full ancestor-path resolution.

The tree rows themselves are *not* built here: each row is a section rendered as
a [`ts_object`](../ontology/ts_object.md) node, and every mutation (add child,
reparent, save order) belongs to that subsystem. `area_thesaurus` is the host.

In the area behavior taxonomy (`src/core/concepts/area.ts`) it carries the
`tree` behavior, which it shares with [area_ontology](area_ontology.md) — the
same area pointed at the ontology hierarchy instead. The two are **one
implementation**, selected by an argument.

## Where the engine lives

| module | what it does |
| --- | --- |
| `src/core/area/tree.ts` — `readAreaHierarchyData` | The boot payload: the active hierarchies, their root terms and children tipos, and the typology list. |
| `src/core/area/read.ts` — `readTreeArea` | The `tree` behavior branch: the per-hierarchy permission filter, the structure context (with the `section_tipo` override and the `thesaurus_mode` stamp), and the optional pre-executed search. |
| `src/core/ts_object/search.ts` — `searchThesaurus`, `getHierarchyTermsSqo` | Search with path resolution, and the SQO that scopes a search to chosen hierarchy terms. |
| `src/core/ts_object/` | The tree rows themselves — node assembly, expand, move, add, order. Shared with the ontology area. |

## Responsibilities

- **Active-hierarchy resolution** — determine which hierarchies are live, skip
  those that are not `active_in_thesaurus`, or have no typology, no root terms or
  no `children_tipo`.
- **Typology grouping** — resolve each hierarchy's typology id, label and order
  so the client can group the trees under collapsible typology blocks.
- **Root-term supply** — provide the root-term locators each tree starts from,
  and the `children_tipo` the client needs to expand each root.
- **Permission filtering** — drop every hierarchy the reader may not read, and
  every root term whose section they may not read.
- **Thesaurus search with path resolution** — run an SQO and, for every hit, walk
  its ancestors and emit the tree data for the whole branch, so the client can
  rebuild and highlight the path to each result.

It persists nothing: like every area it holds no records.

## The storage model it reads

A thesaurus is a hierarchy of section records linked by parent/child locators.
The **child** stores the parent reference in its `relation` column under the
`component_relation_parent` tipo (`dd47`); children are always *computed* by
searching who points at a parent (`component_relation_children`).
`area_thesaurus` only reads this graph — to find root terms, to iterate children
when building search paths, and to walk ancestors. The authoritative description
lives in [TS tree](../ontology/ts_object.md) and the
[`component_relation_parent`](../components/component_relation_parent.md) /
[`component_relation_children`](../components/component_relation_children.md)
references.

## The boot payload

`readAreaHierarchyData(model, areaTipo, lang, termsAreModel)` turns each active
hierarchy element into one tree root group. The fields it stamps:

| field | meaning |
| --- | --- |
| `section_id`, `section_tipo` | the hierarchy *definition* record (in `hierarchy1`, or `ontology35` for the ontology area) |
| `target_section_tipo` | the section whose records *are* the tree terms |
| `target_section_name` | the hierarchy element's name |
| `children_tipo` | the `component_relation_children` tipo the client uses to expand a node |
| `typology_section_id` | the typology this hierarchy belongs to |
| `order` | the hierarchy's order |
| `type` | always `'hierarchy'` |
| `active_in_thesaurus` | the element's thesaurus-active flag |
| `root_terms` | the root-term locators the tree starts from |

`readTreeArea` then wraps it: it filters the hierarchies by read permission,
rebuilds the typology list from the survivors, builds the structure context, and
attaches `ts_search` when a search was requested.

### What the client receives

```json
{
    "tipo": "dd100",
    "value": [
        {
            "section_id": "1",
            "section_tipo": "hierarchy1",
            "target_section_tipo": "es1",
            "target_section_name": "Onomastic places (Spain)",
            "children_tipo": "es44",
            "typology_section_id": "7",
            "order": 3,
            "type": "hierarchy",
            "active_in_thesaurus": true,
            "root_terms": [ { "section_tipo": "es1", "section_id": "1" } ]
        }
    ],
    "typologies": [
        { "section_id": "7", "type": "typology", "label": "Geographic", "order": 3 }
    ],
    "ts_search": { "result": [], "found": [], "total": 0 }
}
```

`ts_search` is present only when a search — or the area's pinned
`properties.hierarchy_terms` — was requested.

!!! note "Illustrative tipos"
    The `tipo` / `section_tipo` / `children_tipo` values above are examples; the
    real values are installation-specific ontology tipos. The *structure* — field
    names and nesting — is the contract.

## The context: two stamps the client needs

`readTreeArea` builds the area's structure context and then stamps two things
onto it:

- `section_tipo` is set to the **area tipo**, so the search panel can store
  per-area presets against it;
- `thesaurus_mode` is set from the area node's `properties.thesaurus_mode`,
  defaulting to `'default'`.

!!! warning "The context must never be empty"
    An area read that returns an empty `context` makes the client render the area
    **blank**. Every area read returns a non-empty context; the tree client guards
    on it explicitly.

## Search with path resolution

`searchThesaurus(sqo, principal)` (`src/core/ts_object/search.ts`) does three
things:

1. **Sanitizes** the untrusted client SQO and builds the SQL through the shared
   search chokepoint, so the principal's project filter and permissions apply.
2. For every hit, **walks its ancestors** (`getParentsRecursive`,
   `src/core/relations/parent.ts`), memoized per call, and reverses the chain so
   the root comes first.
3. For every node on every path, **builds the tree data** for the whole branch —
   root, each ancestor, and that ancestor's children — batch-resolving the
   children's indexable flag with one query for the whole child set rather than
   one per child. Nodes are keyed by `section_tipo:section_id`, so a branch shared
   by two hits is emitted once.

It returns `{ result, msg, errors, total, found }`: `found` is the raw hit
locators, `result` is the tree data covering every branch that leads to one.

`getHierarchyTermsSqo(hierarchyTerms)` builds the SQO that scopes a search to a
chosen set of `{section_tipo, section_id}` terms — used to seed a search from the
area's pinned `properties.hierarchy_terms`.

A search reaches the area two ways: the client sends
`source.search_action = 'search'` together with an `rqo.sqo`, or the area node
carries `properties.hierarchy_terms`. Either way the request-specific values are
never baked into the shared structure-context cache.

## How it fits with the rest of Dédalo

- **[TS tree (`ts_object` / `dd_ts_api`)](../ontology/ts_object.md)** — the area is
  the *host*; every tree row is a `ts_object`. The area supplies roots and search
  paths; expand/collapse, children resolution, term rendering and all mutations
  live in the tree subsystem. Build a `ts_object` from a node; never reimplement
  node rendering here.
- **[area_ontology](area_ontology.md)** — the same area in ontology mode.
- **[hierarchy](../ontology/hierarchy.md)** — the active-element registry and the
  root-term / main-order source.
- **[area](area.md)** — the area family reference: behavior taxonomy, menu walk,
  write refusal.
- **[Sections](../sections/index.md)** — each tree term is a record of a section.
- **[Components](../components/index.md)** — the tree leans on
  [`component_relation_parent`](../components/component_relation_parent.md) and
  [`component_relation_children`](../components/component_relation_children.md)
  for its edges, [`component_select`](../components/component_select.md) for the
  typology, and the text components for labels.
- **[Search (SQO)](../sqo.md)** — the query format `searchThesaurus` consumes.

## Related

- [TS tree (ts_object)](../ontology/ts_object.md) — the node builder, the
  mutations API and the client tree widget the area hosts.
- [area](area.md) — the area reference.
- [area_ontology](area_ontology.md) — the same machinery in ontology mode.
- [hierarchy](../ontology/hierarchy.md) — active elements, root terms, main order.
- [component_relation_parent](../components/component_relation_parent.md) ·
  [component_relation_children](../components/component_relation_children.md) —
  the parent/child edges of the tree.
- [Sections](../sections/index.md) — the records that are the tree terms.
- [SQO](../sqo.md) — the query format used by thesaurus search.
- [Architecture overview](../architecture_overview.md) — areas → sections →
  components → data.
