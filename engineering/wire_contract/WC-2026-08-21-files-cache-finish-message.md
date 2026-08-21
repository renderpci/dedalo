# WC-2026-08-21-files-cache-finish-message — the files-cache `finish` message always reports, and reports the same keys

- **Date:** 2026-08-21. Client-internal wire (service worker / Web Worker →
  login page), not a PHP-oracle divergence — recorded here because WC-002 froze
  the *server* half of this seam for exactly this reason and left the *client*
  half ungated.
- **Decision:** none standing; this entry is the law for the seam.

## Shape before

Two producers, two shapes, one consumer:

- `client/dedalo/core/sw.js` — `{status:'finish', total_files, time}`, posted
  **only on success**. A manifest read that failed returned early and the
  message was never sent at all.
- `client/dedalo/core/page/js/worker_cache.js` — `{status:'finish',
  total_files, time}` on success, `{status:'finish', error}` on failure.

## Shape after

Both producers post, ALWAYS, exactly:

    { status: 'finish', total_files: number, time: number, error: string|null }

`error` is `null` on a complete pass and carries a code/description otherwise.
The pass having failed does not change the message's obligation to arrive.

`total_files` describes THIS pass: it is read off the manifest the pass itself
resolved, and is `0` when no manifest could be read. It must never be taken from
the worker's module state — since the service worker can restore a previous
bundle's file list from its own cache, that would report the size of a bundle
this pass never touched, precisely when the pass failed.

## Reason

`login.js` navigates from `finish_handler` and from nowhere else. A path that
can end without posting `finish` does not degrade the login — it hangs it, on
the progress ring, with no timeout and no fallback. This is the failure mode
WC-002 warned about ("the client's sw.js has NO failure fallback: any future
change to this action's shape stalls every login at the progress ring"); it was
reachable without any change to the server, through the service worker's own
error path. A cold cache costs a slow first page. A missing `finish` costs the
session.

The client no longer trusts the contract on its own either: the login arms a
watchdog that is RE-ARMED by every message and continues the login on silence
(`FILES_CACHE_WATCHDOG_MS`). The service worker posts `ready` before its network
call, so a guard that disarmed on the first message would never have fired for
the stall that actually happens.

## Gate reconciliation

`test/unit/dedalo_files_cache_key.test.ts` — describe
`the files-cache finish contract`: both producers post `finish` with the same
keys, the login re-arms a watchdog, navigation is idempotent, and the SW path
falls back only when no worker became ACTIVE. Hermetic, credless, source-level
(the same style the cache-key assertions in that file already use).


## Addendum 2026-08-21 — the `waiting` heartbeat, and the refusal outcome

**`{status:'waiting'}`** joins the seam, emitted by `core/sw.js` ONLY. Cache passes
are single-flight, so a login's `update_files` arriving mid-revalidation waits for
the running pass — and emits no `loading` message while it waits, because those come
from inside the pass. The login's watchdog is armed on SILENCE, so a long wait made
it fire and navigate with a cold cache. The heartbeat ticks every 15 s for the whole
pass, queue included; it carries no payload, and arriving at all is the point.

`worker_cache.js` does NOT emit it and does not need to: it has no queue, and its
only silent window is the manifest call (30 s × 3 retries), inside the watchdog's
window. The asymmetry is deliberate.

The client MUST treat an unknown status as "a cache path is alive" — re-arm and
ignore — never as an error. `login.js` carries an explicit `case 'waiting': break`
so the string is visible at both ends.

**Refusal is a failure, and it says so.** A pass that stores fewer than half the
manifested files does not write its commit marker and does not purge: the cache it
would publish is worse than the one it would delete, and — because the new key is
the one the server's `dedalo_version` agrees with — nothing would ever rebuild it.
Such a pass reports `error: 'Cache pass refused: too few files stored'` with
`total_files` still describing the manifest it tried.
