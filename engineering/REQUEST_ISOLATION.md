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
3. **Auth bypasses are explicit capabilities, never mutable globals.**
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
