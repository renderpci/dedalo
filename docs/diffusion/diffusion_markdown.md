# Markdown diffusion

> See also: [The diffusion engine](native_engine.md) · [Diffusion (system overview)](../core/system/diffusion.md) · [Diffusion data flow](diffusion_data_flow.md)

`markdown` is a file-based diffusion output format (alongside `sql`, `csv`,
`json`, `rdf` and `xml`). It publishes **one Markdown file per record** so that
AI agents — and humans — can read a record's data comfortably: a plain-text
document with headings, per-language values, media links and links to the
related records' own files. It is configured in the diffusion ontology like any
other format and rides the full engine pipeline — plan compilation, the
publication gate, cross-section resolution, delete propagation and the dd1758
ledger. This page documents only what is specific to the Markdown format; the
shared machinery is in [The diffusion engine](native_engine.md).

## Behaviour at a glance

| Aspect | Markdown |
| --- | --- |
| Field selection | **Curated** via the ontology `ddo_map` (same as every format), not a generic dump |
| Output unit | **One `.md` per record** |
| File path | `<media>/markdown/{service_name}/{section_tipo}_{section_id}.md` |
| Run output | The per-record files plus a downloadable **zip** of the run (no merged file — each `.md` is self-contained) |
| Access | Public (parity with RDF/XML); only records that pass the publication gate are written |
| Relations | The **flattened value** the projection produced — the writer emits no cross-file links |
| Depth | The *resolve levels* budget drives how deep related records are published, so a related record gets its own `.md` |
| Document header | YAML frontmatter + `# {table_name}` |
| Writer | `src/diffusion/writers/markdown.ts` |

## Deterministic output

Files are written temp-then-rename (atomic), the zip has zeroed timestamps, and
**no wall clock leaks into the content** — a re-publish of unchanged data
produces byte-identical files. Who published what, and when, lives in the
[dd1758 ledger](../core/system/diffusion.md#publication-gate-ledger-and-media-markers),
not in the artifacts.

## Document structure

```markdown
---
section_tipo: "rsc197"
section_id: "42"
table: "interview"
diffusion_element: "oh63"
---

# interview

## lg-eng

**title**: Interview with Jane Doe
**author**: Jane Doe
**photograph**: https://example.org/dedalo/media/.../image.jpg

## lg-spa

**title**: Entrevista con Jane Doe
**author**: Jane Doe
```

(`oh63` is a real `diffusion_element` on the reference install
`monedaiberica`, where it is configured as `sql`; that install has no markdown
element yet, so the document above is shape-only — the field values are
illustrative.)

Rendering rules:

- **Frontmatter**: exactly four keys — `section_tipo`, `section_id`, `table`,
  `diffusion_element` — written as quoted YAML scalars. `section_id` is
  therefore quoted here even though a record address is an integer everywhere
  in the engine's API: this is a published document, not an API payload. The
  writer deliberately makes **no ontology lookups**, which is why no section
  label or record title appears in the block.
- **Header**: `# {table_name}` — the diffusion section node's table name.
- **One `## {lang}` block per output language**, in `ProjectedRow` order
  (`## nolan` for the language-independent row), each listing
  `**{column}**: {value}` lines in plan column order. Empty and null values are
  skipped, so documents stay compact.
- **Relation and media fields** publish the value their `ddo_map` projection
  produced — a flattened label, an id list or a media URL, exactly as any other
  format receives it. The writer adds no Markdown links or image syntax of its
  own.
- Values are escaped only for structure-breaking sequences (line-leading
  headers, a lone `---`), never HTML-escaped — readability is the goal.
- **No wall clock, no ontology reads**: both are deliberate divergences from the
  retired engine's markdown output and are what makes a re-publish
  byte-identical. They are recorded in the run report.

!!! note "Related records get their own file, not a link"
    Configure the related sections under the **same** markdown element and
    within the *resolve levels* budget and each one is published as its own
    `{section_tipo}_{section_id}.md`. Nothing in a document points at those
    files: a reader (or an agent) locates them by the file-name grammar.

## Ontology configuration

Markdown uses the **same node structure and `ddo_map` resolution as every other
format** — it is not special-cased. The canonical models are `diffusion_section`
for the section node and `diffusion_component` for the field nodes (the
SQL-typed `table` / `field_*` models are not needed; column typing is
irrelevant to markdown):

```text
diffusion_element        { "diffusion": { "type": "markdown", "service_name": "…" } }
└── diffusion_section     ──related──▶ section
    ├── diffusion_component   { "process": { "ddo_map": [ … ] } }   → component
    └── diffusion_component   { "process": { "ddo_map": [ relation chain ] } }
```

- **`diffusion_element`** — `properties->diffusion->type = "markdown"` **and**
  `service_name` (required: without it no file path resolves and nothing is
  written). The admin `validate` action reports elements missing it.
- **`diffusion_section`** — a `related` relation to the target section. This is
  the node published per record; its children are the fields.
- **`diffusion_component`** — one per published field; carries
  `properties->process->ddo_map`. The node's term becomes the column name, i.e.
  the bold label of its `**{column}**: {value}` line.

The `ddo_map` compiles into the same resolve-step tree as every format —
including **relation chains that pull related-section data into the main
record** and the cross-section *levels* recursion (see
[The diffusion engine → The ontology contract](native_engine.md#the-ontology-contract)).
Because related records enter the run through that recursion, they get their
**own `.md` automatically**, which is what makes the inline relation links
resolve.

No extra configuration keys are needed; `<media>/markdown/{service_name}/` is
created on demand.

## Delete propagation

Deleting a work record unlinks its `.md` through the **same filename grammar**
the writer uses (`{section_tipo}_{section_id}.md` under the element's service
directory) — path construction is shared, so publish and delete can never
disagree about where a record's file lives. Unpublishing during a run behaves
the same way: a record that fails the publication gate has its file removed.
Unreachable-target failures become dd1758 `unpublish_pending` rows and are
retried like every other format.

## Related

- [The diffusion engine](native_engine.md) — pipeline, job queue, formats table,
  configuration; writer source `src/diffusion/writers/markdown.ts`.
- [Diffusion (system overview)](../core/system/diffusion.md) — the conceptual
  role of publication in Dédalo.
- [Diffusion data flow](diffusion_data_flow.md) — deciding what gets published;
  resolve levels.
