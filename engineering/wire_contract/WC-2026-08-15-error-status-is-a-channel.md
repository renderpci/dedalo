# WC-2026-08-15-error-status-is-a-channel — the HTTP status is derived from the error code, and the client reads the body anyway

- **Date:** 2026-08-15 (the P1 chokepoint commit `8b5ab764e1` + the client half
  `4470734785`).
- **Decision:** DEC-15. Normative source: `engineering/ERRORS_SPEC.md` §1/§3.
  The envelope half is `WC-2026-08-15-error-envelope-v2`.
- **Re-harvest: NO — impossible by definition.** The oracle is frozen.
- **SUPERSEDES** the status rule of `WC-2026-08-06-external-search-request`
  ("a 4xx is reserved for CALLER FAULTS… a service failure answers HTTP 200")
  — see the addendum on that file.

## Shape before (PHP, and TS until today)

The status was decorative. The dispatch catch-all answered `200` for every
throw, and the handlers that DID pick a status picked it by hand and
inconsistently. The reason was a client defect, honestly described in
`WC-2026-08-06`: `data_manager.request` treated every non-2xx as a thrown fetch
error and never called `.json()`, so a 4xx body — everything the server said
about WHY — was discarded before any caller saw it. WC-051 then exempted 401
and `WC-2026-08-12-authorization-denial-token` exempted 403, one status at a
time, which is a policy that only ever covers the statuses somebody has already
been bitten by.

So the engine was pushed into answering `200` with `result:false` for real
failures, and the status channel — the one thing every proxy, load balancer,
log aggregator and `curl` in the world already understands — carried nothing.

## Shape after (TS)

**`ok:false ⇒ status ∉ 2xx`, and the status is a pure function of the code's
category** (`CATEGORY_STATUS` in `src/core/errors/registry.ts`):

| category | status | meaning to the caller |
|---|---|---|
| `caller` | 400 | the request was wrong — fix it and retry |
| `auth` | 401 | not authenticated (or the session ended) — re-login, then retry |
| `permission` | 403 | authenticated, not allowed — retrying changes nothing |
| `not_found` | 404 | no such resource (one shape for every miss — no existence leak) |
| `conflict` | 409 | the state moved under you — re-read, then decide |
| `limit` | 429 | throttled — retry after `Retry-After` |
| `unavailable` | 503 | a dependency is down/degraded — retry later |
| `internal` | 500 | the engine could not honour a well-formed request |

A code whose status must differ from its category's is either a DIFFERENT code
or a named row in `STATUS_EXEMPTIONS` with its reason next to it. That table is
EMPTY today, and it is empty on purpose: an exemption you can add silently is
not an exemption.

`Retry-After` is emitted from the throw's `retryAfterMs`
(`limit` / `unavailable` codes only), rounded up to whole seconds, by the
chokepoint that owns the Response — `dispatchRqo`'s caller in `src/server.ts`
and `jsonFailureResponse` alike.

**The client parses the body on ANY status.** `api_transport.js` is the one
fetch layer now: `fetch` never throws on a status, so it reads the body text
ONCE and parses it as JSON regardless of `response.status`; a `2xx` with an
unparseable body is the client-side `bad_response` code, and a non-2xx with a
valid envelope is the SERVER's code, verbatim. Retry is driven by
`error.retryable` (and `Retry-After` when present), never by a hard-coded
status list. The per-status exemptions of WC-051 and WC-2026-08-12 are
therefore GONE — not because the statuses stopped mattering, but because
"parse the body, then decide" makes an exemption list unnecessary.

## Reason

A status is the only part of a failure that the infrastructure between the two
peers can read. Answering `200` for a refusal means: the proxy caches it, the
uptime probe calls it healthy, `requests_4xx` / `requests_5xx` are structurally
zero, and every operator dashboard reports a green server that is refusing
every request. It also means an integrator outside the browser (a script, a
harvester, another Dédalo relaying an error report — WC-017) has to implement
Dédalo-specific body parsing before it can tell success from failure, which is
the definition of a surface that does not compose.

The rule that a status may not be trusted was a workaround for a client that
threw before reading. Fixing the client is a smaller, truer change than
permanently discarding the status channel — and it is what makes the two
one-status exemptions collapse into one law.

**Degradation is not a failure**, and this rule does not make it one: a source
that answered badly while the request itself was fine stays `ok:true` with a
notice — `WC-2026-08-15-external-degradation-is-a-notice`. The status is a
channel for the REQUEST's outcome, not for the quality of a third party's
answer.

## Gate reconciliation

`test/unit/dispatch_error_native.test.ts` (each gate code lands on its
registry status; `auth.not_logged` 401, `auth.maintenance` 401,
`auth.csrf_failed` 403, `perm.denied` 403, `install.not_reachable` 404,
`request.unknown_action` — the SAME body minus `request_id` whether the action
is unregistered or flag-disabled, so a probe cannot learn an intake exists) ·
`error_registry_native.test.ts` (`status === CATEGORY_STATUS[category]` for
every code, `STATUS_EXEMPTIONS` empty-and-reason-stamped) ·
`error_envelope_native.test.ts` (`ok:false ⇒ status ∉ 2xx`; `Retry-After` from
`retryAfterMs`) · `session_not_logged_contract.test.ts` and
`authorization_denial_native.test.ts` (the 401/403 statuses over real HTTP) ·
the client half in `client/dedalo/test/client/js/test_error_policy.js`.

**Re-harvest: NOT NEEDED.** Statuses are not part of the frozen response
bodies, and `adoptErrorEnvelopeV2` (`test/parity/normalize.ts`) diffs bodies
only — it projects the frozen `(msg, errors)` pair through
`FROZEN_ERROR_BODIES` and never asserts a status.
