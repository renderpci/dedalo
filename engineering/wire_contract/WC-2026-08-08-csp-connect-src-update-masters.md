# WC-2026-08-08-csp-connect-src-update-masters — the app CSP admits the update masters it is configured to pull from

- **Date:** 2026-08-08 (found on a LAN client pointed at a separate ontology
  master, immediately after the master's own CORS was opened — the client's
  browser refused the call at the *other* end).
- **Decision:** none pre-existing. Taken under the same AGENTS.md hard rule as
  WC-2026-08-03: the server must satisfy the client's contract. Both update
  panels fetch a REMOTE master from the browser, so an engine whose own CSP
  forbids that connection cannot use the masters its own config offers.

## The failure

The client's browser, on submitting the ontology update:

```
Connecting to 'http://192.168.1.7:4000/dedalo/core/api/v1/json/' violates the
following Content Security Policy directive: "connect-src 'self' blob:
http://localhost:8080". The action has been blocked.
…
))) get_ontology_update_info: {result:false, msg:'Max retries reached, request failed.'}
```

`connect-src` held `'self' blob:` plus the install's own media origin, and
nothing else. The request never reached the network, so **the master's CORS
posture was irrelevant** — no preflight was ever sent.

This is the CLIENT-side twin of the asymmetry `core/security/cors.ts` documents
from the master side, and it presents identically: the reachability probe beside
the button (`checkRemoteServer`) is a server-to-server Bun `fetch` that neither
CSP nor CORS applies to, so the panel shows a master **ready** and then cannot
talk to it. A working browser-side update now needs three things to agree — the
probe, the MASTER's origin allowlist, and the CLIENT's `connect-src`.

## Shape before

`APP_CSP` (`src/core/api/static_asset.ts`):

```
connect-src 'self' blob: [MEDIA_CSP_ORIGIN]
```

The two browser-side callers it forbade:

- `client/dedalo/core/area_maintenance/widgets/update_ontology/js/render_update_ontology.js`
  → `data_manager.request({url: server.url, … action:'get_ontology_update_info'})`
- `client/dedalo/core/area_maintenance/widgets/update_code/js/update_code.js`
  → `data_manager.request({url, … action:'get_code_update_info'})`

## Shape after

```
connect-src 'self' blob: [MEDIA_CSP_ORIGIN] [UPDATE_MASTER_CSP_ORIGINS…]
```

`UPDATE_MASTER_CSP_ORIGINS` is the de-duplicated set of `new URL(entry.url).origin`
over `ONTOLOGY_SERVERS` + `CODE_SERVERS`. An install configuring no master emits
a byte-identical policy to before, so nothing changes for the common case.

## Why DERIVED, and not a new config key

An operator naming a server in `ONTOLOGY_SERVERS` has already declared it
trusted to **replace this installation's entire ontology**. Requiring them to
then name the same origin a second time, in a security header, to make the
feature they just configured actually work, would be a key whose only correct
value is computable — and whose omission produces the silent, mis-attributed
failure above. A config that offers a master the browser is forbidden to reach
is incoherent, not safe.

## Deliberate narrowings

- **`connect-src` ONLY.** A master hands us ontology DATA. It is asserted absent
  from `script-src` and from `object-src`, so the no-remote-code invariant
  (RC-01) and the MEDIA-03 `object-src` exactness are untouched: a compromised
  master still cannot deliver executable code or a nested browsing context.
- **Origin, never url.** A CSP source carrying a path would narrow the policy to
  one endpoint and break every other call to the same master.
- **`http`/`https` only, malformed dropped.** A `file:`/`data:`/`javascript:`
  url, a relative path, or a typo contributes nothing — it cannot be reached
  over the network anyway, so it is not something to widen the policy for.
- **No wildcards, no suffixes.** The set is exactly the configured origins.

## Gate

`test/unit/xss_csp_tripwire.test.ts` (indexed in `engineering/TRIPWIRES.md`).
Two additions:

1. The config-derived assertions — every derived origin appears in
   `connect-src` and in neither `script-src` nor `object-src`, and the derived
   count equals the distinct configured origins.
2. A **synthetic** table over the exported pure `deriveUpdateMasterOrigins`.
   This exists because the config-derived half is vacuous exactly where the
   engine is developed: a master is configured on a CLIENT box and not on a
   MASTER box, so on an ontology master the whole feature would be gated over an
   empty list. The table pins scheme filtering, origin-not-url, port
   significance, de-duplication across the ontology/code lists, and the
   malformed-url cases.

The pre-existing "no absolute origin anywhere" shortcut in the
same-origin-media branch was replaced with a per-directive check, since an
update master is now a legitimate absolute origin in `connect-src`.

No fixture change and **no re-harvest** (`engineering/ORACLE_HARVEST.md`): the
frozen store holds response *bodies*; this changes one response header, and only
on an install that configures a master.

## Operator note

The policy is built at boot from config. A client that adds or changes
`ONTOLOGY_SERVERS` must **restart** before the panel can reach the new master —
`bun --watch` reloads on a source edit, not on a `.env` edit.
