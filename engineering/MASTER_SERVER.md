# MASTER_SERVER.md — the official master: v7 door + transparent legacy v6 service

Status: 2026-09-26 · the REPO half is built and gated (the overlay, the door,
the gates); the DEPLOYMENT is not done — §8 is still ahead. Companion to `PRODUCTION.md`
(general ops) and `RELEASE.md` (how a release archive is cut). Verified against
the deployed v6 code (`6.9.6`) and this tree; every claim carries a `file:line`.

`master.dedalo.dev` becomes the **v7 TS engine** and is the ontology master AND
the code master for both audiences. Today's `master.dedalo.dev` (PHP 6.9.6,
still maintained) is renamed **`v6.master.dedalo.dev`**. Both run on ONE machine
behind ONE Apache 2.4.37, HTTPS on 443 only, two independent certificates,
separate databases, no shared filesystem.

**The requirement that shapes everything:** every pre-7 installation in the
world must keep updating its ontology and its code exactly as it does today,
without touching the installation. So the historical URLs on
`master.dedalo.dev` keep answering with PHP bytes, and the v7 engine takes a
door of its own.

## 1. The rule table

Two workflows (ontology update, code update), each with three legs (probe /
manifest / file download).

| Audience | Leg | URL called on master.dedalo.dev | Identified by | Answered by |
|---|---|---|---|---|
| v6 | probe (ontology + code) | `POST /dedalo/core/api/v1/json/` | form-urlencoded `rqo=` | v6 — rule 3 |
| v6 | manifest (ontology + code), browser | `POST`/`OPTIONS /dedalo/core/api/v1/json/` | JSON + foreign `Origin` | v6 — rule 4 |
| v6 | ontology files | `GET /dedalo/install/import/ontology/6.x/<tld>.copy.gz` | path | v6 — rule 2 |
| v6 | code archives | `POST /dedalo/code/<M>/<M.m>/<M.m.p>_dedalo.zip` | path | v6 — rule 5 |
| v6 (old) | structure server + backup probe | `POST /dedalo/core/extras/str_manager/` | path | v6 — rule 1 |
| v7 | probe + manifest (ontology + code) | `POST /api/v1/json` | path | TS |
| v7 | ontology files | `GET /dedalo/install/import/ontology/7.x/<tld>.copy.gz` | path | TS |
| v7 | code archives | `GET /dedalo/install/code/<M.m.p>/<M.m.p>.zip` (+ `.sha256`) | path | TS |
| v7 master UI | its own client | `POST /dedalo/core/api/v1/json` same-origin | `Origin` = master | TS |

Rules 2 and 5 catch URLs minted **before** the rename or hard-coded in old
installations (e.g. `https://master.dedalo.dev/dedalo/code/dedalo6_code.zip`,
v6 `core/base/update/updates.php:1444`). In steady state a v6 consumer is
handed `v6.master.dedalo.dev` URLs by the manifest and downloads from there
directly — see §3.3.

## 2. Current mechanics

Paths under `V6/` are the deployed 6.9.6 tree; unprefixed paths are this repo.

### 2.1 v6 — ontology workflow

- **Probe** `V6/core/ontology/class.ontology_data_io.php` `check_remote_server`
  (~:678-704): `'rqo='.json_encode($rqo)` as curl postfields;
  `V6/shared/core_functions.php` `curl_request` (~:424-454) sets no
  `Content-Type`, so curl's default `application/x-www-form-urlencoded`
  applies. No `Origin`. Reads `->result`.
- **Manifest** — BROWSER:
  `V6/core/area_maintenance/widgets/update_ontology/js/render_update_ontology.js:189-200`
  → `V6/core/common/js/data_manager.js:93-99,178` (`mode:'cors'`,
  `Content-Type: application/json`) → carries `Origin`; reads
  `api_response.result.files`. Server:
  `V6/core/api/v1/common/class.dd_utils_api.php:1606-1696` →
  `class.ontology_data_io.php` `get_ontology_update_info` (~:600-650). File URL
  = `DEDALO_PROTOCOL.DEDALO_HOST.ONTOLOGY_DATA_IO_URL/<M.m>/<tld>.copy.gz`
  (`:137,638`; `ONTOLOGY_DATA_IO_URL = /dedalo/install/import/ontology`,
  `V6/config/sample.config.php:80,672`).
- **Download** `class.ontology_data_io.php:476-486`: GET,
  `ssl_verifypeer=false`, `basename(url)` only — no origin or host check.
- **Legacy structure server** `V6/core/extras/str_manager/index.php`
  (`$_REQUEST['data']`, version gate >= 6.2.9 `:225-229`, streams `:283`).
  Clients: `class.update_ontology.php:21-24`,
  `V6/core/backup/class.backup.php:344-390` (`data=` form probe), pinned URL
  `V6/core/base/update/updates.php:1441`.

### 2.2 v6 — code workflow

- **Probe** `V6/core/area_maintenance/widgets/update_code/class.update_code.php:25-50`
  (`rqo=` form, `check:'code_server'`, no `Origin`).
- **Manifest** — BROWSER:
  `V6/core/area_maintenance/widgets/update_code/js/update_code.js:80-95` (JSON
  + `Origin`) → `class.dd_utils_api.php:1708-1798` `get_code_update_info`
  (needs `IS_A_CODE_SERVER`, `DEDALO_CODE_FILES_DIR`, the client `version`, a
  `CODE_SERVERS` code) → `class.update_code.php` `get_code_url` `:970-980` =
  `DEDALO_CODE_FILES_URL/<M>/<M.m>`; file URL `:1195` =
  `DEDALO_PROTOCOL.DEDALO_HOST.<code_url>/<M.m.p>_dedalo.zip`; development
  channel `:1204-1207`. `DEDALO_CODE_FILES_URL = DEDALO_ROOT_WEB.'/code'`
  (`sample.config.php:695-698`) → `/dedalo/code/6/6.9/6.9.6_dedalo.zip`.
- **Download** `class.update_code.php:169-181`: **POST** `data=null` (form) to
  the zip URL, `followlocation`, `basename` only.

### 2.3 v6 — the host law (why the hop must be TLS to the named v6 vhost)

`V6/config/config.php:31-33` —
`define('DEDALO_HOST', $_SERVER['HTTP_HOST'] ?? 'localhost')`, an
**unconditional** define (no `defined()` guard; the file throws on double
include `:20-22`). `:35-37` derives `DEDALO_PROTOCOL` from
`$_SERVER['HTTPS'] === 'on'`; `:47-48` derives `DEDALO_ROOT_WEB` from the first
`REQUEST_URI` segment. Envelope/CORS: `V6/core/api/v1/json/index.php:21` sends
`Access-Control-Allow-Origin: *` unconditionally, `:33` Allow-Headers, `:38-45`
answers OPTIONS with `{result:false}`, `:120-122` reads a JSON body, `:149-154`
reads `$_REQUEST['rqo']`.

**Consequence.** A request proxied to v6 over plain HTTP with
`Host: 127.0.0.1:<port>` makes v6 mint
`http://127.0.0.1:<port>/dedalo/install/import/ontology/6.x/...` and
`http://127.0.0.1:<port>/dedalo/code/...` — every v6 download then fails. The
diverted hop must therefore reach v6 **as `https://v6.master.dedalo.dev`**:
`SSLProxyEngine On` + `ProxyPreserveHost Off`. v6 then sees the right host,
`HTTPS=on`, and advertises its own URLs. This also honours the 443-only
constraint: no extra `Listen`, no plain-HTTP vhost — the target IS the existing
v6 vhost, selected by SNI.

`ProxyPreserveHost Off` is additionally **required**: with `On`, the hop would
carry `Host`/SNI `master.dedalo.dev` and loop back into the same vhost. It
applies to the WHOLE vhost, not just the diverted hop, so the engine now sees
`Host: localhost` on every request over the socket. That is free because the
engine reads no `Host`/`X-Forwarded-Host` header anywhere AND builds no absolute
url from `request.url` (which Bun derives from that header) — both shapes are
censused by the tripwire, §6.

The hop also sets `SSLProxyVerify require` + `SSLProxyCheckPeerName on`. Apache's
default is `SSLProxyVerify none`, which would trust whatever answers the name
rather than the name itself; the CA is already on disk for the vhost's own
certificate, so this costs nothing.

**The trap that actually shipped here, recorded so it is not repeated.** This
design was first drafted against nginx, where `$content_type` is a variable, and
the Apache translation carried the spelling over as
`RewriteCond %{CONTENT_TYPE}`. `CONTENT_TYPE` is a **CGI** variable: it exists
only in `subprocess_env` at handler time, so at translate-name time mod_rewrite
resolves it to the empty string and the rule **silently never fires** — every
pre-7 probe would have reached the v7 engine and every pre-7 panel would have
reported the master as not ready. The correct spelling is
`%{HTTP:Content-Type}`, verified on httpd 2.4.68, and the gate now REFUSES the
CGI-only spellings by name (§6).

### 2.4 v7 — ontology workflow

- Keys `src/config/config.ts:1278` `isOntologyServer` (`IS_AN_ONTOLOGY_SERVER`,
  `ONTOLOGY_SERVER_CODE`, `ONTOLOGY_SERVERS`, `ONTOLOGY_DATA_IO_DIR`); catalog
  `src/config/catalog/maintenance.ts:121-181`.
- Probe/manifest `src/core/api/handlers/dd_utils_api.ts:800-857`
  (`get_server_ready_status`, `get_ontology_update_info`; NO_LOGIN and
  CSRF-exempt, `src/core/security/read_door.ts:549-551`); version gate
  `authorizeUpdateManifest` `:56-76`; URLs
  `${publicOrigin()}/dedalo/install/import/ontology/<M.m>/<file>` (`:851`;
  `src/core/resolve/public_origin.ts` = `DEDALO_PROTOCOL` + `DEDALO_HOST`);
  builder `src/core/ontology/data_io_import.ts:198-233`.
- Files `src/server.ts:685-720` `serveOntologyIoFile`, wired `:1132-1136`. The
  exporter writes ONLY the running `<M.m>` dir
  (`src/core/ontology/data_io.ts:112`) — **v7 cannot produce 6.x files.**
- Consumer: server-side probe posts JSON
  (`data_io_import.ts:125-187`); the browser manifest fetch
  (`client/dedalo/core/area_maintenance/widgets/update_ontology/js/render_update_ontology.js:234`)
  needs CORS on the master (`src/core/security/cors.ts:28-45`); downloads are
  **origin-pinned** to the configured `ONTOLOGY_SERVERS[].url` origin
  (`data_io_import.ts` ~:243-270, WC-023 D5) — so `DEDALO_HOST` must be exactly
  `master.dedalo.dev`.
- Body law: JSON only (`src/server.ts:1257,1285`); the `result` key is
  **forbidden** in envelope v2 (`ERRORS_SPEC.md:159-161,172-181`). The API is
  served at BOTH `/api/v1/json` and `/dedalo/core/api/v1/json[/]`
  (`src/server.ts` `API_PATHS` ~:723).

### 2.5 v7 — code workflow

- Keys `src/config/config.ts:1270` `isCodeServer` (`IS_A_CODE_SERVER`,
  `DEDALO_CODE_FILES_DIR`, `DEDALO_CODE_SERVER_DEV_CHANNEL`); catalog
  `src/config/catalog/maintenance.ts:45-64,81-95,109-120`. Layout:
  `DEDALO_CODE_FILES_DIR/<major>/<major.minor>/<M.m.p>.zip` + a `.zip.sha256`
  sidecar (`src/core/update/code_manifest.ts:160-170`).
- Manifest `dd_utils_api.ts:858-900` `get_code_update_info` (code from
  `CODE_SERVERS`, `requiredParts:3`, dev channel only when
  `DEDALO_CODE_SERVER_DEV_CHANNEL=true`) → `code_manifest.ts:138-161`
  (linear-path rungs; advertises only a `<v>.zip` that exists; URL
  `${publicOrigin()}/dedalo/install/code/<M.m.p>/<M.m.p>.zip`).
- Serving `src/core/update/code_serving.ts:29-52`
  (`/dedalo/install/code/(\d+\.\d+\.\d+)/<file>`, fail-closed on
  `IS_A_CODE_SERVER` + dir), wired `src/server.ts:1140`.
- Producer: the update_code widget's build action → `src/core/update/code_build.ts`
  (`git archive` of a validated ref of the code server's OWN checkout, named
  after that ref's `src/core/update/version.ts`, sha256 sidecar; WC-024,
  WC-2026-08-15, WC-2026-08-24). Drill: `bun run test:update` /
  `test:update:dev` (`TMPDIR=/tmp/dd`).
- The v7 code panel also fetches its manifest cross-origin from the browser
  (`client/dedalo/core/area_maintenance/widgets/update_code/js/update_code.js:189-200`),
  so `CODE_SERVERS[].url` must be the v7 door too.

## 3. Architecture

**One host, two upstreams, split at Apache by path and headers — never by
body.** Apache 2.4.37 cannot route on a request body (`%{REQUEST_BODY}` does
not exist; mod_security phase 2 runs after URI translation, so it can block but
not choose an upstream). It does not need to: the discriminators below are all
in the request line and headers.

### 3.1 The v7 door

v7 consumers use **`/api/v1/json`**, which is already an `API_PATHS` member and
already proxied (`deploy/apache.conf:80`). Engine cost: **zero**. The
client-relative `/dedalo/core/api/v1/json/` on this host is reserved for pre-7
installations and for the master's own same-origin UI.

This is **not a wire change** — no byte on any request or response differs and
the path was always served. It is deployment topology, which is why it is
documented here and in `PRODUCTION.md` rather than in the WC ledger.

### 3.2 The five diversion rules

All `[P]` to `https://v6.master.dedalo.dev`:

1. `^/dedalo/core/extras/str_manager/` — path.
2. `^/dedalo/install/import/ontology/[0-6]\.[0-9]+/` — path.
3. `/dedalo/core/api/v1/json/?` + `Content-Type: application/x-www-form-urlencoded`
   — the v6 server-side probes (`rqo=`, and the backup widget's `data=`).
4. `/dedalo/core/api/v1/json/?` + `Origin` present and not
   `https://master.dedalo.dev` — the v6 browser manifests (ontology AND code)
   and their OPTIONS preflight.
5. `^/dedalo/code/` — the v6 code archives.

**Why rule 4 is safe.** The complete census of v6 outbound calls to a
master/ontology/code/structure server:

| # | Call | File:line | Body | Content-Type | Origin |
|---|---|---|---|---|---|
| 1 | ontology probe | `class.ontology_data_io.php:678-700` | POST `rqo=` | form-urlencoded | none |
| 2 | ontology download | `class.ontology_data_io.php:476-486` | GET | — | none |
| 3 | code probe | `class.update_code.php:25-50` | POST `rqo=` | form-urlencoded | none |
| 4 | code zip download | `class.update_code.php:169-181` | POST `data=null` | form-urlencoded | none |
| 5 | backup/structure probe | `class.backup.php:344-390` | POST `data=` | form-urlencoded | none |
| 6 | ontology manifest | `render_update_ontology.js:189-200` | POST JSON | application/json | **present** |
| 7 | code manifest | `update_code.js:80-95` | POST JSON | application/json | **present** |

Every non-browser leg is form-encoded and Origin-less; every JSON leg is a
browser fetch and carries `Origin`. The v7 master's own UI is same-origin
(browsers send `Origin` equal to the host on same-origin POST), and v7
consumers never touch this path.

**The table is complete by SHAPE, not by file.** The deployed 6.9.6 tree ships a
SECOND engine copy under
`core/area_maintenance/widgets/close_v6_prepare_v7/engine/` (~650 tracked files)
with its own `check_remote_server`
(`…/engine/core/ontology/class.ontology_data_io.php:1008`, and `:1021` builds the
same `'rqo=' . json_encode($rqo)` body), its own download and its own backup
probe. Those add no row: they are the same five shapes, so rule 3 covers them
already. Any future pre-7 caller is covered on the same terms — form-encoded and
Origin-less, or JSON from a browser with an `Origin`. A caller outside both is
the residual risk of §11.

### 3.3 Ownership — one owner per URL family

The v6 engine produces 6.x ontology files, 6.x code zips and their manifests
(its own `ONTOLOGY_DATA_IO_DIR`, `DEDALO_CODE_FILES_DIR`). v7 produces 7.x
ontology exports and 7.x release archives. Separate databases, independent
export cadences, no shared IO directory, **no symlink**.

v7 serving the v6 zips was considered and rejected: the v6 manifest mints its
URLs from `HTTP_HOST` (`class.update_code.php:1195`), so once the manifest is
answered by `v6.master.dedalo.dev` it advertises
`https://v6.master.dedalo.dev/dedalo/code/...`. Serving those same bytes from
v7 would give one URL family two owners. The only way to make v6 advertise
`master.dedalo.dev` is to hard-code `V6/config/config.php:31` — a change to the
v6 tree that would also make the v6 UI mint master URLs. Rejected.

### 3.4 Rejected alternatives

- **Symlink the 6.x tree into the TS IO dir** (the original idea) — solves only
  the static download leg; the probe, manifest and `str_manager` legs stay
  broken. It would also make TS publish bytes it cannot validate, and
  `serveOntologyIoFile`'s confinement is a `resolve()` prefix check, not
  realpath-aware (`src/server.ts:707-709`).
- **Content-type split only** — misses the v6 browser JSON manifests.
- **mod_security body routing** — cannot pick an upstream in 2.4.37.
- **A dedicated v7 subdomain** — `publicOrigin()` feeds both manifests and the
  consumer origin pin, so it would need a new public-origin key plus code plus
  a third certificate, for the same result.
- **TS emitting `result` / accepting `rqo=`** — forbidden by ERRORS_SPEC §3.0
  and tripwired; a dual-dialect API at one URL is a wire fork.

## 4. `deploy/apache.master_legacy_v6.conf`

The shipped artifact is an **overlay, never a copy**. `deploy/apache.conf` keeps
the single definition of every v7 route; the overlay adds only what the official
master needs on top of it, and is `Include`d inside the `master.dedalo.dev`
vhost right after its `ProxyTimeout` line:

```apache
Include /opt/dedalo/master_dedalo/deploy/apache.master_legacy_v6.conf
```

Duplicating the vhost instead would fork the routing — the same "link, never
duplicate" law that governs `AGENTS.md`. It also means there is no byte-identity
drift guard to maintain: there is nothing to drift from.

The overlay contains exactly three things: `SSLProxyEngine On`,
`ProxyPreserveHost Off` (both justified in §2.3 — the second OVERRIDES the `On`
of `apache.conf`, and a later value wins in the same context), and the five
`[P]` rules fenced between `# ===== BEGIN LEGACY-V6 DIVERSION` and
`# ===== END LEGACY-V6 DIVERSION`.

The operator's remaining work is ordinary vhost editing, not covered by a repo
artifact because it is site-specific: a `v6.master.dedalo.dev` vhost on `*:443`
with its own certificate (today's `master.dedalo.dev` v6 vhost, renamed — its
`ServerName` is what every v6 manifest url will carry from now on), and the
`master.dedalo.dev` vhost built from `deploy/apache.conf` plus the `Include`.

Modules (`httpd -M`): `ssl_module proxy_module proxy_http_module
rewrite_module headers_module alias_module`. `mod_ssl` also supplies the
`SSLProxy*` directives used on the hop.

mod_rewrite's translate-name hook runs before mod_proxy's, so the `[P]` rules
pre-empt `ProxyPass /dedalo/core/api/` and
`ProxyPass /dedalo/install/import/ontology/` wherever in the vhost the overlay
is included. Confirm once per box with `LogLevel rewrite:trace3 proxy:info`.
`v6.master.dedalo.dev` must resolve **from** the box itself (public-IP hairpin,
or an `/etc/hosts` line — SNI and Host come from the url, not the address).

## 5. Master configuration (`../private/.env`, append-only)

```
# --- ontology master ---
IS_AN_ONTOLOGY_SERVER=true
ONTOLOGY_SERVER_CODE="<the official code, identical to v6's>"
ONTOLOGY_DATA_IO_DIR="/srv/dedalo_private/import/ontology"
# --- code master (7.x; the v6 archives stay v6's own, rule 5) ---
IS_A_CODE_SERVER=true
DEDALO_CODE_FILES_DIR="/srv/dedalo_private/code"
DEDALO_CODE_SERVER_DEV_CHANNEL=false
# --- identity / transport ---
DEDALO_PROTOCOL="https://"
DEDALO_HOST="master.dedalo.dev"
DEDALO_CORS_ALLOWED_ORIGINS=["*"]
TRUSTED_PROXY_TRANSPORT=socket
TRUSTED_PROXY_HOPS=1
```

`DEDALO_HOST` must be exact: it feeds every manifest URL and the consumer's
origin pin. `DEDALO_CORS_ALLOWED_ORIGINS=["*"]` is the honest setting for a
public master — both v7 panels fetch their manifests from the browser.
`CODE_SERVERS` on the master itself is only the list of ACCEPTED codes
(`dd_utils_api.ts:868`); set it to the official entry.

**Publishing 7.x ontology**: export from the master DB with the export_ontology
widget (`data_io.ts:112` → `<IO dir>/7.0/<tld>.copy.gz` + `ontology.json`),
never by copying the vendored `install/import/ontology/7.0` seeds — a code
update replaces that tree.

**Publishing 7.x code**: the update_code widget's build action (§2.5). The
deployed tree must therefore be a git checkout the build action can
`git archive` from.

**Ops rule (no wire change, deliberate):** serving is by exact
`<major.minor>` for ontology and by linear rungs for code. A missing `7.1/`
export or `7.1.0.zip` makes 7.1 consumers see "nothing to update" rather than
an error. Export the new dir when a new minor ships.

## 6. Gates

Per DEC-12, every invariant above is mechanical or it does not exist.

**`test/unit/master_legacy_routing_tripwire.test.ts`** reads
`deploy/apache.master_legacy_v6.conf` and asserts:

1. The **effective** (last-wins) values of `SSLProxyEngine`, `ProxyPreserveHost`,
   `SSLProxyVerify` and `SSLProxyCheckPeerName` are the ones §2.3 depends on —
   asserted as last-wins, not as "appears somewhere", because these are
   single-value directives and a later line silently overrides an earlier one.
2. No `RewriteRule`/`RewriteCond` lives OUTSIDE the fence. The evaluator reads
   only the fenced block, so a stray rule above it (`RewriteRule ^/ - [F]` would
   403 the whole master) would shape production while every table below stayed
   green.
3. Exactly five `[P,L]` rules between the BEGIN/END markers, every one targeting
   `https://v6.master.dedalo.dev` — https, by NAME, never an IP, because the
   target's own identity is what v6 advertises to the world.
4. The two API-path rules are pinned to their discriminators: one on
   `%{HTTP:Content-Type} ^application/x-www-form-urlencoded` (the `HTTP:` form —
   see §2.3); the other on BOTH
   `%{HTTP:Origin} !^$` and `!^https://master\.dedalo\.dev$` — both halves
   load-bearing — and neither on `%{REQUEST_METHOD}`, so the preflight diverts
   with the POST.
5. **A positive table**: every leg of the §3.2 census is evaluated against the
   parsed rules and must divert, path preserved — `str_manager`, a 6.9 and a 6.4
   snapshot, the `rqo=` probe in three spellings (bare, trailing slash, with a
   charset suffix), the browser manifest, the browser preflight, and all three
   code-archive shapes.
6. **A negative table**: the v7 door from a browser and from a server, the
   master's own same-origin UI on the legacy path, a v7 server-side probe left
   on the legacy path, the 7.x snapshot, the 7.x archive and its digest,
   `/health`, media and a client asset — each must stay on the engine.
7. Anti-vacuity: a planted control must divert and another must not, so an
   evaluator that answered uniformly could not pass either table.
8. Couplings the diversion silently rests on: `API_PATHS` still contains BOTH
   `/api/v1/json` (the door is real, so moving consumers costs no engine change)
   and `/dedalo/core/api/v1/json` (the master's own client posts there); both
   catalog samples point at the door; `CODE_RELEASE_URL_PREFIX` is
   `/dedalo/install/code/` and no diversion rule matches it; no file in `src/`
   or `tools/` READS a `Host`/`X-Forwarded-Host` header (the precondition that
   makes `ProxyPreserveHost Off` free); the boot warning of §5 is wired to
   `publicOriginIsLocal()` rather than computed and dropped; and `apache.conf`
   never mentions the pre-7 `/dedalo/code/` prefix.

The evaluator models only the mod_rewrite subset the overlay uses: accumulated
`RewriteCond` over the **`%{HTTP:<header>}` family only**, negation, `[NC]`, a
`[P,L]` rule. Any other directive inside the fence throws, so an unmodelled rule
fails loudly instead of being skipped — and the CGI-only spellings
(`%{CONTENT_TYPE}`, `%{CONTENT_LENGTH}`) are refused BY NAME with the reason,
because the first draft of this overlay used one and this evaluator modelled it
as working: the positive table passed against semantics Apache does not have.
That is the failure mode a hand-written model has, and naming the class is the
only defence against it.

The Host census carries ONE enumerated, shrink-only exemption, re-proved every
run (the file exists, still matches, still declares the domain type):
`src/core/update/code_update.ts`, where `request` is an `UpdateRequest` record
whose `.url` is the configured code-server url — a `.url` field on a domain
object is lexically indistinguishable from an HTTP `Request`, and the day it
becomes one this turns red.

**`test/unit/legacy_dialect_boundary_native.test.ts`** pins why the split must
live at the proxy: this engine answers a form-urlencoded `rqo=` body with a
refusal, has no `str_manager` and no `/dedalo/code/` route, and emits no
`result` key. A future in-engine "compat shim" turns it red.

**Boot warning**, not a refusal. The obvious invariant — a master with a role on
must know its own public name — cannot be a boot refusal: `publicOrigin()`
deliberately falls back to `localhost` so a same-machine dev master works
(`src/core/resolve/public_origin.ts` documents the choice). So `src/server.ts`
warns loudly instead, naming the roles that are on. The helper it calls,
`publicOriginIsLocal()`, was written for exactly this and had **no caller at
all** until now — which is the whole argument for gating the wiring rather than
the value.

That helper was also widened to mean what its name says. It answered only "is
`DEDALO_HOST` unset", but `DEDALO_HOST=localhost` advertises exactly the same
useless urls, so an explicitly-loopback name is local too. The gate tests the
predicate by BEHAVIOUR across both directions — its first draft grepped
`src/server.ts` for a text window and matched the COMMENT above the code, so
deleting the loopback branch left it green.

Honest limit on all of it: these gates prove the SHIPPED RULES say what we mean.
They cannot prove the deployed Apache loaded them, nor mod_rewrite's own
semantics. That is what §9 is for.

## 7. Repo changes

1. `src/config/catalog/maintenance.ts:24,203` — both `CODE_SERVERS` and
   `ONTOLOGY_SERVERS` sample urls become
   `https://master.dedalo.dev/api/v1/json` (the exact `API_PATHS` spelling, no
   trailing slash), with one sentence of doc: the official master serves v7
   consumers at `/api/v1/json`; `/dedalo/core/api/v1/json/` on that host is
   reserved for pre-7 installations. Re-render `install/sample.env` and
   `docs/config/*.md` (`config_docs_tripwire` checks byte identity).
2. `deploy/apache.master_legacy_v6.conf` (§4).
3. The gates of §6.
4. The boot warning in `src/server.ts` (§6).
5. `PRODUCTION.md` gains a pointer to this file; `STAGING_VALIDATION.md` gains
   the §9 checklist.

An existing v7 consumer left on the old url is not silently broken: its
cross-origin JSON manifest POST lands on v6 by rule 4 and returns
`result`-shaped bytes, so the panel fails visibly.

## 8. Cutover

1. Issue the `v6.master.dedalo.dev` certificate. Confirm DNS for both names
   points at this box, and that `v6.master.dedalo.dev` resolves **from** the box
   (hairpin or `/etc/hosts`).
2. Run the live checks of §10.
3. Add the `v6.master.dedalo.dev` vhost (the rename). v6's own config needs no
   edit — its `DEDALO_HOST` follows the new Host automatically.
   `apachectl configtest`, reload. Verify a v6 UI login on the new name and that
   its manifests now advertise `https://v6.master.dedalo.dev/...`.
4. Deploy v7 (`deploy/dedalo-ts.service`, the unix socket) with the §5 env;
   boot; export `7.0/`; build the current release archive; check `/health`.
5. Build the `master.dedalo.dev` vhost from `deploy/apache.conf` and add the
   `Include` of `deploy/apache.master_legacy_v6.conf`; `apachectl configtest`;
   reload.
6. Run §9 from an OUTSIDE host.
7. Merge the §7 repo changes and tell v7 consumers the door.
8. Watch `error_log` for AH01630 (an unrouted path = a missing rule) and the
   rewrite traces for the first week.

## 9. Staging validation

From an outside host. **v6 twins** (a scratch 6.9.x install configured as
today):

1. `curl -X POST --data 'rqo={"dd_api":"dd_utils_api","action":"get_server_ready_status","prevent_lock":true,"options":{"check":"ontology_server"}}' https://master.dedalo.dev/dedalo/core/api/v1/json/`
   → PHP bytes, `{"result":true...}`. Repeat with `"check":"code_server"`.
2. `curl -X OPTIONS -H 'Origin: https://scratch.museum' https://master.dedalo.dev/dedalo/core/api/v1/json/`
   → `Access-Control-Allow-Origin: *` and the PHP
   `{"result":false,"msg":"Ignored preflight..."}`. Then a JSON POST with the
   same Origin for `get_ontology_update_info` (`version: "6.9.6"`, official
   code) → `result.files[]` with urls on
   `https://v6.master.dedalo.dev/dedalo/install/import/ontology/6.9/...`; and
   `get_code_update_info` → urls on
   `https://v6.master.dedalo.dev/dedalo/code/6/6.9/...`.
3. `GET https://master.dedalo.dev/dedalo/install/import/ontology/6.9/matrix_dd.copy.gz`
   → v6 bytes. `POST --data 'data=null' https://master.dedalo.dev/dedalo/code/6/6.9/6.9.6_dedalo.zip`
   → zip bytes (the v6 downloader POSTs).
4. `POST --data 'data={"code":"<code>","check_connection":true,"dedalo_version":"6.9.6"}' https://master.dedalo.dev/dedalo/core/extras/str_manager/`
   → 200 from PHP.
5. The scratch v6 install runs both update panels end to end.

**v7 twins** (a scratch v7 with both server urls set to
`https://master.dedalo.dev/api/v1/json`):

6. JSON `POST /api/v1/json` `get_server_ready_status` for both checks →
   `{"ok":true,"data":true...}`; with `Origin: https://x` →
   `Access-Control-Allow-Origin: *`.
7. `get_ontology_update_info` (`version: "7.0"`) → `data.files[].url` on
   `https://master.dedalo.dev/dedalo/install/import/ontology/7.0/...`;
   `get_code_update_info` → urls on
   `https://master.dedalo.dev/dedalo/install/code/<v>/<v>.zip` with `sha256`.
8. `GET` one 7.0 `.copy.gz` → TS (`Cache-Control: no-store`); `GET` the release
   zip and its `.sha256` → TS.
9. The scratch v7 runs `updateOntology` and a code update end to end.

**Boundary**: a same-origin JSON POST to `/dedalo/core/api/v1/json` with
`Origin: https://master.dedalo.dev` reaches TS (the master UI works: log in,
open a section); the same POST with no Origin reaches TS. `httpd -M` lists the
six modules.

## 10. Live-server facts the trees cannot answer

1. Live `V6 config/config.php`: the values of `DEDALO_CODE_FILES_DIR` /
   `DEDALO_CODE_FILES_URL` (undefined in the tree's copy — rule 5 assumes the
   sample's `/dedalo/code`), `IS_A_CODE_SERVER`, `IS_AN_ONTOLOGY_SERVER`,
   `ONTOLOGY_SERVER_CODE`, `ONTOLOGY_DATA_IO_DIR`, and that `DEDALO_HOST` is
   NOT hard-coded there.
2. Whether the live `code/` tree sits inside the v6 docroot at
   `<docroot>/dedalo/code/<major>/<M.m>/`, and the exact zip filenames under
   `6/6.9/`.
3. That the live ontology IO dir has a `6.9/` (the tree stops at `6.8` plus
   `7.0`, but a 6.9.x consumer asks for `6.9`).
4. That the live `core/api/v1/json/index.php` still sends
   `Access-Control-Allow-Origin: *`.
5. `httpd -M`, and that `v6.master.dedalo.dev` resolves from the box.
6. That no live v6 vhost directive rewrites `Host`/`HTTPS` for PHP.
7. That the deployed v7 tree is a git checkout the build action can
   `git archive` from, and that `/srv/dedalo_private/{code,import/ontology}`
   are writable by the service user.

## 11. Residual risks

- A v6 client posting JSON **without** `Origin` would land on TS and get
  `{ok:false}`. None exists in 6.9.6 (§3.2 census) and older majors reuse the
  same `curl_request` shapes, but a custom fork could differ. It shows up in
  the TS log as an invalid-JSON-body error on `/dedalo/core/api/v1/json`.
- v6 consumers accept any redirect and skip TLS verification — inherited
  behaviour, unchanged by this plan.
- Rule 4 depends on the literal `https://master.dedalo.dev`; a future host
  rename must move the conf and `DEDALO_HOST` together. Tripwired.
- `ProxyPreserveHost Off` diverges from `deploy/apache.conf`; the drift guard
  pins the reason, and the coupling assertion turns red if TS ever starts
  reading `Host`.
- Hairpin TLS to the box's own public IP can be blocked by some NAT setups; the
  `/etc/hosts` line is the fallback.
- The exact-`<major.minor>` ontology rule and the linear code rungs mean a
  missing export makes new consumers see "nothing to update" rather than an
  error (§5).
