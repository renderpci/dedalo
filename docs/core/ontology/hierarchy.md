# hierarchy

> The machinery that manages the **`hierarchy` TLD**: the master records that describe each thesaurus/taxonomy tree, the *virtual sections* their terms live in, and the high-speed configuration lookups (main language, section map) that the tree depends on.

> See also: [Thesaurus & ontology tree](../thesaurus/index.md) · [Ontology](index.md) · [Sections](../sections/index.md) · [section_map resolver](section_map.md)

This page is the **module-level reference** for the `hierarchy` TLD's back-office
machinery. For the *conceptual* model — what a thesaurus tree is, how a term
stores its parent, descriptors/ND, how the client tree renders — read
[Thesaurus & ontology tree](../thesaurus/index.md) first; this document does not
repeat that material at length. It focuses on the real modules, their real
exports and the data they own.

## Role

The `hierarchy` TLD is the part of the ontology that defines **controlled
vocabularies**: toponymy, onomastic, thematic thesauri, material/technique
taxonomies, typology catalogues. Its machinery has three jobs, and each lives in
its own purpose-built module rather than in one shared object:

| job | module |
| --- | --- |
| **Materialise the term storage** (activate a hierarchy) | `src/core/ontology/hierarchy_provision.ts` — `generateVirtualSection()` |
| **Serve fast lookups** (main language, section_map) | `src/core/ts_object/term_resolver.ts` (private `getMainLang()`) + `src/core/ontology/section_map.ts` (`getSectionMap()`, `getSectionMapValue()`) |
| **Seed root terms** | `src/core/ontology/hierarchy_provision.ts` — `createThesaurusGeneralTerm()` |

Two adjacent surfaces round it out:

| job | module |
| --- | --- |
| **Schema snapshot / diff** (at ontology-update time) | `src/core/ontology/ontology_update.ts` — `saveSimpleSchemaFile()` |
| **Status sync** ("active in thesaurus" → "active") | `src/core/area_maintenance/widgets/export_hierarchy.ts` |

Reading a `hierarchy1` master record has **no single reusable function**: each
caller queries `matrix_hierarchy_main` for exactly what it needs (the TLD→lang
lookup inside `getMainLang()`, the active-hierarchy sweep in the
`export_hierarchy` widget, the tree-boot projection in `src/core/area/tree.ts`).

## Responsibilities

- **Virtual sections** — `generateVirtualSection()`
  (`src/core/ontology/hierarchy_provision.ts`) generates the descriptor
  (`{tld}1`) and model (`{tld}2`) sections from a master record, wiring their
  `dd_ontology` nodes, parent groupers and the master record's target-section
  pointers, inside ONE transaction: any validation or write failure rolls the
  whole thing back. **User-permission grants ARE written**: the creating user's
  profile is granted level `2` over the two new sections and every element
  inside them (`setSectionPermissions()`,
  `src/core/security/section_permissions.ts`), or the hierarchy they just built
  would be invisible to them. A failed grant is **non-fatal**: the error is
  collected in `response.errors` and provisioning is not rolled back.
- **Configuration lookups** — a thesaurus section's **main language**
  (`getMainLang()`, private to `term_resolver.ts`) and its **section_map**
  element tipos (`getSectionMap()` / `getSectionMapValue()`,
  `ontology/section_map.ts`), each with its own module-level cache.
- **Root terms** — `createThesaurusGeneralTerm()` (`hierarchy_provision.ts`)
  seeds the "General term" root a thesaurus shows at the top of a tree. It does
  not rename the new term after the hierarchy — the seed itself is what the tree
  needs to render.
- **Schema diffing** — `saveSimpleSchemaFile()`
  (`src/core/ontology/ontology_update.ts`) writes an **additions-only** diff of
  the section→children schema under `<private>/backups/ontology/changes/`, as
  part of the ontology update flow. Only a filesystem failure fails it; the diff
  itself always succeeds.
- **Export** — the `export_hierarchy` action of the `export_hierarchy` widget is
  **deliberately refused** (`engineDenied`,
  `src/core/area_maintenance/widgets/export_hierarchy.ts`): a boundary, not a
  missing wire-up. The widget's live action is the status sync below.
- **Status sync** — the widget's `sync_hierarchy_active_status` action
  propagates "Active in thesaurus" (`hierarchy125`) to "Active" (`hierarchy4`),
  deactivating hierarchies not in the thesaurus (the 'People'/`rsc197` hierarchy
  exempted), writing through the standard component save path (Time Machine row
  included).

## Key concepts

### Master record vs virtual sections

A hierarchy lives in **two layers**:

| layer | where | what it holds |
| --- | --- | --- |
| **Master record** | section `hierarchy1`, table `matrix_hierarchy_main` | The definition of one tree: tld (`hierarchy6`), name (`hierarchy5`), main lang (`hierarchy8`), typology (`hierarchy9`), active flag (`hierarchy4`), source real section (`hierarchy109`), target sections (`hierarchy53` / `hierarchy58`) and the root-term portals (`hierarchy45` / `hierarchy59`). |
| **Term sections** | the *virtual* sections `{tld}1` (descriptors) and `{tld}2` (model) | The actual vocabulary records (`es1_5`, `es2_3`, …), each with its term value, descriptor/indexable flags and parent locator. |

The two layers are connected by `generateVirtualSection()`
(`src/core/ontology/hierarchy_provision.ts`): it reads the master record and
validates it — active flag, tld, source real section, typology, name, in that
order — then creates the two virtual sections plus their ontology nodes inside
one transaction. The virtual sections **contain no components of their own**:
they inherit their entire definition from a real section (`hierarchy20`) through
the section virtual-resolution mechanism.

### The hierarchy tipos it depends on

The named tipo constants live in a single source of truth,
`src/core/ontology/ontology_tipos.ts`. The load-bearing ones:

| constant | tipo | meaning |
| --- | --- | --- |
| `HIERARCHY_MAIN_SECTION` | `hierarchy1` | the master section |
| `HIERARCHY_ACTIVE` | `hierarchy4` | "Active" si/no flag of the master record |
| `HIERARCHY_TERM` | `hierarchy5` | master record name |
| `HIERARCHY_TLD` | `hierarchy6` | the tld (e.g. `es`) that seeds the virtual-section tipos |
| `HIERARCHY_LANG` | `hierarchy8` | the tree's main language locator |
| `HIERARCHY_TYPOLOGY` | `hierarchy9` | typology (thematic / toponymy / …) |
| `HIERARCHY_TARGET_SECTION` | `hierarchy53` | the descriptor target section (`{tld}1`) |
| `HIERARCHY_TARGET_SECTION_MODEL` | `hierarchy58` | the model target section (`{tld}2`) |
| `HIERARCHY_GENERAL_TERM` | `hierarchy45` | "General term" root-term portal |
| `HIERARCHY_GENERAL_TERM_MODEL` | `hierarchy59` | "General term model" root-term portal |
| `HIERARCHY_SOURCE_REAL_SECTION` | `hierarchy109` | the real section the virtual sections inherit from |
| `HIERARCHY_ACTIVE_IN_THESAURUS` | `hierarchy125` | "Active in thesaurus" flag, swept by the status-sync widget action |

!!! note "Children are portals, not relation_children"
    The "General term" root is a `component_portal`
    (`hierarchy45`/`hierarchy59`), not a `component_relation_children`.
    `createThesaurusGeneralTerm()` writes the portal link locator directly.

### Module-level state

There is no single object holding config or caches; each module owns its own:

| cache | module | purpose |
| --- | --- | --- |
| `mainLangCache` | `ts_object/term_resolver.ts` | `section_tipo → 'lg-xxx'` main-language cache (bounded only by the invalidation hub's full flush — no size cap). |
| `sectionMapCache` | `ontology/section_map.ts` | `section_tipo → section_map properties` cache. |
| `termByLocatorCache` | `ts_object/term_resolver.ts` | The resolved-term cache, bounded to 1000 entries; on overflow the **whole cache is dropped** (an O(1) eviction, not an LRU trim). |

The active-hierarchies list is not cached beyond the request: the closest thing
to one is the tree-boot projection in `src/core/area/tree.ts`.

## Instantiation & lifecycle

Nothing to instantiate — every entry point is a plain exported `async
function`. The "lifecycle" that matters is cache invalidation, which is
automatic (see below), not something you call:

```ts
import { generateVirtualSection, createThesaurusGeneralTerm } from
  'src/core/ontology/hierarchy_provision.ts';
import { getSectionMapValue } from 'src/core/ontology/section_map.ts';

// Activate a hierarchy: create its {tld}1/{tld}2 virtual sections.
const response = await generateVirtualSection({ section_id: 3, section_tipo: 'hierarchy1' });
// response = { result, msg, errors }

// Resolve the 'term' element tipo of a thesaurus section (scope chain
// main → thesaurus → relation_list).
const termTipo = await getSectionMapValue('es1', 'thesaurus', 'term');
```

### Cache invalidation

One long-lived process serves every request, so these caches must be dropped
when the ontology changes. That happens **structurally**: each of them registers
its clear function with `clearOntologyDerivedCaches()`
(`src/core/ontology/cache_invalidation.ts`) — the single chokepoint every
`dd_ontology` write fans out to. `termByLocatorCache` additionally exposes a
targeted `invalidateNode()` eviction the tree calls directly after a mutation,
so a node edit does not wait for an ontology write.

## Public API

### Virtual section generation

| function | module | purpose |
| --- | --- | --- |
| `generateVirtualSection(options)` | `ontology/hierarchy_provision.ts` | Validates the master record (active / tld / source-section / typology / name, in that order), then — inside **one transaction** — provisions the descriptor + model virtual sections, their `dd_ontology` nodes, parent groupers, and writes the master record's target-section pointers back. Grants the creating user's profile level `2` over both new sections (`setSectionPermissions()`); a failed grant is non-fatal. |
| *(inline)* `` `${tld}1` `` / `` `${tld}2` `` | `ontology/hierarchy_provision.ts` | The descriptor / model section tipos are pure string concatenation from the TLD — not exposed as named helpers. |

### Configuration lookups (the hot path)

| function | module | purpose |
| --- | --- | --- |
| `getMainLang(sectionTipo)` *(private)* | `ts_object/term_resolver.ts` | Fixed `'lg-eng'` for `lg1`; otherwise a `matrix_hierarchy_main` jsonpath lookup of `hierarchy6`→`hierarchy8`, converted to `lg-xxx` via the lang record's ISO code, with a per-section fallback tail (`es1 → lg-spa`, `hierarchy1 → the configured data lang`, else `lg-eng`). **Not exported** — only reachable through `getTermByLocator()`/`getTermDataByLocator()`, which need it for the display-value fallback chain. |
| `getSectionMap(sectionTipo)` | `ontology/section_map.ts` | Returns the `section_map` element's `properties`, resolving to the real section when a virtual one has none. Cached. |
| `getSectionMapValue(sectionTipo, scope, key)` | `ontology/section_map.ts` | Per-key scope-chain walk (`main → thesaurus → relation_list`, `SCOPE_FALLBACK`). |

### Root terms

| function | module | purpose |
| --- | --- | --- |
| `createThesaurusGeneralTerm(sectionTipo, sectionId, generalTermTipo)` | `ontology/hierarchy_provision.ts` | Seeds the "General term"/"General term model" portal root — only when not already present; resolves the target section from `hierarchy53`/`hierarchy58`, appends the link locator via the shared `applyAddNewElement()` relations helper. Returns `true` when it created an element. |

### Schema diffing (ontology updates)

| function | module | purpose |
| --- | --- | --- |
| `saveSimpleSchemaFile(oldSchema, newSchema, dirPath?)` | `ontology/ontology_update.ts` | Additions-only diff of the section→children schema, written as `simple_schema_changes_<timestamp>.json` under `<private>/backups/ontology/changes/`. Only a filesystem failure fails it. |

### Export & status (the `export_hierarchy` widget)

| action | module | purpose |
| --- | --- | --- |
| `sync_hierarchy_active_status` | `area_maintenance/widgets/export_hierarchy.ts` | Deactivates every active hierarchy whose "active in thesaurus" flag is not yes (People/`rsc197` exempt), writing through the standard component save path (Time Machine row included). |
| `export_hierarchy` | `area_maintenance/widgets/export_hierarchy.ts` | **Deliberately refused** (`engineDenied`). The bulk toponymy export is not an engine action. |

## How it fits with the rest of Dédalo

The modules on this page are the *definition/config* layer for thesaurus
trees; the rendering, mutation and resolution layers sit around them:

- **[Thesaurus & ontology tree](../thesaurus/index.md)** — the conceptual
  model and the runtime tree (`ts_object`, `area_thesaurus`/`area_ontology`,
  `dd_ts_api`). The tree calls `getMainLang()`/`getSectionMap()` constantly;
  it builds nodes from the virtual sections `generateVirtualSection()`
  created. **These modules define the tree; `ts_object` draws it.**
- **[Sections](../sections/index.md)** — the descriptor/model sections
  (`es1`, `es2`, …) are **virtual sections** resolved by the section engine;
  their term records are ordinary section records.
  `generateVirtualSection()` uses `createSectionRecord()`
  (`src/core/section/record/create_record.ts`) to create them.
- **`section_map`** — `getSectionMapValue()` / `getSectionMap()`
  (`ontology/section_map.ts`) drive term/children-tipo resolution with the
  scope chain `main → thesaurus → relation_list`; see the
  [section_map resolver](section_map.md) page.
- **[Ontology](index.md)** — `hierarchy_provision.ts` calls into the write
  layer's `addMainSection()`, `createDdOntologyRootNode()`,
  `createParentGrouper()` and `insertDdOntologyRecord()`
  (`ontology/ontology_write.ts`) when materialising virtual sections.
- **Components** — terms are read/written through the same matrix
  read/write primitives as any other component data:
  `component_relation_parent` (`hierarchy36` / `dd47`) stores a term's parent,
  and the root "General term" is a `component_portal`
  (`hierarchy45`/`hierarchy59`). See
  [component_relation_parent](../components/component_relation_parent.md),
  [component_relation_children](../components/component_relation_children.md),
  [component_portal](../components/component_portal.md).
- **Term resolution** — display values for a term locator are resolved by
  `getTermByLocator()`/`getTermDataByLocator()` (`ts_object/term_resolver.ts`),
  not by anything on this page.

## Examples

### Resolve a thesaurus section's working language and a term

```ts
import { getTermByLocator } from 'src/core/ts_object/term_resolver.ts';

// getMainLang() itself is private — reached only through the term resolver,
// which falls back to it when the requested language has no value.
const label = await getTermByLocator({ section_tipo: 'es1', section_id: 42 }, 'lg-eng');
```

### Resolve the section_map's 'term' element tipo

```ts
import { getSectionMapValue } from 'src/core/ontology/section_map.ts';

const termTipo = await getSectionMapValue('es1', 'thesaurus', 'term'); // e.g. 'es16'
```

### Generate the virtual sections for an active hierarchy

```ts
import { generateVirtualSection } from 'src/core/ontology/hierarchy_provision.ts';

// options point at the master (hierarchy1) record
const response = await generateVirtualSection({ section_id: 3, section_tipo: 'hierarchy1' });
// response.result is false (with response.errors) if the master record is
// not active, or is missing its tld / source real section / typology / name.
// On success it has created e.g. es1 and es2 plus their dd_ontology nodes —
// all inside one transaction: any failure mid-sequence rolls the whole thing
// back.
```

!!! warning "generateVirtualSection() is a heavy, ordered mutation"
    It creates ontology nodes, two section records and parent groupers, and
    writes `dd_ontology` — all inside one transaction. Treat it as a one-shot
    activation action (it is what the *create hierarchy* button triggers),
    not a per-request helper. It validates the whole master record **before**
    writing anything.

## Related

- [Thesaurus & ontology tree](../thesaurus/index.md) — the conceptual tree, its
  storage model and the `ts_object` runtime/client.
- [Ontology](index.md) — the active schema and the
  [build layer](ontology_write.md) `hierarchy_provision.ts` calls into.
- [Sections](../sections/index.md) · [`section`](../sections/section.md) — the
  virtual-section mechanism.
- [section_map resolver](section_map.md) — the scope/term resolver the tree
  leans on.
- [component_relation_parent](../components/component_relation_parent.md) ·
  [component_relation_children](../components/component_relation_children.md) ·
  [component_portal](../components/component_portal.md) — the components that
  store a term's parent, compute its children and hold the root term.
- [Locator](../locator.md) — the pointer type used for parent / root-term links.
- [Architecture overview](../architecture_overview.md) — where the `hierarchy`
  TLD sits in the matrix/ontology model.
