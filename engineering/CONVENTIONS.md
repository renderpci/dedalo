# CONVENTIONS — error handling, logging, module linking

Codifies two conventions the foundation audit found divergent-by-subsystem
(S3-36: ~76 silent catch-swallows vs ~35 console calls in 60k LOC; S3-37:
~368 `await import()` sites with undocumented rationales). New code follows
this document; existing divergences are burned down opportunistically —
whoever touches a file brings its catches up to convention in the same
change.

## 1. Error handling & logging (S3-36)

The operator's question is always: **"no data, or swallowed failure?"** Every
catch must leave that answerable.

**The default is fail-loud.** Uncovered scope, contract violations, and
impossible states THROW with a message naming the module and the input
(`'search conform: model X declares no searchBuilder family…'`). The
dispatch envelope converts throws into error responses; the process-level
unhandledRejection guard (S1-15) makes escaped rejections loud, never fatal.

**A catch may swallow ONLY when all three hold:**

1. the operation is best-effort BY ORACLE CONTRACT (PHP logs-and-continues:
   per-component media refresh on duplicate, save-event listener fan-out,
   RAG enqueue hooks) — cite the PHP posture in a comment;
2. the failure is REPORTED — `console.error('[module] what failed', error)`
   at minimum (`console.warn` for expected-and-degraded, e.g. an optional
   subsystem not configured). "Silent" is only acceptable for pure
   PROBE catches (JSON.parse-to-detect, existsSync-style checks) where the
   catch IS the answer;
3. the degraded behavior is defined — the comment says what the caller gets
   instead (empty list, stale cache entry, skipped side effect).

**Log line grammar**: `[subsystem] imperative summary` + the thrown error +
identifying coordinates (tipo/section_id/job id). Request-scale telemetry
belongs in the structured access log (S2-37, `src/server.ts`), not scattered
console lines. Never log secrets or full record payloads.

**Write paths never absorb integrity errors.** Anything between "the client
asked to persist X" and COMMIT propagates its failure to the caller — the
`ok:true`-with-lost-write class (S1-02/S1-04) is the reason this document
exists.

## 2. Dynamic imports (S3-37)

Default is a STATIC import — the dependency graph must be statically
readable (tripwires and reviewers reason over it). `await import()` is legal
for exactly FOUR rationales; a new site states which one in a nearby
comment, or it does not merge:

1. **CYCLE-BREAKING at a registration/chokepoint seam.** A low-level
   chokepoint that must call up-stack (write chokepoint → cache
   invalidation targets in `section_record/save_event.ts`; structure-context
   stamp → `tools/registry.ts`). The import is the inversion — the callee
   will itself adopt the chokepoint. Prefer boot-time handler REGISTRATION
   (the cache_invalidation / RAG-hook pattern) where practical; WS-C's
   dispatch extraction converts most of these back to static imports.
2. **SANCTIONED BOUNDARY SEAM into an optional/heavy subsystem.** Core
   reaches `src/diffusion/**` only through lazy imports of the
   `diffusion/api/` facade (enforced: `test/unit/diffusion_boundaries.test.ts`
   + `test/unit/boundary_seam_tripwire.test.ts`); same posture for core→ai
   (RAG off ⇒ pgvector never loads). The laziness IS the boundary: an
   unconfigured subsystem must cost nothing at boot.
3. **RARELY-HIT / TOOL-SCALE lazy loading.** Per-action tool handlers and
   cold paths (delete-record media moves loading `node:fs`) defer module
   cost to first use so boot and the hot read path stay lean.
4. **BOOT WARM-UP.** Exactly ONE site: `server.ts warmCoreModuleGraph()`
   serially evaluates the whole src/core graph before listening, so no
   request-time concurrent module evaluation can TDZ-poison the process
   (the first-load race, 2026-07-07). Its specifiers are the file tree
   itself — every target is already a legal static member of the core
   graph, so no boundary or SCC edge is added. Do not add a second site.

Anything else — importing dynamically out of habit, or to paper over a
cycle that indicates wrong layering — is a defect: fix the layering.
Tripwires scan RAW SOURCE (not the runtime graph) precisely because dynamic
edges are invisible to static analysis; keep seam-class imports inside their
ledgered files or the gates fail.
