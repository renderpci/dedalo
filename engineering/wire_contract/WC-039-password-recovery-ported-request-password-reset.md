# WC-039 — password recovery ported: `request_password_reset` / `confirm_password_reset` are live TS surfaces

- **Date:** 2026-07-18 (task: "login forgot_password_link doesn't work").
- **Context:** the login screen's forgot-password flow was fully wired in the
  copied client (`client/dedalo/core/login/js/login.js` :292-350 posts
  `dd_utils_api:request_password_reset` / `confirm_password_reset`), but the TS
  engine never implemented the actions — Gate 1 rejected both with HTTP 400, so
  no recovery email was ever sent and confirm always failed. The whole PHP
  subsystem (`core/password_reset/class.password_reset.php` + `dd_mailer`) is
  now ported: `src/core/security/password_reset.ts` + `src/core/mailer/mailer.ts`
  (nodemailer over SMTP), pending codes in the session sqlite store
  (`session_store.ts` `password_resets`), both actions in `NO_LOGIN_ACTIONS` +
  `CSRF_EXEMPT_ACTIONS` (PHP dd_manager pre-auth/CSRF whitelist parity).
- **Shape:** identical to the frozen-PHP response contract, which the client's
  error-code map (`render_login.js` :874-879) pins: request always returns
  `{result:true, msg, reset_id:<32-hex>}` (anti-enumeration); confirm returns
  `{result, msg, errors:[]}` with codes
  `invalid_or_expired | too_many_attempts | weak_password | reset_failed`.
- **Deliberate divergences (all wire-invisible):**
  - timing normalization on the no-op request paths is one decoy Argon2id
    verify (`auth.ts normalizeTiming`, the AUTHZ-03 login posture), not PHP's
    `sleep(2)`;
  - pending-code storage is the session sqlite store, not a JSON file cache;
  - a successful reset EVICTS the user's existing sessions
    (`destroyUserSessions`) — PHP did not; a stolen session must not survive
    the reset that revokes the account's credentials;
  - the PHP `DEDALO_SMTP_VERIFY_PEER=false` escape hatch is NOT ported: TLS
    peer verification is never disableable (WC-023 D1 tripwire; pin a private
    CA via `NODE_EXTRA_CA_CERTS`). Config keys: catalog domain `mailer`
    (`DEDALO_SMTP_*`, `DEDALO_PWRESET_*`).
- **Gate reconciliation:** no fixture touches and no re-harvest — the frozen
  store never recorded these actions (the PHP engine froze with them
  unexercised by the harvest). The TS-native contract gate is
  `test/unit/password_reset_native.test.ts` (DEC-14b twin): happy path against
  a scratch matrix_users record, anti-enumeration shapes, attempt cap, expiry,
  weak-password, malformed reset_id, mailer-unconfigured guard, session
  eviction.
