# DIFFUSION_SPEC — Rebuild Dédalo Diffusion as a first-class TS/Bun engine

Standing master specification for the diffusion rebuild (the diffusion counterpart of
`engineering/REWRITE_SPEC.md`). Produced 2026-07-05 from three exploration passes (PHP
diffusion engine + dd1190 ontology mechanics; the production Bun engine at
`v7/master_dedalo/diffusion/api/v1/`; the export subsystem + TS tree state) and
two design passes (engine core; runtime/operations), with the user's decisions
locked in:

1. **Ontology contract:** consume v7 diffusion ontologies (dd1190) and
   normalize internally — but v7 `properties` is **beta, not frozen**: the
   format may evolve where the design clearly benefits (deliberate,
   user-approved, ledgered, shipped with updated dd1190 definitions). Legacy v6
   `propiedades` has its own migration plan and is out of scope.
2. **Export unification:** one shared engine, two schema sources (diffusion
   ontology; user-defined export columns); the shipped tool_export converges
   later, behind its existing parity gates.
3. **Topology:** spawned job-runner processes; main server = control plane;
   runner-on-a-separate-machine stays a deployment option (Postgres-claimed
   job queue, zero runner↔server RPC).
4. **The PHP model is not presumed correct.** PHP/Bun behavior is the oracle
   only at true contract surfaces (ontology semantics, client wire, published
   artifacts, shared state conventions). Internal mechanics are free to be
   replaced.

---

## 1. Mission

Build the Dédalo **diffusion engine** as a native subsystem of the TS server in
`v7_ts/master_dedalo`: ontology-driven publication of work records (Postgres
JSONB matrix) to external targets — MariaDB SQL tables, RDF, XML, Markdown,
CSV, JSON (new first-class), Socrata (stub). Design it as **one engine with two
schema sources** (the dd1190 diffusion ontology; tool_export's user-defined
column sets) and **pluggable format writers**, able to publish sections of
hundreds of thousands of records with millions of relations, in durable
background runs that survive browser disconnects, user logouts, and server
restarts.

**You are not porting the PHP+Bun split.** That architecture existed because
PHP couldn't do the work. You are re-founding diffusion on a single organizing
principle:

> **One compiler, one resolver, one IR, many writers.** Schema sources compile
> into a `PublicationPlan`. One streaming resolver turns plan + records into a
> typed intermediate representation. Format writers are plugins that consume
> the IR and know nothing about ontology or resolution.

## 2. Absolute constraints

1. **The v7 diffusion ontology is the baseline input — but it is beta, not
   frozen.** Existing dd1190 subtrees (models
   `diffusion_domain/group/element[_alias]/database[_alias]/table[_alias]/diffusion_section/diffusion_component`
   + field nodes; `properties->diffusion->{type,service_name}`;
   `properties->process->{ddo_map,parser,...}`; parser fn names like
   `parser_text::text_format`; alias-wins resolution; labels-as-names) are the
   starting contract, and internal normalization into the PublicationPlan is
   where cleanup happens by default. However, since v7 `properties` is still in
   beta, **you may evolve the v7 properties format when the rethought design
   clearly benefits** (e.g. promoting a side-channel flag to a first-class
   property, retiring a parser fn in favor of a declarative field). Every such
   change must be: deliberate and user-approved, documented in a running
   "v7 properties changes" ledger, and shipped with the updated dd1190
   definitions so ontology and engine never diverge. Legacy v6
   `propiedades`/`process_dato` is out of scope (separate migration plan) — the
   engine reads v7 `properties` only.
2. **Parity is judged at the artifacts.** The oracle contract surfaces are:
   (a) published MariaDB rows/schema, (b) rendered RDF/XML/MD files, (c) the
   copied tool_diffusion client's wire (action set + SSE format), (d) shared
   state conventions (dd1758 activity ledger, `.publication/` media markers).
   The internal PHP datum wire shape, parser side-channel flags, and chunking
   mechanics are **not** contracts — replace them.
3. **The copied client works with zero edits.** tool_diffusion JS falls back to
   the main API URL when `DEDALO_DIFFUSION_API_URL` is undefined
   (`tool_diffusion.js:251,363,404,543`) — serve the identical action set there
   and keep the SSE format verbatim (`"data:\n{json}\n\n"`, 16KB padding, 2s
   heartbeat, `X-Accel-Buffering: no`).
4. **Security ≥ PHP+Bun.** Every chokepoint in §8, fail-closed. The old
   engine's separate public socket + internal token surface must *disappear* at
   cutover, not be reproduced.
5. **Postgres only via `src/core/db/`; MariaDB only via
   `src/diffusion/targets/mariadb/`.** "Bun owns MariaDB" becomes a **module
   boundary**: `src/core/**` never imports the MariaDB client (enforce with a
   lint/grep gate). Amend `engineering/REWRITE_SPEC.md` §4 accordingly.
6. **Don't fork shared conventions.** dd1758 (publication ledger, actions
   published/unpublished/unpublish_pending, locator `section_id` serialized as
   *string*), the media-marker store (key `{section_tipo}_{section_id}`,
   `pub/`/`dbs/`/`auth/` layout, fail-closed web enforcement), and
   `section_record.delete()`'s "diffusion failure never blocks the work-system
   delete" invariant are shared with the rest of the system — reuse
   `src/core/resolve/diffusion_delete.ts`'s implementations.
7. **REWRITE_SPEC §2b code style and §4 request-isolation rules apply.** All
   mutable run state lives in a per-run context; the only process-global is the
   immutable plan cache.

## 3. Prime directive: master the diffusion concepts before coding

Study these in the reference trees, then re-express their *semantics*:

- **Flat virtual diffusion tree** —
  `diffusion_utils::get_virtual_diffusion_tree()`
  (`v7 .../diffusion/class.diffusion_utils.php:194`): dd1190 subtree flattened,
  aliases resolved in place (alias wins tipo/label, inherits properties,
  suppresses consumed real branch). Already part-ported in
  `src/core/resolve/diffusion_map.ts`.
- **Element→database→table→field naming** — db/table/column names come from
  ontology node **labels** (alias-aware); field model → SQL column type
  (field_date→DATE, field_int→INT, field_varchar→VARCHAR(n),
  field_text→TEXT+FULLTEXT...).
- **ddo_map chains** — per-field resolution paths
  (`{tipo,parent,section_tipo:'self',fn?...}`); terminal components yield
  values, relation components yield locators that are BOTH recursed per the
  chain AND queued breadth-first for top-level publication with a levels budget
  (`DEDALO_DIFFUSION_RESOLVE_LEVELS`, default 2), cycle guard, and per-run
  dedup (`diffusion_chain_processor`).
- **Parser chains** — ordered `{fn:"class::method", id?, options}` executed
  today in the old Bun engine (`diffusion/api/v1/lib/parsers/`, ~30 fns) with a
  state-machine chain (`diffusion_processor.ts:873-1070`).
- **Lang ladder** — one output row per lang, 5-level fallback: exact → nolan →
  main_lang → any → null (`diffusion_processor.ts:700-745`). Business-critical.
- **Publication gate** — `component_publication` per record + ontology
  `is_publishable` override; unpublishable ⇒ row/file **removal** (the old
  `fields:'delete'` sentinel), fail-closed.
- **Delete propagation + retry** — `section_record.delete()` → target
  resolution → per-format removal; failures → dd1758 `unpublish_pending`,
  retried on boot/opportunistically/manually (already native in
  `src/core/resolve/diffusion_delete.ts` minus the socket hop).
- **v6-parity side-channels** — `global_table_maps`, `merge_columns`,
  `preserve_order`, `empty_value`, `empty_to_string`, `default_value`,
  `add_parents`: today smuggled through the wire context; in the new engine
  these become **compile-time plan concepts** (§5).

Key oracle files: PHP `diffusion/class.diffusion_utils.php`,
`class.diffusion_chain_processor.php`,
`core/api/v1/common/class.dd_diffusion_api.php`,
`diffusion/class.diffusion_delete.php`,
`diffusion/migration/diffusion_ontology_migration.json`; old engine
`diffusion/api/v1/{index.ts, lib/types.ts, lib/diffusion_processor.ts,
lib/sql_generator.ts, lib/db.ts, lib/progress_store.ts, lib/media_index.ts,
lib/parsers/}`; TS tree `src/core/resolve/{diffusion_map,diffusion_delete}.ts`,
`tools/tool_export/server/tool_export.ts`,
`src/core/components/{registry,types}.ts`.

> **Deliverable gate:** before feature code, write the TS model of these
> concepts (plan/IR/writer types + resolver flow) and validate it by compiling
> real dd1190 elements and replaying real publications against old-engine
> artifacts.

## 4. Architecture

### 4.1 Pipeline (the engine core)

```
[A] Schema source     dd1190 element | export column set
      │ compile (cached per ontology revision)
[B] PublicationPlan   immutable, serializable, principal-independent
      │
[C] Selection         sanitized SQO → keyset-batched cursor (buildSearchSql, principal-aware)
      │ per batch (~500 records)
[D] Resolution        plan × batch → RecordIR   (breadth-first relation frontier,
      │                levels budget, per-run dedup + related-record memoization)
[E] Transform         parser registry: pure ValueIR[] → ValueIR[]
      │
[F] Projection        lang ladder + field policies → ProjectedRow per lang (tabular)
      │
[G] Writers           DiffusionWriter plugins → target I/O layer
      │
[H] Ledger            dd1758 rows, media markers, run report
```

Stages C–G run as one streaming loop; a full run is never materialized in
memory.

**PublicationPlan** (stage B): compiled once per (element, ontology revision)
from the flat virtual tree — aliases resolved, ddo_maps → `ResolveStep[]`
chains, parser configs split (see §5), column defs typed, recursion policy
(`maxLevels`, dedup, cycle-skip) and lang policy explicit, v6 side-channels
promoted to `FieldPolicy`/plan tables. Plain JSON-serializable (dumpable,
diffable, shippable to a runner process). Cache: process-global map invalidated
**whole** by an ontology-revision counter bumped in the dd_ontology write layer.
The `diffusion_map.ts` section-map/delete-targets caches stay a SEPARATE
domain: they register their own clearers with the same ontology
cache-invalidation hub at module load (not by-products of plan compilation).

**RecordIR** (stage D output) replaces the dead PHP datum wire shape:
`{sectionTipo, sectionId, status: 'publish'|'unpublish', fields:
Map<planFieldId, FieldIR>}` where `FieldIR.values: ValueIR[]` are typed atoms
(`scalar|date|geo|chain|json`, lang-tagged; relation chains carry resolved
`{sectionTipo, sectionId, term?, model}` links with prefetched terms). The
`fields:'delete'` string sentinel, the load-bearing `"errors":[]`, and the
frozen datum key order all die with the seam.

**Resolution mechanics** (stage D): keyset pagination (never OFFSET); batched
matrix reads (`readMatrixRecords(ids[])` — add it; retire per-record loops);
relation frontier drained breadth-first per batch with one `IN` query per
section per level; LRU-bounded memo of resolved related records (thesaurus
targets repeat thousands of times per run); `Promise.all` within a batch
(I/O-bound), writers consume sequentially (transaction ordering, deterministic
files). Determinism for a given snapshot is a hard requirement (parity diffs +
resume equivalence depend on it).

### 4.2 Runtime (control plane / data plane)

- **Control plane = main server.** All actions (`diffuse, get_process_status,
  list_processes, cancel_process, validate, get_diffusion_info,
  get_diffusion_status, retry_pending_deletions, rebuild_media_index,
  check_database, backup_database`) register in `src/core/api/dispatch.ts`
  under `dd_diffusion_api` (precedent: rebuild_media_index already there) —
  normal session auth, CSRF-equiv, allowlists.
- **Data plane = spawned runner.** `diffuse` enqueues a durable job; a
  scheduler claims it (`FOR UPDATE SKIP LOCKED`, global limit default 2,
  uniqueness: one active run per element+section) and spawns
  `bun run src/diffusion/runner.ts --job <uuid>` — same codebase, own process,
  own memory ceiling, killable. Deletes/admin ops stay in-process (fast).
- **Separate-machine option (design requirement):** the runner communicates
  *only* through Postgres (job claim, checkpoint, progress NOTIFY), the MariaDB
  targets, and the media path. A runner daemon on another machine claiming from
  the same queue must be possible without code changes — document the
  reachability requirements (Postgres, target DBs, shared media mount for file
  formats) and keep zero runner↔server RPC.
- **Durable jobs:** TS-owned tables `diffusion_jobs` + `diffusion_job_events`
  (created by the TS tree, accessed only through `src/core/db/`). Job row:
  server-UUID `job_id` (the capability), `client_process_id` (the client's
  deterministic label — correlation only, never authorization), owner,
  immutable sanitized `spec`, `state`
  (queued/running/completed/failed/cancelled/interrupted), `checkpoint`
  (committed section_id cursor + per-target counts + attempt), totals/ETA,
  bounded errors, runner pid/host, heartbeat. dd1758 remains the *user-facing*
  ledger; the queue is infrastructure (matrix-as-state is wrong for high-churn
  heartbeats/checkpoints — deliberate, documented exception to "no bespoke
  tables").
- **Crash recovery:** boot + periodic sweep marks stale-heartbeat/dead-pid jobs
  `interrupted` and auto-requeues from checkpoint (≤3 attempts). Safe because
  chunks are deterministic ordered slices and every write is an idempotent
  upsert or temp+rename file. Keystone gate: kill -9 mid-run, resume →
  byte-identical final artifacts.
- **Progress:** SSE handlers are views over the job row via Postgres
  `LISTEN/NOTIFY` (throttled ~500ms) — any server instance can stream any
  runner's progress. Keep the old status vocabulary and every field
  `render_tool_diffusion.js` consumes; echo `client_process_id` so the client's
  reconnect (`list_processes` → find by process_id → `get_process_status`)
  works unchanged.
- **`src/core/tools/background.ts`** stays for cheap tool actions; generalizing
  it onto the job service is a ledgered follow-up, not a dependency.

### 4.3 Writers and the target I/O layer

```ts
interface DiffusionWriter {
  readonly format: string;                          // ontology properties->diffusion->type
  readonly consumes: 'projected-rows' | 'record-ir';
  open(plan: PublicationPlan, run: RunContext): Promise<WriterSession>;
}
interface WriterSession {
  ensureSchema(): Promise<void>;      // ONCE per run, serialized per table (DDL auto-commits!)
  write(input: ProjectedRow | RecordIR): Promise<void>;
  remove(ref: {sectionTipo: string; sectionId: number}): Promise<void>;  // unpublish + delete propagation
  close(): Promise<WriterRunSummary>; // merges/zips, marker union, counts
  abort(): Promise<void>;             // temp-artifact cleanup
}
```

Registry keyed by the ontology `type` string; unknown type = loud `validate`
error (never a silent no-op). Adding a community format = ontology extension +
one registered writer.

- **mariadb-sql**: Bun-native `Bun.sql` (mysql/mariadb adapter) isolated in
  `src/diffusion/targets/mariadb/`, gated by the P2 driver spike
  (DIFFUSION_PLAN D1); `mysql2` is the contingency if the spike finds a gap
  (port the old engine's proven db.ts/sql_generator patterns + tests either
  way).
  Self-evolving **additive-only** schema (CREATE IF NOT EXISTS +
  INFORMATION_SCHEMA diff → ALTER ADD), run-start critical section, then pure
  DML. **True multi-row batched upserts** (~200 rows, `max_allowed_packet`-aware;
  PK `(section_id, lang)`), transaction per write-batch (never per run),
  batched sentinel deletes (errno 1146/1049 tolerated). Bounded channel (2–4
  batches) between resolution and writes for backpressure. Pool per target db;
  runner owns write pools; main server keeps a tiny pool for deletes/admin.
  Socrata = dormant registry alias of this writer (confirm with the user
  whether Socrata is still live before investing more).
- **rdf / xml**: consume RecordIR; one deterministic file per record (path
  logic exists in `diffusion_delete.ts`); rendering absorbs the old PHP
  `diffusion/parser/*` set (killing the second parser language); `close()` does
  type-aware merge + ZIP, all temp+rename.
- **markdown**: rides the tabular semantics (as today), per-record .md, ZIP
  only.
- **csv / json**: new first-class; one streamed file per table target, ZIP on
  close.

### 4.4 Language model

The 5-level ladder lives in **Projection** as one pure, exported,
table-driven-tested function — not in writers, not in resolution (the IR keeps
all langs so future formats choose their own policy).
`FieldPolicy.emptyToString/defaultValue/emptyValue` apply here, in one place.

## 5. Parser registry (the compatibility surface, rethought)

Every fn name in the old engine's registry stays **resolvable** — but split at
compile time:

1. **Compile-time rewriters** (never run at runtime): locator re-synthesis dies
   (IR keeps typed chains); `parser_locator::parents/filter_*/truncate_*/slice`
   → chain-transform options on `ResolveStep`; `global_table_maps` → plan
   lookup tables; `parser_global::merge_columns` → synthetic merged fields;
   `publication_unix_timestamp` → a `{kind:'system'}` source step; the context
   flags → `FieldPolicy`.
2. **Runtime parsers** (~12 survivors, pure
   `(ValueIR[], options, ctx) => ValueIR[]`, **no I/O** — terms are prefetched
   by the resolver): text format/map/join, the date forms, helper
   first/tail/count/merge, iri/geo/info/map, and the trivial locator
   projections (get_section_id etc., names honored).

Unknown fn in an institution's ontology = **compile error surfaced by
`validate`** — never a silent skip.

Because v7 `properties` is beta (§2.1), the registry may also be *simplified at
the source*: where a parser fn or option exists only to patch a v6-parity
quirk, prefer proposing a v7 properties change (with updated dd1190 definitions
and a ledger entry) over carrying the quirk into the new engine forever.
Compatibility-by-normalization is the default; ontology evolution is the escape
hatch when normalization would enshrine a mistake.

## 6. Export unification (design now, converge later)

Build the shared primitive as part of the core: an optional
`resolvePublicationValue` on the component descriptor contract
(`src/core/components/types.ts`) — the TS successor of
`component_common::get_diffusion_data`: typed values from stored matrix data,
no formatting, no lang collapsing; relation models return chains the resolver
queues. A `defaultPublicationValue` covers most of the 38 models; only the
relation family + date/geo/iri/media/publication need bespoke resolvers.

The plan compiler gets a second front-end signature —
`compileExportColumns(ar_ddo_to_export) → PublicationPlan` — proven with the
CSV writer. **Do not refactor the shipped tool_export in the initial build**;
migrate it onto the primitive in a later phase behind its existing parity
gates. The standing rule: no third resolution walker may ever be written.

## 7. What is deliberately killed (and why)

| Killed | Replaced by |
|---|---|
| PHP↔Bun seam, per-chunk PHP re-entry, cookie/CSRF forwarding, session_write_close deadlock dance | native in-process resolution |
| Half-resolved datum wire + `diffusion_datum`/`diffusion_data_object` + `fields:'delete'` sentinel | typed RecordIR + `status:'unpublish'` + writer `remove()` |
| Context side-channel flags | compile-time `FieldPolicy`/plan concepts, applied once in Projection |
| Second (PHP) parser set for RDF/XML | rdf/xml writer rendering helpers; one registry, one language |
| chunk_size=1, per-record INSERT loops | keyset batches + multi-row upserts |
| In-memory progress store (lost on restart), split retry state | durable Postgres job queue + checkpointed resume |
| Public engine socket + `X-Diffusion-Internal-Token` | main-API dispatch + CLI entrypoints with a system principal (removal is a cutover step) |
| Per-run virtual-tree walks | revision-cached compiled PublicationPlan |

## 8. Security chokepoints (all fail-closed; adversarial review mandatory)

1. Single dispatch chokepoint: main-API class/action allowlist, session auth,
   CSRF-equiv, principal gating; SEC-13 read-perm on the source section at
   enqueue, re-asserted at job start (start-time authority for overnight runs —
   documented).
2. Server-generated UUID job capability; status/cancel authorized by owner
   match or admin, never id knowledge.
3. **Identifier grammar chokepoint (critical, new emphasis):** db/table/column
   names derive from institution-editable ontology labels → one
   `validateSqlIdentifier` function (strict `^[a-z][a-z0-9_]{0,63}$`
   post-sanitize) applied at plan validation before any run; backtick-quoting
   everywhere regardless. Mirrors REWRITE_SPEC §7.6.
4. Values always parameterized; selection always through `sanitizeClientSqo` +
   `buildSearchSql` with the caller's principal; job spec stores only the
   sanitized SQO.
5. Publication gate fail-closed: any resolution error on the gate ⇒ unpublish,
   never publish.
6. Per-target-db MariaDB user with minimal grants (deployment requirement).
   NOTE (2026-07, audit S2-35): no mysqldump surface is implemented anywhere —
   MariaDB publication tables are DERIVED data, rebuildable by re-publishing;
   back them up externally if desired (see engineering/PRODUCTION.md, backup set).
   If a dump surface ever lands: mysqldump via argv + `MYSQL_PWD`, validated
   names, version-probed binary, output outside web root.
7. Media markers in lockstep with dedalo-media-protection; marker failures
   never fail a run; `reconcile()` on boot.

## 9. Phases & parity gates

- **P0 — Foundation.** Job tables + scheduler + runner skeleton + SSE control
  plane serving the verbatim action set over a stub job. Pin the old engine's
  exact `list_processes`/status payloads from
  `lib/progress_store.ts`/`lib/status.ts` first. *Gates:* golden SSE transcript
  vs a recorded old-engine stream; Chrome-MCP smoke with the byte-identical
  client, zero client edits. Ask-the-user items: Socrata liveness; any non-tool
  consumers of the old engine socket.
- **P1 — Plan compiler + resolver + IR.** dd1190 → PublicationPlan (subsuming
  diffusion_map.ts), component primitive, parser split, lang ladder. *Gates:*
  compiled plans for real elements diffed against PHP virtual-tree semantics;
  old-engine processor fixtures replayed through a one-way `legacyDatumToIR()`
  test adapter; ladder table-tests.
- **P2 — SQL path.** MariaDB target module + writer; in-process delete path
  (drop the socket hop in diffusion_delete.ts). *Gates (functional, like the
  old engine's ~180-test discipline):* publishing a fixture element **creates
  the database/tables, adds the typed columns (model→SQL type, indexes,
  additive evolution), and sets the data rows** (upsert per lang, ladder
  correct, sentinel deletes remove rows) — asserted by env-gated real-MariaDB
  integration tests + the old engine's ported golden fixtures
  (processor/sql_generation). Old-engine output comparison on a small fixture
  is a **spot-check aid**, not a byte-identical requirement.
- **P3 — File paths.** rdf/xml/markdown, then csv/json. *Gates:* published
  files exist at the deterministic paths with correct rendered content per
  fixtures; merge/zip products valid; `.publication/` marker tree correct after
  publish and delete. Spot-check against old-engine output where convenient.
- **P4 — Durability & scale.** *Gates:* kill -9 runner mid-run → resume →
  byte-identical artifacts; server restart mid-run → job resumes; cancel
  semantics; throughput benchmark vs old engine recorded (expect
  order-of-magnitude on SQL).
- **P5 — Convergence & cutover.** Admin ops re-homed; maintenance widget
  re-pointed; staged cutover: (1) deletes+retries native, (2) per-element flag
  routes `diffuse` to the new engine with the old engine idle as fallback
  (coexistence is safe on the same MariaDB for *different* elements —
  idempotent upserts, additive schema — but never run both on the same
  element+section), (3) remove proxy route + `DEDALO_DIFFUSION_API_URL` +
  internal token; decommission. Old wire-contract goldens retire with the seam;
  their fixture *data* is retained against the IR→SQL layer; the client-facing
  SSE/action contract gets standing golden transcripts. tool_export migration
  onto the shared primitive follows as its own parity-gated phase.

## 10. Definition of done

- **The publish process works end-to-end, verified functionally:** for real
  dd1190 elements, a run creates the target databases and tables, adds the
  typed columns (with additive schema evolution on re-runs), sets the data rows
  (per-lang upserts, lang ladder, publication gate), and removes rows/files on
  unpublish/delete — proven by the engine's own test suite (unit + env-gated
  real-MariaDB/file integration tests + golden fixtures carried from the old
  engine). Old-engine comparison is a spot-check tool, not the bar.
  Compatibility of previously published **v6 diffusion data** is a separate
  migration process, out of scope.
- Copied client works with zero edits; runs survive disconnects, logouts,
  restarts; kill/resume is byte-equivalent.
- Runner placement (local spawn vs separate machine) is a deployment choice; no
  runner↔server RPC exists.
- Security posture strictly stronger: no public engine socket, no internal
  token, identifier chokepoint on ontology-derived names, minimal-grant DB
  user.
- Export-ready: the shared primitive + CSV writer prove the two-schema-source
  design; tool_export migration is unblocked and ledgered.
- Measurably faster than the old engine on representative sections; benchmarks
  recorded.
- Coverage ledger maintained (STATUS.md convention) — nothing silently
  narrowed.

## 11. Method

Follow REWRITE_SPEC §9b sub-agent orchestration: spec-extractor agents against
the PHP/old-engine oracles, implementer + parity-tester pairs per phase,
security review on §8, synthesis pass for §2b style uniformity. When a
diffusion ontology semantic is ambiguous (e.g. an obscure parser option only
one institution uses), **ask — never invent**.
