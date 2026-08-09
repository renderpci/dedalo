# WC-2026-08-03-cors-allowed-origins — the JSON API answers cross-origin callers again

- **Date:** 2026-08-03 (found while wiring a containerised client Dédalo to a
  separate ontology master; the update panel reported the master *ready* and
  then died on submit).
- **Decision:** none pre-existing. Taken under the AGENTS.md hard rule that the
  server must satisfy the client's contract — `render_update_ontology.js`
  fetches the master **from the browser**, so a master that sends no CORS
  headers cannot serve the client it advertises to.

## Shape before (PHP)

`core/api/v1/json/index.php:89-104` emitted, gated on a `DEDALO_CORS`
constant holding `allowed_origins` / `allowed_methods` / `allowed_headers` /
`max_age`:

```
Access-Control-Allow-Methods:  <config>
Access-Control-Allow-Headers:  <config>
Access-Control-Max-Age:        <config, default 86400>
Vary: Origin
# and, only when the request Origin is in allowed_origins:
Access-Control-Allow-Origin:      <the request origin>
Access-Control-Allow-Credentials: true
```

The SEC-012 note on that block is the reason it echoes a single origin and never
combines `*` with credentials.

## Shape before (TS, until this entry)

**Nothing.** No `Access-Control-*` header anywhere in `src/`, no `OPTIONS`
route, and `DEDALO_CORS` absent from the catalog *and* from
`migration_map.ts` — so it was not even recorded as an unmigrated key. Every
cross-origin browser call to a TS engine failed its preflight with a 404.

## Shape after (TS)

Gated on the new `DEDALO_CORS_ALLOWED_ORIGINS` (`string_list`, default `[]`).
**Empty emits nothing**, so no existing install changes behaviour.

On `OPTIONS` to an `API_PATHS` pathname from an allowlisted origin — `204`, no body:

```
Access-Control-Allow-Origin:  <the request origin>
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, X-Dedalo-Csrf-Token, X-Dedalo-Report-Token
Access-Control-Max-Age:       86400
Vary: Origin
```

On the `POST` response: `Access-Control-Allow-Origin` + `Vary: Origin` for an
allowlisted origin; `Vary: Origin` alone otherwise. A non-allowlisted `OPTIONS`
is **declined, not answered** — it falls through to the normal 404, which does
not confirm to a prober that the path exists but their origin is unlisted.

Emitter: `src/core/security/cors.ts`; wired at the two `server.ts` chokepoints
(the preflight branch ahead of every POST branch, and the API response headers).

## Deliberate divergences from PHP, both narrowing

- **Only the origin list is configurable.** The methods and headers are fixed by
  what `data_manager.js` sends (`Content-Type: application/json`, which alone
  forces the preflight, plus `X-Dedalo-Csrf-Token`). An operator editing them
  can only break the feature, so they are module constants.
- **No `Access-Control-Allow-Credentials`.** `data_manager.credentials` is
  `'same-origin'`, so no cookie is ever attached to a cross-origin call and the
  header would grant nothing. A cross-origin caller is therefore **always
  unauthenticated** and reaches only what the API opens to an anonymous
  request — listing an origin widens who may ASK, never what they may have.
  Omitting it also removes the `*`-plus-credentials footgun by construction.

## Gate

`test/unit/cors_native.test.ts` (20 assertions, no PHP twin — this is a
re-introduction, not a parity port). It pins the negative invariants first: off
by default, never `*`, never credentials, `Vary` even on refusal, and an
exact-match origin table covering the classic bypasses (suffix extension,
embedded origin, scheme downgrade, port change, trailing slash, case, subdomain,
literal `null`).

`test/unit/config_census_tripwire.test.ts` forced the key to be classified;
it is `NEW_IN_V7` rather than a `RESHAPED` rule off `DEDALO_CORS`, because that
constant is not in the v6 census this map is keyed on and the value shape is
narrower by design.

No fixture change and **no re-harvest** (`engineering/ORACLE_HARVEST.md`): the
frozen store holds response *bodies*, and this entry adds only headers, on a
path that emits none of them unless an operator opts in.

## Addendum 2026-08-08 — the `*` sentinel (a PUBLIC ontology master)

The entry above assumed a master that knows its clients. A **public** master
does not: it advertises its ontology to any Dédalo on the internet, so the set
of client origins is unbounded and an enumerated allowlist cannot express the
configuration at all. The single list entry `*` is therefore read as **any
origin** (`isAllowed` in `src/core/security/cors.ts`).

- **Whole-list sentinel, not a pattern.** Only a bare `*` matches; `*.example.org`
  and `https://*` stay ordinary literal entries that match nothing, because a
  suffix rule is the classic CORS bypass this file refuses by construction. `*`
  present alongside other entries simply wins.
- **Config-only — never on the wire.** The REQUEST origin is still what is
  echoed in `Access-Control-Allow-Origin`, so `Vary: Origin` keeps its meaning
  and a literal `*` can never pair with a credentials header a later change
  adds. The "never `*`" invariant of the original entry is unchanged as a
  statement about emitted bytes.
- **The literal `"null"` origin** (sandboxed iframe, `file://`) matches under
  `*` like anything else. "Any origin except that one" would be an arbitrary
  carve-out: a page on an origin the attacker controls is already allowed.
- **What it widens.** Who may ASK, from "any HTTP client" — already true, CORS
  being a browser rule and not a firewall — to "any HTTP client, plus any web
  page in a visitor's browser". The reachable surface is exactly the anonymous
  one (`NO_LOGIN_ACTIONS`); nothing authenticated moves, because the session
  cookie is `SameSite=Lax` and never rides a cross-site POST regardless of what
  the calling page requests, and no `Allow-Credentials` is ever sent. The one
  operational consequence worth stating: an attacker page spends the VISITOR's
  address against the per-address login throttle (`LOGIN_MAX_ATTEMPTS`).
- **A comment corrected, not a behaviour changed.** `jsonApiResponse`
  (`src/server.ts`) argued BREACH-safety from the CORS allowlist and told a
  future reader to REVISIT if it were ever widened to untrusted origins. That
  argument was resting on the wrong gate: what closes the door is the
  `SameSite=Lax` cookie, which makes every cross-origin response an anonymous
  one with no victim secret to compress against. The comment now says so, and
  points the revisit trigger at the cookie posture instead.

Gate: the `` `*` sentinel — any origin `` block in `test/unit/cors_native.test.ts`,
plus a partial-wildcard case added to the exact-match table (a pattern entry must
keep matching NOTHING). Still no fixture change and no re-harvest, for the
reason given above.
