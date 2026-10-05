# Request isolation (spec §4)

The single biggest correctness risk of the long-lived Bun server: **no
request-carrying state may live at module scope.** No cross-request bleed of
session, principal, permissions, language, or headers. This document is the
enforced, canonical statement of that invariant (it was previously only prose in
REWRITE_SPEC §4 and per-file comments).

## How request state IS carried

| State | Mechanism | Where |
|---|---|---|
| Identity (principal + session) | **request-context ALS**, opened once per RQO at the dispatch chokepoint, seeded from the session | `core/security/request_context.ts`; opened in `core/api/dispatch.ts` `dispatchRqo` |
| Effective languages | **request-lang ALS** (`currentApplicationLang()`/`currentDataLang()`), opened beside the identity scope | `core/resolve/request_lang.ts` |
| DB transaction handle | ALS (`withTransaction`) | `core/db/postgres.ts` |
| Matrix rows within ONE read | **read-scoped memo ALS**, opened by `readSection` only; a nested read JOINS it. Bounded (8000 rows) and dies with the read, so it needs no invalidation — it can only serve a row the same read already saw. NEVER opened around a write: save/delete legitimately re-read a row they just modified | `core/db/record_memo.ts`; opened in `core/section/read.ts` |
| **Detached background work** | `runDetachedFromTransaction` EXITS the transaction, deferred-action and commit-action stores (the ONE legal caller is `MediaJobManager.submit`); the request lang + context are **not inherited** — the job manager PINS the submit-time langs and a job-owned request context (`JobRunScope`) and enters them around the worker | `core/db/postgres.ts`; `core/media/jobs.ts` |
| Per-user data at module scope | caches **keyed by `userId`** with explicit invalidation | `core/security/permissions.ts` |
| Localized caches | key **bakes the lang** in | e.g. `core/ontology/labels.ts`, `core/resolve/structure_context.ts` |

The principal is resolved **once** per request (`dispatchRqo` seeds
`context.principal`); handlers read it via `requirePrincipal(context)` or the
`currentPrincipal()` backstop — never re-resolve per handler. The dominant path
still threads `principal` explicitly as a parameter (testable, clear); the ALS is
the single seed-source + a backstop for leaf/future code with no parameter to
reach for.

## The rules

1. **No request-carrying mutable state at module scope.** A top-level `let`/`var`
   must be request-independent (boot/install-stable). Enforced by the tripwire.
2. **Caches key by every identity the value depends on** — `tipo` + `lang` +
   `user`, as applicable. A lang-only key on a value that could become
   user-dependent is a latent bleed (see the two guarded holes below).
3. **A background job owns no part of its submitter's connection state.**
   `submit()` is called synchronously inside a request, so an ALS store would
   propagate into the worker — and a `withTransaction` handle is EXPIRED (S2-14)
   the moment that request commits, minutes before a transcode ends. The job
   manager therefore starts every worker through `runDetachedFromTransaction`.
   That helper is the transaction ALS's only escape hatch and exists FOR this one
   caller: it must not be used to "avoid holding the transaction" around ordinary
   work, because the work it wraps loses read-your-writes and cannot be rolled
   back with the request. Enforced by `test/unit/media_jobs_reconcile.test.ts`
   (a job submitted inside `withTransaction` observes `isInTransaction() === false`)
   plus the importer allowlist in `test/unit/module_state_tripwire.test.ts`.

   **A job's request identity is PINNED at submit, never inherited.** Bun
   restores the submitter's ALS scope after an await, so a job used to inherit
   the request's langs and its `RequestContext` OBJECT by accident of the runtime
   — its identity was whatever scope the code calling the worker ran in, and
   `noteFrontierRefusal` appended a job's refusals to a request whose envelope had
   long been answered. `MediaJobManager.submit` therefore captures, in the
   request's synchronous flow, the **langs + a job-owned request context**:
   the submitter's `applicationLang`/`dataLang` (install defaults when the submit
   ran outside any scope), the **principal snapshot** `currentPrincipal()`
   returned at submit (authorization unchanged), `session: null`, its own
   `requestId` (`job:<job id>`), the submitter's `clientIp`, and its own
   `frontierRefusals`. `runWorker` enters them around the worker, whatever scope
   it is called from; the transaction stores are exited as above. The pin is
   plain values held in the run closure, never on the served `JobRecord`. A
   handler reads `currentApplicationLang()`/`currentDataLang()` ambiently and
   gets the submitter's (no lang is threaded through `ToolActionContext`).

   Known limits, stated rather than discovered:
   - **Snapshot-at-submit semantics.** The principal is the submit-time snapshot:
     background jobs carry a submit-time principal snapshot; long jobs
     re-resolving is a separate change (a handler that must decide on the
     principal AS OF NOW re-resolves it itself — tool_export's
     `currentExportPrincipal`). The langs are likewise the submit-time pair.
   - **An `EventEmitter` listener runs in the emitter's scope.** A callback
     registered by a job and fired synchronously by an emitter (a child
     process's `'data'`, a stream's `'end'`) runs in whatever ALS scope the
     EMITTING code holds, and no ALS pin fixes that; such a callback must not
     read the `current*()` backstops — capture what it needs before registering
     it.
4. **Auth bypasses are explicit capabilities, never mutable globals.**
   `skip_projects_filter` is a server-only SQO key stripped from client input by
   `sanitizeClientSqo`; the read/admin bypass is the presence / `isGlobalAdmin`
   of a `Principal`, threaded as a parameter — not a `read_only_scope`-style flag.

## Enforcement

- **Static tripwire** — `test/unit/module_state_tripwire.test.ts`: fails on any
  NEW top-level `let`/`var` (allowlist of known request-independent caches) and on
  any module-level capture of a request-scoped accessor. Adding a top-level `let`
  forces a decision: prove it request-independent (allowlist it) or make it
  request-scoped.
- **Behavioral** — `test/unit/concurrency_interleave.test.ts`: concurrent
  different-principal + different-lang requests, at the mechanism level and
  through the real `dispatchRqo` path, prove no identity/lang bleed.
- **Job identity pin** — `test/unit/media_jobs_reconcile.test.ts` ("a job runs
  under its OWN pinned identity"): a subclass overrides the protected
  `MediaJobManager.runWorker` seam and calls the worker from a FOREIGN scope (the
  shape of a dispatcher / pool refactor); the worker must still read the
  submitter's langs and principal, a null session, its own request id, keep its
  refusals off both the submitter's and the foreign context, and fall back to
  the install defaults when submitted with no scope. Mutation-proven: without
  the pin in `runWorker` every leg is red.

## Watch items

- The `userId`-keyed caches (`permissions.ts` `permissionsTableCache` /
  `userProjectsCache`) rely on `clearPermissionsCache` / `clearUserProjectsCache`
  firing on **every** profile-data (dd774) or profile-assignment mutation — this
  is invalidation *completeness* (a staleness risk, not identity bleed); audit it
  on any profile write path.
- Two latent lang-only keys were made **future-safe** (guarded), not yet exercised
  by a user-dependent branch: `core/relations/filter_projects.ts`
  `authorizedProjectsCache` now carries a projects-scope prefix, and
  `core/resolve/structure_context.ts` `coreCache` must gain a user dimension if
  `tools`/`buttons` ever become user/permission-dependent (they are ontology-derived
  today; permissions are applied on the per-call stamp, never cached).
