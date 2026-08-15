# WC-051 — Session lifetime retuned, and the media cookie + `not_logged` bound to it (2026-07-24)

One policy change with three wire consequences. Idle TTL 12h → **1h**
(`SESSION_TTL_SECONDS`), absolute cap 30d → **12h**
(`SESSION_ABSOLUTE_TTL_SECONDS`): an unattended browser is the threat, and the
client's own background polling renews an idle session indefinitely, so the cap
is what actually ends a day. Long-running work is UNAFFECTED by construction —
background tools keep the requesting user on the job record and never re-read
the session (`core/tools/background.ts`), and diffusion re-derives the enqueuing
principal from `owner_user_id` at run time (`diffusion/runner.ts`, DIFF-01) — so
publication and massive imports outlive their owner's logout.

**1. `dedalo_media_auth` now tracks the session.** It was minted ONLY at login
with a fixed `Max-Age=86400`, while the session refreshed on every request. Both
directions were broken: anyone logged in over a day kept a healthy session and
lost the cookie, and since the WEB SERVER gates media (not this process), every
image/av/pdf/3d 404'd while the app looked fine — with no publication markers,
Rule A is the only door. Conversely a cookie minted just before logout stayed a
valid media credential for up to 48h with no session behind it. Now re-issued on
any authenticated request whose cookie is missing or stale, with `Max-Age` = the
session idle window, via the read-only `currentMediaAuthCookie()` (never mints,
never rotates, never rewrites the rule files — it is on the hot path).

**2. The auth denial carries `errors:['not_logged']`** (`notLogged()`, replacing
`denied(401, 'Authentication required')`, which put the human message in
`errors`). The whole client dispatches re-login on that literal token — modal,
per-component retry on `login_successful`, error render — inherited from the PHP
oracle and emitted by nothing in TS, so the entire recovery path was unreachable
dead code. The maintenance-mode gate returns the same shape, as its comment
already claimed. `msg` still carries the human text.

**3. Three TS-ONLY `page_globals` keys** (PHP has no twin — it had nothing to
warn about): `dedalo_session_ttl_seconds`, `dedalo_session_absolute_expires_in`,
`dedalo_session_warning_seconds` (`SESSION_WARNING_SECONDS`, default 300, `0`
disables). Only the ABSOLUTE deadline is shipped because only it is underivable
client-side — the idle window restarts on every request, so `session_expiry.js`
re-arms a local timer from the `session_activity` beat instead of a per-response
countdown field. Zero per-response wire cost.

Client-side, `_fetch_with_retry_and_timeout` now EXEMPTS 401 from its HttpError
throw: it classified 401 non-retryable, painted a permanent red "Not retry-able
HTTP error 401" and threw, so the envelope never reached `.json()` and
`api_response_errors` never published. Without that exemption point 2 is inert.

### Gate

`test/unit/session_expiry.test.ts` (both clocks on read AND in the GC — the
sweeper matched only `last_seen`, so a session kept warm past the absolute cap
was refused on every request and never deleted; plus the two reported clocks) ·
`test/unit/media_protection_cookies.test.ts` (re-issue when missing/stale,
silence when current, `Max-Age` = idle window, never for an unauthenticated
caller, and that the read path performs no write) ·
`test/unit/session_not_logged_contract.test.ts` (the 401 token over real HTTP,
the 401 exemption in `data_manager`, and that every client branch still names
`not_logged` — so the server token can never be orphaned again) ·
`test/parity/environment_differential.test.ts` (the three keys asserted TS-only,
then stripped, exactly as WC-031).

## Addendum 2026-08-15 — `not_logged` is now the registered code `auth.not_logged`

Point 2 above holds, with the token promoted into the closed taxonomy
(`WC-2026-08-15-error-envelope-v2`).

The auth gate now THROWS `auth.not_logged`; the dispatch chokepoint converts it
(`src/core/errors/convert.ts`). On the wire:

```json
HTTP 401
{ "ok": false, "request_id": "…",
  "error": { "code": "auth.not_logged", "category": "auth",
             "message": "Authentication required",
             "label_key": "error_auth_not_logged", "retryable": false },
  "result": false, "msg": "Authentication required", "errors": ["auth.not_logged"] }
```

- The literal the client dispatches on moves from `not_logged` to
  `auth.not_logged`, at `error.code`. During the compat window the same literal
  is ALSO the single element of `errors` (`ERROR_ENVELOPE_COMPAT`), so an
  unswept client branch that matched `errors[0]` keeps working — against the new
  dotted token, not the bare one. Every client re-login branch was swept in
  `4470734785`.
- The maintenance-mode gate keeps its own identity: `auth.maintenance`, also
  401, because the client's relogin policy keys on BOTH.
- `notLogged()` in `src/core/api/response.ts` is now a throwing shell
  (`: never`) kept only so unswept call sites compile; it is deleted at P1 exit
  with the legacy body adapter.
- The 401 EXEMPTION in `data_manager` that this entry introduced is gone as a
  special case — `api_transport.js` parses the body on ANY status, so no
  per-status exemption list exists any more
  (`WC-2026-08-15-error-status-is-a-channel`).

Points 1 and 3 (the media cookie bound to the session, the three TS-only
`page_globals` keys) are unchanged. Gate: `session_not_logged_contract.test.ts`
keeps asserting the token over real HTTP and that every client branch still
names it.
