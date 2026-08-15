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

**The default is fail-loud AND TYPED.** Uncovered scope, contract violations
and impossible states THROW a `DedaloError` carrying a REGISTERED code
(`src/core/errors/registry.ts` — the only place a code may be born; grammar
`<domain>.<condition>`), with the module and the input in the message and in
`coordinates`: `throw new DedaloError('engine.uncovered_scope', {message:
'search conform: model X declares no searchBuilder family…', coordinates:
{tipo}})`. Throws become error responses through the SINGLE CONVERTER
(`src/core/errors/convert.ts`: `toDedaloError` → `toErrorEnvelope` /
`toStructuredErr` / `toStreamFrame`) — no handler, helper or route builds a
failure body of its own. An untyped `throw new Error` is still loud, and
`toDedaloError` classifies it as `internal.unexpected`; it is a debt, not a
convention. The process-level unhandledRejection guard (S1-15) makes escaped
rejections loud, never fatal. Canon: engineering/ERRORS_SPEC.md.

**Write paths never absorb integrity errors** (P3, 2026-08-15 — ERRORS_SPEC
§8). Between "the client asked to persist X" and COMMIT, every failure — a
caller fault typed under its own code, or a contract violation typed
`internal.invariant` — propagates out of `withTransaction` and rolls the
transaction back. A catch on a write path may not turn a throw into a soft
`{ok:false}`; the write-failure gates (`matrix_write_failure_native`,
`save_component_failure_native`) hold that mechanically.

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
identifying coordinates (tipo/section_id/job id) — which is what
`logError(error, {subsystem, requestId})` (`src/core/errors/log.ts`) emits, at
the registry severity, incrementing `errors_total` and `error_<code>`. Prefer
it to a bare `console.*` on any path that already has a typed error. Request-scale telemetry
belongs in the structured access log (S2-37, `src/server.ts`), not scattered
console lines. Never log secrets or full record payloads.

**Outbound subsystems name the counterparty, and only the ORIGIN of it.** The
external-services subsystem (`src/external/`, engineering/EXTERNAL_SPEC.md)
fixes its grammar in code — `formatExternalError` builds every line as:

```
[external:<service>] <kind> origin=<scheme://host> [status=<n>] [section=<tipo>] [id=<remote id>] [detail]
```

The subsystem tag carries the SERVICE (`[external:zenon]`, `[external:unknown]`
before resolution) because "an outbound call failed" is unactionable when four
catalogues are bound; `<kind>` is the closed taxonomy ordered by how far the
attempt got, which answers the second operator question an outbound path
raises — not only "no data or swallowed failure?" but "how far did it get?".
**A full URL is never stored on the error and never logged**: a record
request's query string holds the remote id and the field set, a search
request's holds what a cataloguer typed, and neither belongs in a log —
`originOf()` is the only permitted rendering of a target. `console.warn` for
degraded-but-expected (`not_found`, `circuit_open`, `disabled`, `timeout`),
`console.error` for a contract/configuration failure an operator must fix.

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
   (RAG off ⇒ pgvector never loads) and for **core→external**
   (`src/external/api/`, 2026-08-05): `src/external` is a PEER of core, so a
   STATIC value edge from core into it would fuse the two into one import
   component — the S2-20 defect class the SCC tripwire exists to prevent — and
   an installation with no external section (which is nearly all of them)
   would still load the transport, the breaker and every adapter at boot. The
   TYPE import stays static: it is erased, and the SCC gate excludes
   `import type`. The laziness IS the boundary: an unconfigured subsystem must
   cost nothing at boot.
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
