---
name: dedalo-ts-isolation-caching
description: Request isolation and caching without cross-request bleed or stale-after-edit serving in the Dédalo v7 TypeScript/Bun rewrite. ONE Bun process serves concurrent requests via 3 AsyncLocalStorage stores — transaction ALS (src/core/db/postgres.ts withTransaction), request-lang ALS (src/core/resolve/request_lang.ts runWithRequestLangs / currentApplicationLang / currentDataLang), request-context ALS (src/core/security/request_context.ts currentPrincipal). Use when adding or editing ANY module-level cache/singleton (new Map/Set/let), any createOntologyCache / createDataCache (src/core/ontology/cache_factory.ts), any ALS read (currentPrincipal / currentApplicationLang / currentDataLang / withTransaction), background-job/scheduler identity threading, or when debugging "cross-request bleed", "wrong language shown to user", "wrong actor in audit rows", "stale after edit", or a module_state_tripwire.test.ts failure. Authoritative: engineering/REQUEST_ISOLATION.md; state: rewrite/LEDGER.md.
---

# Dédalo v7 request isolation + caching (TypeScript/Bun)

The v7 TS server is **ONE long-lived Bun process** (`Bun.serve` on a unix socket) handling **concurrent** requests. There is no per-request process or worker. Anything you store at module scope is shared by every in-flight request. This is the single fact that makes the two rules below load-bearing. Authoritative model: **engineering/REQUEST_ISOLATION.md**. Measured state / open gaps: **rewrite/LEDGER.md** (never restate its numbers here).

The audit's central lesson (audits/2026-07_foundation/general/): **every invariant enforced only by documentation was violated in practice; every tripwired boundary held.** Both rules below are backed by a tripwire — respect the tripwire, not just the prose.

---

## The three AsyncLocalStorage stores (per-request scope)

All request-scoped state lives in ALS, never at module scope:

| Store | File | Read via | Carries |
|-------|------|----------|---------|
| transaction | `src/core/db/postgres.ts` (`withTransaction`, `transactionStore`) | ambient — SQL auto-routes to the reserved tx client | the reserved tx handle + deferred-action queue |
| request-lang | `src/core/resolve/request_lang.ts` (`runWithRequestLangs`) | `currentApplicationLang()`, `currentDataLang()` | interface language + component-data language |
| request-context | `src/core/security/request_context.ts` (`requestContextStore`) | `currentPrincipal()`, `currentSession()` | authenticated principal + session |

The request entry point seeds lang (from session, via change_lang) and context; everything downstream reads them ambiently. Interface/data language is **per-request** (see memory: request-scoped-langs), not static config.

---

## RULE 1 — No module-level mutable state carrying request/principal/lang values

Never declare a module-scope `let` / `Map` / `Set` / mutated object that holds a value derived from *who is asking* or *in what language*. It bleeds: request B is served request A's interface language, principal, or cached rows because they share the one process.

- **Why it exists:** S1-12 / S1-13 were *reproduced* cross-request bleed — one user's lang / principal leaking to another. Not theoretical.
- **What breaks without it:** a concurrent second request reads the first request's leftover — wrong language rendered, wrong user's data served, wrong actor stamped.
- **Tripwire:** `test/unit/module_state_tripwire.test.ts`. It greps every module-level `let`/`var`/`new Map()`/`new Set()` outside `cache_factory.ts` against `ALLOWLISTED_MODULE_MAPSET` (currently **27 entries**, each a genuine *process-lifetime* latch with a written lifecycle justification — who clears it, and when). A new module Map/Set fails CI unless it goes through the factory (Rule 3) or earns an allowlist entry with justification. It also fails if an allowlist entry names a binding that no longer exists (kept honest).

Process-lifetime, request-INDEPENDENT state (frozen dispatch tables → type them `ReadonlyMap`/`ReadonlySet`; ops registries; the event channels themselves) is fine — that's what the allowlist is for. Request-DEPENDENT state is never fine.

---

## RULE 2 — The ALS backstop foot-gun: never read `current*()` outside request scope

`currentApplicationLang()` / `currentDataLang()` fall back to the **installation default** (`config.menu.applicationLang` / `config.menu.dataLang`) when the store is empty; `currentPrincipal()` returns **`undefined`** outside a request. These backstops are deliberate — but they turn "no request scope" into a *silent wrong answer*, not an error.

You lose the store whenever you leave the synchronous request flow: a `setTimeout`, a module-level `.then()`, a detached background job, a scheduler tick. Read `current*()` there and you silently get the DEFAULT, not the caller's value.

- **Why it exists:** S1-16 — the dd1758 activity log recorded actor `user -1` because the write ran outside request scope and `currentPrincipal()` backstopped. Wrong-actor audit rows.
- **Two hard sub-rules:**
  1. **Never call `current*()` inside a cache-key builder.** The value's lang/principal dimension must be an explicit function argument (see Rule 4 keying), or the key silently defaults and you serve one lang's cache to every lang.
  2. **Never default identity to a constant on a write or audit path.** Thread the principal explicitly; if it's absent, fail loud — don't stamp a placeholder.

`currentPrincipal()` is documented in-code as a **backstop — prefer the explicitly-threaded `principal` parameter** wherever a call site has one. Follow that.

---

## RULE 3 — Build every cache through the factory, never a hand-rolled Map

Create module-level caches only via `src/core/ontology/cache_factory.ts`:

- `createOntologyCache<K,V>()` — content derived from `dd_ontology`. Registers with the invalidation hub (`ontology/cache_invalidation.ts`) at construction: **every dd_ontology write clears it**.
- `createDataCache<K,V>(onSectionData)` — content derived from matrix **record data**. Registers with the save/delete event channel (`section_record/save_event.ts`): after every persistent write/delete, your callback evicts what derived from that section tipo.

A cache is invalidation-wired **by construction** — the module cannot forget to register, because registration happens inside the constructor before the Map is handed out.

- **Why it exists:** S1-09 — ≥16 of ~20 hand-rolled caches were never registered with the hub, so they served **stale data after an edit** (S1-10 / S1-11 defect class). "Modules remember to register" was proven a nonviable convention.
- **What breaks without it:** you edit a record / ontology node, but reads keep returning the pre-edit value until the process restarts.
- A cache that is BOTH ontology- and data-derived (e.g. datalist option lists — shape from ontology, values from target records) is made with `createOntologyCache` and *additionally* wires its own `registerSectionDataListener` (pattern: `relations/datalist.ts`).
- Keep exporting your named `clearXxxCache` too — deliberate redundancy; it's the module's public invalidation API and the completion gate's anchor. Double-clearing a Map is free.

---

## RULE 4 — Key a cache by EVERY dimension its value depends on

The value depends on `tipo` **AND** lang **AND** (where relevant) principal/project — put all of them in the key. A cache keyed only by tipo serves lang A's value to a lang B request: same bleed as Rule 1, just laundered through a Map. And per Rule 2, the lang/principal dimension must arrive as an explicit argument, never via a `current*()` call inside the key builder.

---

## RULE 5 — No in-transaction seeding of shared caches

A cache populated *inside* an open transaction must not persist uncommitted rows into a process-shared cache (S1-14): a concurrent request would read rows that might ROLLBACK. The hub handles this — inside a tx the cache drop is **deferred to COMMIT/ROLLBACK** (`cache_invalidation.ts`), so clears replay only on commit. Don't defeat it by writing your own mid-tx cache population. The one legitimate in-tx cached read — the **`<tld>0` matrix-table short-circuit** in `resolver.ts` used by hierarchy provisioning — is preserved by design and needs no mid-tx clear.

---

## RULE 6 — Background executors thread identity/lang explicitly

Media jobs, the diffusion scheduler, and any detached executor run **outside** request scope — the three ALS stores are empty. Do not rely on `current*()` there (Rule 2 backstop = silent default). Decide and **thread the lang and principal explicitly** as parameters into the job payload. Diffusion lang catalogs, for instance, derive from the project (see memory: diffusion-langs-derive-from-project), not from a request's single dataLang. `withTransaction` similarly does not cross an unawaited timer/promise boundary — start async work *inside* the awaited callback or the tx handle is already gone.

---

## Working checklist

- Adding module state? → route through `cache_factory.ts` or justify an allowlist entry; run `bun test test/unit/module_state_tripwire.test.ts`.
- Reading `current*()`? → confirm you are in synchronous request flow, and NOT inside a cache-key builder or a write/audit identity slot.
- New cache? → factory-constructed, keyed by all of {tipo, lang, principal/project}, named clearer exported.
- Background job? → lang + principal passed in explicitly, never read from ALS.
- Coexistence caveat: in-process invalidation does NOT fire for PHP-side writes on the shared DB — **restart the TS server after PHP ontology/registry writes** (DEC-20; rewrite/COEXISTENCE.md).

## See also

- **engineering/REQUEST_ISOLATION.md** — the authoritative ALS/isolation model.
- **rewrite/LEDGER.md** — measured state, tripwire index, open gaps.
- **engineering/CONVENTIONS.md** — error handling (§1), dynamic imports (§2).
- **rewrite/COEXISTENCE.md** — PHP↔TS shared-DB rules (DEC-19/20).
- Sibling skills: `dedalo-config` (readEnv is the only env reader — `src/config/env.ts`; typed catalog `src/config/config.ts`; no `process.env` outside `src/config/`, tripwired by `config_env_tripwire.test.ts`), `dedalo-parity-debugging` (PHP oracle harness), `dedalo-relations-ts` / `dedalo-section-family-ts` (cache-heavy consumers of these rules).
