# WC-2026-10-11-session-user-beside-csrf-token — every `csrf_token` on the wire names its owner (`session_user_id`)

- **Date:** 2026-10-11 (audit 2026-09-26 LEAD-2 + CLIENT-5, closure plan Step 8,
  lane 2 — the CSRF-resend half of the re-login identity fix).
- **Decision:** LEAD-2 — a page never moves onto another user's session. The
  re-login overlay already asks who logged in (`error_dispatch.settle_relogin_attempt`);
  the CSRF token is the same question asked without an overlay.
- **Shape before (PHP):** `dd_manager` appended `csrf_token` to every response of
  a session. The client (`data_manager`) took it from EVERY envelope, success or
  failure, and on `auth.csrf_failed` resent the request once with it. The TS
  engine kept that shape (`dispatch.ts executeRqo`); the login handler set its own
  `csrf_token` and `executeRqo` then OVERWROTE it with the request's previous
  session's token whenever one was on the context.
- **Shape after (TS):**
  - Beside `csrf_token`, every response of a session carries the top-level
    extension key `session_user_id` — the user id (`session.userId`, the same
    value `page_globals.user_id` is built from; `-1` for root) of the session that
    token belongs to. Success and failure alike, `auth.csrf_failed` included.
  - The login answer carries `session_user_id` for the session it mints (beside
    its `user_id` + `csrf_token`), and `executeRqo` no longer overwrites a body
    that already carries `csrf_token`: the login's fresh token is the one the new
    cookie matches.
  - Client: `data_manager` adopts a token — and makes its transparent CSRF
    resend — only when `error_dispatch.settle_session_identity(envelope, body)`
    answers `'adopt'`: the session is the page user's, or the page has no user yet
    (the `start` bootstrap, the login page). Another user's session (or a token
    with no owner, on a page with a user) is never adopted: a login-door answer
    keeps its envelope (the login door decides), every other answer becomes
    `client.aborted` (`details.reason:'page_identity_revoked'`), the page
    identity is latched and the page reloads once.
- **Reason:** the shared cookie is the session of whoever logged in LAST in the
  origin. Tab 1 holds A's page; A's session ends and B logs in in Tab 2 (or in a
  tool window's overlay). Tab 1's next save is refused `auth.csrf_failed` — A's
  token does not match B's session — and the refusal handed over B's token, which
  the transparent resend used: A's edit committed with B in the Time Machine and
  in `modified_by`, every later request of Tab 1 went out as B under A's menu.
  The same transfer happened through the SUCCESS of any CSRF-exempt action
  (`get_environment` from a maintenance widget): a valid B token, adopted. The
  client cannot tell the bootstrap race (resend is right) from a replaced
  session (resend is the defect) without knowing whose token it is holding.
- **Gate reconciliation:** parity diffs strip `session_user_id` with
  `csrf_token` (`test/parity/normalize.ts` VOLATILE_TOP_LEVEL_FIELDS — part of
  the token, not of the data contract), so NO re-harvest. Gates:
  `test/unit/csrf_handshake.test.ts` (the refusal and the retried success carry
  `session_user_id`), `test/unit/relogin_identity_wire_native.test.ts` (REAL
  login / CSRF refusal / exempt-success bodies, read by the REAL client
  `session_identity`: 'same' for the session user, 'differs' for another,
  'unknown' without the key), `client/dedalo/test/client/js/test_relogin_identity.js`
  case (s3) (no resend and no adoption for another user, one reload, the latch
  set; the same user resends once; a login-door answer keeps its envelope; a
  page with no user adopts).
