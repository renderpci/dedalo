# System / infrastructure

> The shared, mostly non-ontological machinery that the rest of Dédalo runs on:
> the bootstrap loader and base class, the database access layer, authentication
> and authorization, media processing and protection, the search engine and HTTP
> API, versioning, the operational services (backup, logging, runtime helpers)
> and the publication pipeline.

> See also: [Architecture overview](../architecture_overview.md) · [RQO](../rqo.md) (request format) · [SQO](../sqo.md) (search query) · [dd_object (ddo)](../dd_object.md)

These pages are the subsystem references for the infrastructure layers under
`core/`. Unlike sections and components, most of the classes documented here are
**not** ontology-driven objects — they are stateless helpers, bootstrap code or
runtime engines. For the request/response contract that ties the work system
together, start with [RQO](../rqo.md); for the conceptual split between the work
system and the publication system, read the [Architecture overview](../architecture_overview.md).

## Subsystems by concern

| Subsystem | Concern | Purpose |
| --- | --- | --- |
| [common](common.md) | Base &amp; data | Abstract parent of every section, component and ontology object — identity, `get_*`/`set_*` accessors, structure-context, `request_config`, permissions and worker-safe caches. |
| [base](base.md) | Base &amp; data | Bootstrap / loader layer: registers the autoloader, installs error handlers and provides the low-level file-cache and OS/process utilities everything above `common` is built on. |
| [db](db.md) | Base &amp; data | PostgreSQL access layer — the only work-system code that opens a connection or issues SQL, with the matrix table managers, JSON record objects and result wrappers. |
| [dd_grid](dd_grid.md) | Base &amp; data | Resolves a record's component data into flat, tabular shapes: the legacy grid cell and the modern per-component export-atoms contract, plus the client renderers. |
| [login](login.md) | Auth &amp; security | Authentication entry point — validates credentials against the users section, builds the session and arms the media-protection auth cookie. |
| [security](security.md) | Auth &amp; security | Authorization core — turns a user profile into an integer permission (0–3) over any ontology element and enforces it server-side on every read, write and per-record access. |
| [media_protection](media_protection.md) | Auth &amp; security | Web-server-enforced media access control — generates the `.htaccess` gate, the fixed-name auth cookie and the zero-byte marker allowlist that authorize media with a single `stat()`. |
| [media_engine](media_engine.md) | Media | Media processing layer — stateless `Ffmpeg`/`ImageMagick` wrappers that shell out to transcode, resize, rasterize, probe and derive files for the media components. |
| [search](search.md) | Search &amp; API | Query engine — compiles a Search Query Object ([SQO](../sqo.md)) into a single prepared PostgreSQL statement over the JSONB `matrix_*` tables and returns an iterable result. |
| [api](api.md) | Search &amp; API | Single HTTP entry point of the work system — decodes a Request Query Object ([RQO](../rqo.md)), runs the security gates, dispatches to a `dd_*_api` handler and returns the standard JSON envelope. |
| [tm_record](tm_record.md) | Versioning | Time Machine (`dd15`) runtime object — one historical version of a component/section change in the flat `matrix_time_machine` table, with read-only `tm` mode and restore. |
| [backup](backup.md) | Ops | Static helper that dumps, lists and restores Dédalo's databases — PostgreSQL via `pg_dump`, the MariaDB publication DB via Bun, and the COPY-format restore path. |
| [logger](logger.md) | Ops | Central logging facade — a factory/registry of severity levels and pluggable backends underneath both the `debug_log()` error stream and the persisted user-activity audit trail. |
| [services](services.md) | Ops | Reusable runtime helpers (file upload, rich-text editing, autocomplete search, …) packaged so many components, sections and tools can share them without re-implementing. |
| [diffusion](diffusion.md) | Publication | Publication subsystem — emits the work data marked for publication to external targets (MariaDB SQL, RDF, XML, Socrata), driven by the diffusion ontology across PHP and a Bun engine. |
