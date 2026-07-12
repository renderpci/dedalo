# Ontology

> See also: [Ontology authoring](authoring.md) · [ontology (build layer)](ontology_write.md) · [Ontology engine](ontology_engine.md) · [Architecture overview](../architecture_overview.md) · [Glossary](../glossary.md)

The ontology is the live, dynamic definition of Dédalo's structure and behaviour:
it defines the sections, components, relations, tools, data formats and outputs of
the whole system. It is consulted at execution time, so editing the ontology
changes Dédalo's behaviour in real time without touching the code or the database
schema. This page is the conceptual entry point; the [reading list](#in-this-section)
at the end links to every page in this directory.

## What the Dédalo ontology is

The ontology is the foundational schema that governs how information is organised,
stored and presented. It defines every element of the application, from data
models and user interfaces to workflows and outputs. This abstraction layer
allows flexible, scalable management of diverse cultural-heritage data.

Dédalo's ontology uses a correspondence system based on **models** (elements) and
**nodes** (definitions or instances). For example, to define a `section`
(analogous to an SQL table) you create a node in the ontology with the model
`section`. This lets the system manage the records of that section in the
database, with specific data processors defined as child nodes of that node —
[components](../components/index.md) (analogous to SQL fields), groups, view
definitions and more.

### Key features of the ontology

**Model–node structure.** The ontology uses a model–node structure where *models*
represent data types (sections, components, …) and *nodes* are specific instances
or definitions of those models. This structure allows the dynamic, hierarchical
organisation of data elements.

**TLD organisation.** All terms in the ontology are organised by Top-Level Domains
(TLDs) — identifying codes that let the ontology grow to fit specific needs
without conflicts. This system ensures scalability and customisation. Every TLD
defines a specific part of the ontology with a meaning:

| **TLD** | Definition |
| --- | --- |
| **dd** | Dédalo core definition; used for general aspects such as `Cultural heritage fields` (`Tangible`, `Oral History`), `Administration`, `Dédalo users`, etc. |
| **rsc** | Resource; used to define media elements such as `Audiovisual`, `Image`, `SVG`, `PDF`, etc., including `Publications`, `Restoration processes` and other common sections shared across the system |
| **ontology** | Ontology definition; used to create the ontology definition itself |
| **hierarchy** | Thesaurus definition; used to manage any kind of thesaurus or taxonomy such as `Onomastic`, `Material`, `Techniques`, etc., as well as `Tipology` catalogues |
| **lg** | Languages; the definition of the languages used throughout the application to translate data and the interface |
| **utoponymy** | Unofficial toponymy. Section definition for unofficial place names — places that are not in a country's official toponymy, or that an installation does not want to import (used to point at a place without an official term in sections such as Publications, to record any place of publication around the world) |
| **oh** | Oral History; the sections and tools for oral-history projects, such as `Interviews`, `Transcription`, `Indexation`, etc. |
| **ich** | Intangible Cultural Heritage; the sections and tools for intangible heritage, such as elements, processes, communities, symbolic acts, etc. |
| **tch** | Tangible Heritage; the sections and tools for tangible heritage, such as objects, collectors, informants, etc. |
| **tchi** | Tangible Heritage Immovable; the sections and tools for immovable tangible heritage, such as archaeological sites, finds, alquerías, etc. |

**Unique identification for every node (`tipo`).** Each node in the ontology is
uniquely identified by a combination of its TLD and a sequential number. For
example, `dd5` is the fifth node within the `dd` TLD (`dd` is the TLD and `5` the
sequence). This identifier lets Dédalo instantiate a unique object based on a
specific model.

**Dynamic object creation.** At runtime Dédalo builds programming objects from the
ontology in real time, so changes to the ontology can alter the application's
behaviour without modifying the underlying code.

**Format abstraction.** The ontology lets Dédalo interpret and translate data into
multiple formats, including RDF, JSON-LD, SQL, CSV, XML, Dublin Core and HTML.
This flexibility eases data sharing and integration with other systems.

**Linked-data model.** Dédalo is built on a linked-data model and uses a relative,
multi-reference, universal [locator](../locator.md). This locator can address
entities, sections, components and tags, allowing precise data retrieval and
management.

### Practical applications

Dédalo's ontology supports many cultural-heritage domains, including:

- **Oral history** — managing interviews and personal narratives.
- **Archaeology** — documenting excavation records and artefacts.
- **Numismatics** — cataloguing coin collections and monetary artefacts.
- **Ethnology** — recording cultural practices and traditions.
- **Memory** — managing archives, documentation, people and social events.

The system's flexibility lets institutions tailor the ontology to their needs,
ensuring accurate representation and management of diverse cultural-heritage
materials.

### Benefits of using Dédalo's ontology

- **Customisation** — organisations can adapt the ontology to their own data
  structures and workflows.
- **Scalability** — the TLD system and dynamic object creation support the growth
  and evolution of the ontology alongside institutional needs.
- **Interoperability** — multiformat output and a linked-data model ease
  integration with other systems and platforms.
- **Efficiency** — real-time object creation and dynamic behaviour adjustment
  reduce the need for extensive coding, streamlining the management process.

## Shared, standardised and common ontologies

Any Dédalo installation can implement a shared ontology. Shared ontologies are
common definitions for managing specific kinds of cultural heritage. They are
defined by the community and used across different projects and institutions, so
you can create inventories, catalogues, archives and research without starting
from scratch. These common definitions have been refined over years by the
curators and researchers who use Dédalo, and are the result of long discussions
about how Dédalo should manage cultural-heritage assets. Implementing a shared
ontology is a very good way to start using Dédalo.

### Benefits of shared ontologies

- The definition is ready to use, so you can start creating data quickly.
- The ontology has many features that cover practically any need.
- You can share your data with other Dédalo installations easily.
- You get new definitions, configurations and updates automatically.
- Data changes are carried by the update process, so your data stays coherent with
  the changes.
- They are developed and maintained by the community, so projects do not need to
  spend time and money creating new ones.

### Drawbacks of shared ontologies

- A shared ontology changes only when the community agrees on the change. This
  takes time and can be a long process.
- It may not cover every specific aspect or need.

## Local ontology

Users or institutions can create a local ontology that is not necessarily aligned
with shared, global or standardised ontologies.

Dédalo provides two ways to add a local ontology:

1. Creating a custom TLD for the ontology.
2. Overriding specific nodes of a shared / standard ontology.

### Creating a custom TLD

Users and institutions can create their own TLDs to build their own ontology
definitions. A custom TLD must be unique and must not conflict with existing
shared TLDs. Therefore, do not use `dd`, `tch` or any other defined shared and
common TLD. A good practice is to use the name of the institution or museum, such
as `mupreva` (Museu de Prehistòria de València).

#### Creating a new TLD

1. Log in as the root user, or as a user with the privileges to access the
   Ontology.
2. Navigate to `Ontology -> Ontologies main` in the menu.
3. Create a new record.
4. Set the new TLD and fill in the fields with your custom ontology name, main
   language, typology, etc.
5. Make sure the *Real section tipo* field is defined as `ontology1`.
6. Press the *create ontology* button in the inspector. This creates the new
   ontology and makes it ready to use.

#### Creating the nodes

Nodes in a local ontology are extensions of the common/shared ontology, and each
must be linked to an existing node to appear in the ontology tree. For example, to
extend the `Objects` section [tch1](https://dedalo.dev/ontology/tch1) you specify
in your node that `tch1` is its parent. Or, to create a whole new definition for
`Intangible Heritage`, you can set your node's parent to the `Intangible` area
[dd323](https://dedalo.dev/ontology/dd323), which lets you create new areas or
sections within your node. If you do not link your root nodes to existing nodes,
your definition will still work but will not be accessible in the menu or in the
place where you want it to act.

!!! note "Mandatory TLDs"
    Dédalo uses four main TLDs as its core definition, and you cannot remove them:
    `dd`, `ontology`, `lg`, `hierarchy`. Why? Because the main features — login,
    profiles, tables, tools, the ontology definition and the multi-language
    features — are defined by these TLDs.

    A note on the `rsc` TLD: it is not core, but it is an important definition
    because it manages all media (image, audiovisual, PDF, SVG, 3D, …), people,
    entities, etc. Although it is not mandatory, it is almost essential. (You can
    build your own media management, but it is hard to do.)

#### Creating the first node

When you create a new TLD you define a `Typology` for it. This typology helps
organise the ontology definitions and lets you reach them through the menu.

So, to create the first node, open your ontology section in the menu by navigating
to `Ontology -> Instances -> <typology> -> <Your_ontology_name>`, where
`<typology>` is the typology defined in `Ontology main` and `<Your_ontology_name>`
is the name you gave in `Ontology main`. Then create the new node.

## In this section

- **[Ontology authoring](authoring.md)** — the curator/developer reference for
  *writing* the ontology: the shape of a node, creating sections / components /
  groups / tools, the `properties` descriptor grammar, and how an edit becomes
  live.
- **[ontology (build layer)](ontology_write.md)** — the write/compile layer that
  owns the editable definitions and compiles them into the flat runtime
  `dd_ontology` table.
- **[Ontology engine](ontology_engine.md)** — the runtime accessor every
  request uses to read a node (model, label, parent, children, relations) from
  `dd_ontology`.
- **[hierarchy](hierarchy.md)** — the `hierarchy` TLD: the master records
  describing each thesaurus tree, the virtual term sections, and the
  configuration lookups the tree machinery depends on.
- **[`ts_object`](ts_object.md)** — the server node builder that turns a `ddo_map`
  into the JSON shape of one thesaurus/ontology tree node consumed by the client
  tree widget.
- **[section_map resolver](section_map.md)** — the global scope/term resolver that
  maps a `tipo` to its real section and term.
- **[relation_list](relation_list.md)** — the inverse (backlink) view that renders
  "who points at this record" and feeds the diffusion `dd_relations` adapter.
- **[Request config presets](request_config_presets.md)** — how privileged users
  override the default section-layout ontology definition with per-installation
  layout maps.
