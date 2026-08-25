# WC-2026-08-24-media-auth-session-scoped — the media credential becomes per-session, and revocable

- **Date:** 2026-08-24.
- **Decision:** the `dedalo_media_auth` cookie value is minted PER SESSION and stored
  on the session row, instead of being one value per install per day. Logout,
  password reset, single-session eviction and session expiry now unlink the
  marker that value names — i.e. they revoke media access, which nothing
  previously could.
- **Supersedes** the day-global note in WC-051 (which tied the cookie's LIFETIME
  to the session; this ties its IDENTITY to the session).

## Why

A logged-in user reads media through the web server, not through this process:
Apache/nginx authorizes rule A by stat()ing `<media>/.publication/auth/{value}`.
No application process is in the byte path — that is what keeps multi-GB files on
sendfile and Range — so **while the marker exists, the cookie works**, and no
session, principal or password check is consulted.

The value used to be one per INSTALL per DAY: every logged-in editor held the
identical cookie. Two rules followed, and both were written into the code:

- *"Logout must never unlink the auth marker"* (`dd_utils_api` quit handler) —
  unlinking the shared value would have logged every other editor out of the
  media tree. Logout cleared the browser cookie only.
- `password_reset.ts` revoked every session of the user — and could not touch the
  media cookie, for the same reason.

So a stolen `dedalo_media_auth` kept working for up to ~48 hours (today's and
yesterday's markers are both valid) across a logout AND a password reset, wholly
outside the session store's reach. A recovery flow whose entire purpose is to cut
off whoever holds a stolen token could not cut off one of the two credentials it
had issued.

## Shape after

The marker set under `.publication/auth/` is a **projection of the sessions
table**:

| event | before | after |
|---|---|---|
| login | recycle today's install value | mint this session's key, lay its marker |
| second login | same value returned | a DIFFERENT key; both markers live |
| logout | browser cookie cleared, marker kept | marker unlinked — that session only |
| password reset | sessions revoked, media cookie still valid ~48 h | every one of that user's markers unlinked |
| single-session eviction | evicted token dead, its media cookie alive | evicted markers unlinked, the kept one survives |
| session expiry / prune | marker kept until day rollover | unlinked with the row |
| widget re-enable | markers re-laid from the day store | markers re-laid for every LIVE SESSION |

New chokepoint `src/core/security/session_media.ts` — `endSession`,
`endUserSessions`, `sweepExpiredSessions`. Nothing in `src/` should call
`destroySession` / `destroyUserSessions` / `pruneExpiredSessions` directly any
more: a delete that does not unlink leaves the web server honouring a credential
whose session is gone.

## What did NOT change, and why that matters

The value is still exactly 128 lowercase hex characters (`sha512` of CSPRNG
bytes), and the cookie NAME is still fixed. That is load-bearing: the generated
Apache/nginx rules capture `[a-f0-9]{128}` and never mention a value, so **no
rule text changes and nginx needs no reload** for any of this. `TEMPLATE_VERSION`
is untouched by this entry.

## Migration

- `createSession` takes the key as an OPTIONAL fourth argument. More than a
  hundred test files and the client-suite runner construct sessions three-arity;
  a required parameter would have turned a security fix into a mass edit of
  unrelated call sites.
- Sessions live across the upgrade carry `media_key IS NULL` and are **re-keyed
  lazily** on their next authenticated request (the WC-051 re-issue path). Same
  for sessions created while protection was off on an install that later switches
  it on. Re-keying lays a marker and updates the row; it must never regenerate
  the rule files — that is the authenticated hot path.
- `<private>/media_auth.json` is renamed `media_auth.json.migrated` once at boot
  (`retireLegacyAuthStore`). Renamed rather than unlinked so an operator
  debugging the upgrade can still see it; dead credentials left on disk are what
  get restored from a backup years later.
- Holders of the old day-global cookie lose media access at the first boot after
  the upgrade and get a working one on their next authenticated request — no
  re-login needed.

## The orphan sweep must not run at boot

A marker can outlive its row only if the process died between the DELETE and the
unlink. The obvious place to collect those is boot; it is the wrong one. The
session store is repointable (`DEDALO_SESSION_DB_PATH`) while the media root is
not, and `src/core/update/smoke_boot.ts` starts the candidate tree with an EMPTY
throwaway session store and the inherited `MEDIA_PATH`. A boot reconcile would
therefore unlink every live editor's marker on the production tree — on every
`bun run test:update` and every real code update. The sweep runs from the
maintenance widget and after a prune, where the caller is definitionally holding
the real store.

## Gate

`test/unit/media_session_revocation_native.test.ts` — two logins get two live
credentials; logout revokes one and leaves the other; a reset revokes all of a
user's and nobody else's; eviction keeps the surviving session usable; the hex
grammar holds and no marker path is built from an unvetted value; orphans are
collected and live keys kept. Mutation-verified: dropping the unlink from
`endSession` turns it red. `test/unit/security_audit_2026_07_23_tripwire.test.ts`
now pins `endUserSessions` in the single-session branch and refuses the bare
`destroyUserSessions` that would silently drop the media half.
