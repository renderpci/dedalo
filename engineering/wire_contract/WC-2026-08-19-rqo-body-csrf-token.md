# WC-2026-08-19-rqo-body-csrf-token — the RQO may carry its own CSRF token

- **Date:** 2026-08-19 (fix for the `update_lock_components_state` /
  `auth.csrf_failed` log line on tab close).
- **Decision:** SEC-008 (CSRF handshake) — this widens its accepted input, it
  does not change the handshake.

## Shape before (PHP)

`request_query_object::$direct_keys` has no `csrf_token` member: the token was a
header (and, for multipart, a form field) and never part of the RQO vocabulary.
The TS engine mirrored that — `src/server.ts` built `csrfCandidate` from
`X-Dedalo-Csrf-Token` alone, and `rqoSchema`'s `.passthrough()` silently
absorbed any `csrf_token` key a client sent.

## Shape after (TS)

`rqoSchema` declares `csrf_token: z.string().nullable().optional()`, and the
CSRF candidate is `X-Dedalo-Csrf-Token ?? rqo.csrf_token ?? null`. The header
always wins when both are present. Nullable is deliberate: the client emits
`csrf_token: page_globals.csrf_token || null`, so an unload inside the bootstrap
window sends an explicit null, which must stay an honest `auth.csrf_failed`
rather than becoming a 400 `request.invalid_rqo`.

## Reason

The consumer needs it. `page.js` releases the component edit lock on
`beforeunload` through `navigator.sendBeacon`, the one transport that cannot set
a request header — so the token can only travel in the payload. Header-only
meant every tab close was refused and the lock lingered until `LOCK_TTL_SECONDS`
(150 s), with a red `auth.csrf_failed` line per close. The beacon is
fire-and-forget, so `data_manager`'s transparent single retry cannot rescue it.

Not a weakening: the session cookie is `SameSite=Lax` (`src/server.ts`), so no
cross-site POST — beacon, form or fetch — carries it, and a cross-origin caller
is structurally unauthenticated before `verifyCsrf` is ever reached
(`core/security/cors.ts` never sends `Access-Control-Allow-Credentials`). The
token also stays out of the logs: `summarizeRqo` reads only `source`/`sqo`
scalars and `access_log.ts` logs no body — which is exactly why the older
`?csrf_token=` QUERY-parameter fallback was removed and is NOT reinstated here.
`media/ingest/upload_endpoint.ts` has accepted a body/form-field token since
SEC-008; this is consistency with it, not a new precedent.

## Gate reconciliation

No parity gate moves: this is accepted INPUT, not emitted output, so the frozen
oracle store is untouched and **no re-harvest is needed**.
`test/unit/csrf_handshake.test.ts` carries the two new cases, shaped like the
real beacon (no CSRF header, `text/plain` body — the CORS-simple content type
sendBeacon uses):

- right token in the body → traverses; wrong token in the body → still 403.
- `csrf_token: null` → 403 `auth.csrf_failed`, never 400 `request.invalid_rqo`.

The first case also pins that no content-type gate sits in front of the JSON
branch in `handleRequest`: adding one would silently kill the beacon, and now
fails this test instead.
