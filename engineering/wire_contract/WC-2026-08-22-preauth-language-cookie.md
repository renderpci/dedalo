# WC-2026-08-22-preauth-language-cookie — the login panel's language choice rides a cookie

- **Date:** 2026-08-22.
- **Decision:** none specific; follows the request-isolation law (no module-level
  "current language") and DEC-12 (tripwire or delete).

## Shape before (PHP)

PHP kept the whole pre-auth conversation in a PHP SESSION: `session_start()` ran
for anonymous visitors too, so `dd_utils_api::change_lang` had somewhere to write
`$_SESSION['dedalo']['config']['dedalo_application_lang']` before any login, and
the next page build read it back. No cookie beyond `PHPSESSID` was involved.

## Shape after (TS)

The TS engine has no anonymous session — a `sessions` row exists only after a
successful `login()`. So:

- `dd_utils_api:change_lang` joins `NO_LOGIN_ACTIONS` (`src/core/api/dispatch.ts`).
- With a session the handler still writes `setSessionLangs()`. Either way it
  returns `ApiResult.setPreauthLangCookie`, which `src/server.ts` emits as
  `Set-Cookie: dedalo_lang=<lang>; HttpOnly; SameSite=Lax; Path=/; [Secure];
  Max-Age=31536000` — the **application** language only. The cookie mirrors the
  application language ALWAYS, authenticated or not: it outlives the session and
  `login` adopts it, so a cookie refreshed only by the login form would reinstate
  itself over every later in-app choice (pick Català on the form, set Deutsch in
  the menu, log out — and the next login comes back Catalan, forever).
- An anonymous `change_lang` carrying ONLY `dedalo_data_lang` is REFUSED
  (`auth.not_logged`): the cookie has no slot for it, and answering `ok(true)`
  while storing nothing is the silent narrowing the standing rule forbids.
- `dispatchRqo` seeds the request language scope
  `session row → allowlisted `dedalo_lang` cookie → install default`. The cookie
  is caller input, so it is read through ONE door (`allowlistedPreauthLang`) and
  accepted only if it names a language of this install's
  `DEDALO_APPLICATION_LANGS` map — it never reaches a lang-keyed JSONB path
  unvalidated (SEC §7.6).
- `dd_utils_api:login` adopts the cookie language onto the fresh session,
  re-applying `DEDALO_DATA_LANG_SYNC` (`setSessionLangs` is two independent
  UPDATEs and couples nothing itself, so adoption would otherwise mint a state
  `change_lang` cannot produce).

## Reason

The login form (`client/dedalo/core/login/js/render_login.js`) renders a language
selector, posts `change_lang` and full-reloads. Pre-auth that post was refused
(`auth.not_logged`), nothing was stored, and the reloaded form came back in the
install default language — the switch was inert for exactly the users who need it
most (an editor who cannot read the default language cannot read the login form).
A cookie is the only per-visitor store available before a session exists; making
it HttpOnly and one year long states plainly that it is a PREFERENCE, not a
credential — nothing authorizes on it, and its only effect is which labels render.

ACCEPTED CONSEQUENCE — the shared browser. Because the cookie mirrors every
application-language change and `login` adopts it, a preference set IN THE APP by
one user is inherited by the NEXT user of the same browser: a shared cataloguing
workstation where A picks Deutsch and logs out hands B a German app. The
alternative (adopt once, then clear the cookie) removes that, at the price of the
thing the feature exists for — the LOGIN FORM would revert to the install default
on every later visit, which is the original bug for exactly the editor who cannot
read the default language. So the leak is accepted: it is a label language, it is
visible, and B's own first change overwrites it. Written down here so it can be
re-weighed rather than rediscovered.

CSRF posture — stated exactly, because it is what justifies the exemption. The
anonymous branch traverses no CSRF gate (`runAuthGates` returns before it when
there is no session), the same posture the login POST itself has. So a third-party
page CAN make a browser store a `dedalo_lang` of its choosing: `SameSite=Lax`
governs when a cookie is SENT, not when it is set. And because `login` adopts the
cookie, the planted value does NOT stop at the login form — it reaches the
victim's next authenticated session, and persists until they change the language
again.

That is accepted, with eyes open. The cookie is a PREFERENCE: nothing authorizes
on it, it names no record, and the whole effect of the attack is that a user's
labels render in the wrong language until they pick another — visible and
self-correcting, at the cost of one HTTP request the attacker could not have made
useful otherwise. The alternative — a CSRF token for anonymous visitors — means
minting server state for every unauthenticated GET of the login page, which is a
DoS surface traded for a label-language annoyance.

## Gate reconciliation

No parity gate is affected — the frozen fixture store has no pre-auth
`change_lang` capture (the harvest ran authenticated), so NO re-harvest is
needed. Native gates: `test/unit/change_lang.test.ts` (`change_lang before login`
— reachable anonymously + cookie returned, cookie drives the next anonymous
environment, an off-install lang is ignored, the session always beats the cookie).
