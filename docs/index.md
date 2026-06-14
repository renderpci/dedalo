# Dédalo v7 Documentation

Dédalo is a Free and Open Source Cultural Heritage Management System for archives, censuses, inventories and catalogs — archaeology, ethnology, oral memory, numismatics and more. Unlike a generic CMS, it is built to **produce good data** and publish it.

Its defining trait is an **active ontology**: the data schema, the relations between data, the components and tools, and even much of the program behavior are defined as nodes in a thesaurus-like hierarchy and resolved at execution time. Change the ontology and Dédalo's behavior changes — usually without touching the database or the code.

Dédalo is two connected systems:

- **Work system** — the private editing application (PHP server + JavaScript/HTML/CSS client) that manages the full catalog. Data is stored as JSONB in a PostgreSQL "matrix" table.
- **Diffusion system** — a separate, public, flat copy of the data published to SQL/RDF/XML targets and served through a public API. Data flows one way only, work → diffusion.

New to the vocabulary (section, component, tipo, locator, sqo, rqo, ddo)? Read the **[Introduction & core hub](./core/index.md)** and the **[Glossary](./core/glossary.md)** first.

---

## Reading paths by role

Pick the path that matches what you are trying to do. Each is a short, ordered list — read top to bottom.

### 1. New developer — understand the architecture

1. [Introduction (core hub)](./core/index.md) — what Dédalo is, the nomenclature, the active ontology
2. [Architecture Overview](./core/architecture_overview.md) — how it all fits together: two systems, the matrix data model, server build → client render
3. [Data model](./core/data_model/index.md) — how a value actually lives: the JSON/JSONB foundation, the typed `matrix` columns and the consolidated v7 value item, with a page per data type
4. [Glossary](./core/glossary.md) — the full nomenclature reference
5. [Ontology](./core/ontology/index.md) — the active schema that drives everything
6. [Sections](./core/sections/index.md) and [Components](./core/components/index.md) — the table and field abstractions
7. [Development guide](./development/index.md) — ecosystem, code style, commit and testing conventions

### 2. Integrator — consume the APIs

1. [Dédalo API v1 (work system)](./api/dedalo_api_v1.md) — the JSON API entry point and request flow
2. [Request Query Object (RQO)](./core/rqo.md) — the request structure callers send
3. [Search Query Object (SQO)](./core/sqo.md) — the JSON abstraction of SQL queries
4. [DD Object (ddo)](./core/dd_object.md) and [Locator](./core/locator.md) — the data-pointer primitives
5. [API class reference](./api/classes/dd_core_api.md) — per-class actions (core, tools, ts, utils, components, manager)
6. [Diffusion API](./api/diffusion/README.md) — the public REST API for websites, plus the [PHP diffusion API](./api/diffusion_api_documentation.md) and [RQO field mapping](./api/RQO_FIELD_MAPPING.md)
7. [Publication API](./diffusion/publication_api/index.md) — serving published data to websites, integrations and AI agents. Use **[v2](./diffusion/publication_api/v2/index.md)** (Bun/TypeScript: resource-oriented REST, bracketed filter DSL, RFC 9457 errors, `ETag`/`Link` caching, batch and MCP) for all new integrations; v1 is legacy

### 3. Core developer — extend Dédalo

1. [Development guide](./development/index.md) — conventions, code style, breaking-change detection, metrics
2. [Components reference](./core/components/index.md) — typologies, base classes, per-component docs
3. [Sections](./core/sections/index.md) and [Areas](./core/areas/index.md) — record containers and top-level groupers
4. [Data model](./core/data_model/index.md) — the value-item contract under every component: typed `matrix` columns, the `{id, lang?, value|locator}` envelope, server-minted item ids, and a page per data type (string, number, date, IRI, geo, media, relations, misc)
5. [Ontology authoring](./core/ontology/index.md) — defining sections, components, relations and tools as nodes
6. [Extending Dédalo](./development/extending/index.md) — the ontology-first cookbooks: [add a component](./development/extending/add_a_component.md), [section](./development/extending/add_a_section.md), [area](./development/extending/add_an_area.md), [service](./development/extending/add_a_service.md), [widget](./development/extending/add_a_widget.md)
7. [Request Config](./core/request_config.md) + [examples](./core/request_config_examples.md) — how data is retrieved and displayed
8. [Client side](./core/client/index.md) — instances, lifecycle, render and views, data/event managers
9. [Tools](./development/tools/creating_tools.md) — build a tool: [register.json](./development/tools/register_json.md), [server contract](./development/tools/server_contract.md), [JS lifecycle](./development/tools/js_lifecycle.md), [security](./development/tools/security.md), [tool catalog](./development/tools/reference/index.md)
10. [Media pipeline](./development/media_pipeline.md) and [Internationalization](./development/internationalization.md) — the media-file lifecycle and the two translation planes
11. [Testing](./development/testing.md) — the three test layers (server PHPUnit, client browser harness, acceptance gate) and how to write a server test
12. [Services](./development/services/index.md) and [System & infrastructure](./core/system/index.md) — shared services, persistence, caching, workers

### 4. System administrator — install, configure, operate

1. [Installation](./install/index.md) — server requirements and setup, plus [Apache](./install/apache_configuration.md) and [Fedora](./install/install_fedora.md) guides
2. [Configuration](./config/index.md) — the four config files: [config](./config/config.md), [database](./config/config_db.md), [areas](./config/config_areas.md)
3. [Media protection](./config/media_protection.md) and [search config](./config/search.md) — access control and search tuning
4. [Management & maintenance](./management/index.md) — environments, root user, [maintenance status](./management/maintenace_status.md), [recovery mode](./management/recovery_mode.md)
5. [Users, profiles & permissions](./management/users_and_permissions.md) — creating users and profiles, the 0–3 permission levels, how access is computed and enforced
6. [Backup](./management/backup.md) + [best practices](./management/backup_best_practises.md) — protecting the data
7. [Updates](./management/updates/index.md) — [updating code](./management/updates/updating_code.md), [data](./management/updates/updating_data.md), [ontology](./management/updates/updating_ontology.md)
8. [Runtime and workers](./development/runtime_and_workers.md) — the persistent-worker model and operational concerns
9. [Diffusion setup](./diffusion/publication_api/index.md) — configure the publication server: [v2 deployment](./diffusion/publication_api/v2/deployment.md) (`.env`, Apache/Nginx/standalone) for new servers, or the legacy v1 [public API configuration](./diffusion/publication_api/public_api_configuration.md) and [server config API](./diffusion/publication_api/server_config_api.md)

### 5. Data curator / manager — work with the data

1. [Introduction (core hub)](./core/index.md) and [Glossary](./core/glossary.md) — the concepts and vocabulary
2. [Areas](./core/areas/index.md) and [Sections](./core/sections/index.md) — how records are organised and edited
3. [Thesaurus & ontology tree](./core/ontology/ts_object.md) — managing hierarchies, descriptors and related terms
4. [Importing data](./core/importing_data.md) and [Exporting data](./core/exporting_data.md) — getting data in and out
5. [Media pipeline](./development/media_pipeline.md) — how uploaded files become masters, derivatives, thumbnails and published media
6. [Diffusion data flow](./diffusion/diffusion_data_flow.md) — deciding what is published and how
7. [Raspa Data Quality Score](./core/raspa_score.md) — assessing the quality of your catalog
8. [Backup](./management/backup.md) and [installing new hierarchies](./management/install_new_hierarchies.md) — day-to-day stewardship

---

## Section index

Every documentation area, with a one-line description and an entry link. The **[core hub](./core/index.md)** is the central landing for everything under `core/`.

| Area | Description | Entry |
| ---- | ----------- | ----- |
| **Core hub** | Introduction, nomenclature, active ontology and the index of all core documentation | [core/index.md](./core/index.md) |
| Architecture overview | How the two systems, the matrix data model and the active ontology fit together | [core/architecture_overview.md](./core/architecture_overview.md) |
| Data model | How a value lives: the JSONB foundation, typed `matrix` columns, the v7 value item, and a page per data type (string, number, date, IRI, geo, media, relations, misc) | [core/data_model/index.md](./core/data_model/index.md) |
| Glossary | The full Dédalo nomenclature (section, component, tipo, locator, sqo, rqo, ddo, …) | [core/glossary.md](./core/glossary.md) |
| Areas | Top-of-hierarchy groupers that gather sections and surface them in the menu | [core/areas/index.md](./core/areas/index.md) |
| Sections | The table abstraction: a group of records of the same kind, and its view modes | [core/sections/index.md](./core/sections/index.md) |
| Components | The field abstraction: typologies, base classes and the full per-component reference | [core/components/index.md](./core/components/index.md) |
| Ontology | The active schema: sections, components, relations and tools defined as nodes | [core/ontology/index.md](./core/ontology/index.md) |
| Thesaurus | The thesaurus hierarchy and ts_object tree model | [core/thesaurus/index.md](./core/thesaurus/index.md) |
| User interface | The client render layer: page, menu, buttons, widgets, inspector, themes | [core/ui/index.md](./core/ui/index.md) |
| Client | Browser runtime: instances, lifecycle, render/views, data and event managers | [core/client/index.md](./core/client/index.md) |
| System & infrastructure | Persistence, APIs, caching, search, security, media engine, dd_grid, login, backup | [core/system/index.md](./core/system/index.md) |
| Request Config | How sections and components retrieve and display data (+ practical examples) | [core/request_config.md](./core/request_config.md) |
| RQO | Request Query Object — the API request structure | [core/rqo.md](./core/rqo.md) |
| SQO | Search Query Object — the JSON abstraction of SQL queries | [core/sqo.md](./core/sqo.md) |
| DD Object | Normalized object used in RQO/SQO to build and instantiate elements | [core/dd_object.md](./core/dd_object.md) |
| Locator | The pointer/relation primitive between data | [core/locator.md](./core/locator.md) |
| Events | The server-side event system | [core/events.md](./core/events.md) |
| Importing data | CSV/RDF/Dédalo import model and per-component conform contract | [core/importing_data.md](./core/importing_data.md) |
| Exporting data | The export atoms contract and flat-table export protocol | [core/exporting_data.md](./core/exporting_data.md) |
| Raspa score | The data-quality evaluation metric | [core/raspa_score.md](./core/raspa_score.md) |
| Work API (v1) | The JSON API entry point, RQO format and request handling | [api/dedalo_api_v1.md](./api/dedalo_api_v1.md) |
| API classes | Per-class action reference (core, tools, ts, utils, components, manager) | [api/classes/dd_core_api.md](./api/classes/dd_core_api.md) |
| RQO field mapping | Field-level mapping used when issuing API requests | [api/RQO_FIELD_MAPPING.md](./api/RQO_FIELD_MAPPING.md) |
| Diffusion API (Bun/PHP) | Public diffusion engine: architecture, endpoints, data model | [api/diffusion/README.md](./api/diffusion/README.md) |
| Diffusion API (PHP) | The raw PHP resolution engine and SQO structure | [api/diffusion_api_documentation.md](./api/diffusion_api_documentation.md) |
| Diffusion (work side) | Data flow, config properties, multiple databases and engine internals | [diffusion/diffusion_data_flow.md](./diffusion/diffusion_data_flow.md) |
| Publication API | Serving published data to the web — v2 (Bun/TypeScript, recommended) and legacy v1 | [diffusion/publication_api/index.md](./diffusion/publication_api/index.md) |
| Development | Ecosystem, code style, commit/test conventions, breaking-change detection | [development/index.md](./development/index.md) |
| Extending Dédalo | The ontology-first cookbooks: add a component, section, area, service or widget | [development/extending/index.md](./development/extending/index.md) |
| Testing | The three test layers (server PHPUnit, client browser harness, acceptance gate) | [development/testing.md](./development/testing.md) |
| Media pipeline | The end-to-end media-file lifecycle: upload → master → derivatives → publication | [development/media_pipeline.md](./development/media_pipeline.md) |
| Internationalization | The two translation planes (data vs interface) and the language model | [development/internationalization.md](./development/internationalization.md) |
| Tools | Building tools and the full per-tool catalog | [development/tools/reference/index.md](./development/tools/reference/index.md) |
| Services | Shared services (e.g. upload) used by components, sections and tools | [development/services/index.md](./development/services/index.md) |
| Runtime & workers | The persistent-worker model and runtime concerns | [development/runtime_and_workers.md](./development/runtime_and_workers.md) |
| Metrics | The performance metrics subsystem and per-request monitor | [development/metrics.md](./development/metrics.md) |
| Media components | Embedding Dédalo media components in third-party code | [development/using_media_components.md](./development/using_media_components.md) |
| CSS architecture | The LESS-based design system and styling structure | [css-architecture.md](./css-architecture.md) |
| Installation | Server requirements and install procedure (Apache, Fedora, H.264) | [install/index.md](./install/index.md) |
| Configuration | The four config files: config, database, areas, plus media/search tuning | [config/index.md](./config/index.md) |
| Management | Environments, root user, maintenance status, recovery, hierarchies, updates | [management/index.md](./management/index.md) |
| Users & permissions | Users, profiles, the 0–3 permission levels and how access is enforced | [management/users_and_permissions.md](./management/users_and_permissions.md) |
| Backup | Backup procedure and best practices | [management/backup.md](./management/backup.md) |
| Updates | Updating code, data and ontology safely | [management/updates/index.md](./management/updates/index.md) |
| Update from v5 | Migration notes for upgrading from Dédalo v5 | [update_v5/update_from_v5.md](./update_v5/update_from_v5.md) |
| Change log | Release history and notable changes | [change_log.md](./change_log.md) |
</content>
</invoke>
