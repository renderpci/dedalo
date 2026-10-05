# PUBLICATION HOST — a separate publication machine, controlled from the work system

> **Status 2026-10-03: DESIGN; phase 1 (the `publication_host` rule profile), phase 2 (the publication agent) and phase 3 (the engine side: registry, agent channel, panel) BUILT.** Nothing below is built yet except where a phase in §8
> says so. Each phase gets its own implementation plan (internal process); this file is
> the definition they implement. Media-access details extend `engineering/MEDIA_PROTECTION.md`.

## 1. Topology and scope

Two machines, one institution:

- **Work host** (internal): the engine, the maintenance panel, the matrix Postgres,
  the media master tree. The ONLY writer of everything.
- **Publication host** (public): the website(s), the Publication APIs v1 (PHP) and v2
  (Bun), the published MariaDB, and the published media — either a copy (§5.2) or a
  read-only view of shared storage (§5.1).

The single-host install (work + publication on one machine) is unchanged and stays
first-class. A publication host is an ADDITION the panel learns about, never a mode the
single host must take.

### 1.1 Single machine, two hostnames (small institutions)

The same architecture on one server: two vhosts, one media tree, no network channel.

```
dedalo.museum.org (work)   → engine; media mode `private` (Rule A only, engine .htaccess)
www.museum.org   (public)  → website + API v1 + API v2; media = the §5.1 profile
                             rendered with --root <the real media path>
```

- **Why a separate hostname even here:** origin isolation. With the back-office under the
  website's origin, any XSS or compromised website plugin acts with a logged-in curator's
  session against `/dedalo/core/api/` (same origin → CORS does not apply). Separate
  hostnames also keep work cookies off the public site and let the back-office be
  firewalled alone. Moving to two machines later only moves the `www` vhost.
- **Media path into the public vhost:** the generated include's `Alias` points straight at
  the real media root. No symlink (it needs `FollowSymLinks` and isolates nothing) and no
  mount (same filesystem, same Apache). OPTIONAL hardening: read-only BIND mounts of only
  the public quality folders + `.publication/pub` into a separate root, rendered with that
  root, so a rule mistake cannot expose what is not mounted (cost: one fstab line per
  public quality; root-only ops, not panel-drivable).
- **Isolation by users, not network:** engine (`dedalo`, owns `../private` 0700, media RW,
  Postgres via unix socket + peer auth); web server reads media read-only (group);
  PHP-FPM pool user with `open_basedir` excluding media and `../private`; API v2 its own
  user; APIs use a read-only MariaDB user; systemd `ProtectSystem=strict`,
  `ReadWritePaths=` minimal, `NoNewPrivileges=yes` on the Bun services.
- **Control:** the SAME agent (§2, §6) listening on a local unix socket (the
  `publication/site_builder` precedent). One code path for one or two machines: the
  registry (phase 3) treats "local" as an ordinary publication host whose address is a
  socket.
- Backups must leave the machine (one disk carries work and public data).

## 2. The control channel (trust law)

The panel controls the publication host through a **publication agent**: a small Bun
daemon on the publication host (`publication/host_agent/`, its own package, its own
`.env`, its own tests — the `publication/site_builder` precedent).

1. **Direction is work → publication, only.** The publication host never opens a
   connection to the work host. The firewall states it; the agent holds no work-host
   credential and no work-host address.
2. **The channel is private and mutually authenticated (decided in phase 2).** Over a
   network: **mTLS** on a non-public port, firewalled to the work host's address, never
   routed through the public vhost. The provisioner runs a private CA on the publication
   host and issues a server certificate (SAN = the declared listen address: a canonical
   private IPv4 literal, never a hostname or wildcard — `LISTEN_HOST_PATTERN`) plus ONE
   engine client certificate and key. The agent pins exactly that client CA (`Bun.serve`
   `requestCert` + `rejectUnauthorized`, constants in `src/boot.ts`, never configuration).
   A TLS listener whose certificate, key or client CA is missing, unreadable or not PEM
   refuses to BOOT. It never serves unverified. The engine's half leaves the host as one
   root-only `0600` file (`engine_bundle.pem`: client certificate, client key, CA) that the
   operator carries to the work host. WireGuard stays a RECOMMENDED network layer
   underneath, not a substitute: the agent cannot verify a tunnel, but it can verify a
   certificate. On a single machine (§1.1): a unix socket, mode 0660, group = the
   engine's. **Plain TCP does not exist**: the listener is `unix` or `tls` and nothing
   else. The agent's suite listens on a unix socket, and its mTLS gates bind TLS on
   `127.0.0.1` with their own scratch CA.
   The agent trusts any client certificate its OWN instance CA signed, so reissuing the
   engine bundle revokes nothing. Revoking a leaked bundle = rotating the CA (remove
   `tls/ca.pem` + `tls/ca.key`, `provision apply`): new CA and leaves, and the running
   agent is restarted (it loads TLS once, at boot).
3. **Pairing is proved, not assumed.** Every request except `GET /health` carries
   `Authorization: Bearer <token>` (≥ 32 chars, constant-time compare). The bearer is
   checked BEFORE route matching, so unauthenticated 401/404/405 answers are
   indistinguishable. `/health` publishes `instance_fingerprint =
   sha256('dedalo-publication-host:' + instance + '\n' + token)` (lowercase hex) and never
   the instance name. The engine recomputes it (`src/core/publication_host/pairing.ts`);
   `test/unit/publication_host_pairing_tripwire.test.ts` twins that with
   `publication/host_agent/src/security/pairing.ts`. The prefix is this protocol's own,
   not the site builder's `dedalo-site-instance:`: a proof for one protocol is never valid
   for the other. A wrong instance and a wrong token produce the same mismatch. The three
   layers do three jobs. The certificate proves the caller is the paired engine's
   machine. The bearer proves it holds this host's secret. The fingerprint proves both
   sides mean the SAME host, so a mis-pasted env file names the mismatch instead of
   silently driving another institution's host.
4. **Closed command set.** The agent executes ONLY the commands in §6. There is no
   "run script", no shell, and no route that takes a filesystem path. Every child process
   goes through `publication/host_agent/src/exec.ts`, whose public API is a closed set of
   named commands with no free argv. A package test fails if any other module spawns.
5. **Least privilege, no root at runtime.** The agent runs as its own user and writes
   only under its state root (`publication_api/`, `rules/`, `audit/`). It holds exactly
   two grants, both rendered and hash-stamped by the provisioner: a **sudoers** rule for
   the web server's configtest argv only (`apachectl -t` / `nginx -t`, because a
   configtest must read root-only TLS keys), and a **polkit** rule allowing `reload` of the
   observed web unit, `restart` of the v2 unit, and `start`/`stop` of the v2 scratch
   template unit `<v2 unit>-scratch@<port>` (port 1024–65535; the `publication/site_builder`
   precedent). There is no shell and no free argv. The media include the agent installs
   is checked against a closed directive allowlist
   (`publication/host_agent/src/rules/directives.ts`) before root parses it: no module
   load, no include, no log or piped directive, no path outside MEDIA_ROOT. What remains
   runs at request time as the web-server user, the trust §2.6 already gives the paired
   engine.
   **Pushed release code never runs as the agent user.** The agent uid owns `rules/`
   (which root parses at configtest), holds the sudo configtest grant, the TLS server key
   and the bearer. Release code running as that uid could reach root, for example by
   writing a `LoadModule` into the include and running the configtest itself. So
   `exec.ts` `v2ScratchBoot` repoints `v2/scratch` at the committed `releases/<id>` and
   `systemctl start`s `<v2 unit>-scratch@<port>`: the release under test runs as the v2
   user in v2's sandbox, with `v2.env` read by systemd. No named command runs `BUN_BIN`
   (pinned in `publication/host_agent/tests/exec.test.ts`).
6. **Trust model (stated, not hoped).** A compromised work host means a compromised
   publication host, because `release.install` runs code the work host pushed. The reverse
   does not hold: the publication host has no work-host credential and no work-host
   address (1.). The agent therefore validates SHAPE (the sha256 stamp, the bundle grammar
   of §3, path confinement) and the PRIVILEGE BOUNDARY (the media include's directive
   allowlist of item 5, and release code that never runs as the agent user), and never the
   INTENT of the paired engine. A check on which release the only writer chose would protect
   nothing, so there is no downgrade refusal. A check that keeps the engine's trust from
   becoming ROOT is not one of those: the engine is trusted with what the web-server and
   v2 users can do, never with root.
   Every `current` swap is recorded `from → to` in the agent's append-only audit log.

Rejected alternatives, for the record: manual operation (drift, no panel visibility,
unpublish depends on a human); SSH scripts from the engine (a shell credential for a
public host in the engine's hands); a hosting panel's API (far wider than the job);
publication-host pull (reverses the firewall direction).

Rejected for the transport (phase 2): bearer over WireGuard alone. A leaked bearer would
then be enough to drive the host. With mTLS it is useless without the engine's client key.

### 2.1 The engine side (phase 3)

- **Registry.** `<private>/publication_hosts.json` (0600), `{"version":1,"hosts":[…]}`,
  one record per host keyed by `name` (`^[a-z][a-z0-9_]{1,31}$`). A record holds the
  agent's instance, the expected pairing fingerprint, the address (`tls` host + port, or
  `unix` socket), and the three panel-editable fields: `public_url`, `qualities`
  (null = the engine's public qualities) and the `probe` paths (phase 6). It holds no
  secret. It is written tmp → fsync → rename under a lock
  (`src/core/publication_host/registry.ts`). An absent file means no host. A file that is
  unreadable, malformed or carries a duplicate name makes the panel show `registry_invalid`;
  it is never treated as empty and never as a partial list. It is not `ts_state.json`,
  whose writer is not atomic and resets to defaults when the file is corrupt.
- **Secrets.** Each host has `<private>/publication_hosts/<name>/` (0700) holding `token` and
  `engine_bundle.pem`, both 0600 and owned by the engine user
  (`src/core/publication_host/secrets.ts`). They never appear in the registry,
  `ts_state.json`, a panel payload, a log, the activity audit or an error detail. The panel
  reports only their presence. They are not in `.env` because that file is append-only and
  frozen at boot (a rotated token would need a restart), and its fixed key names cannot
  express N hosts.
- **Adding a host is an operator ceremony on the work host, never a form.**
  `scripts/publication_host_pair.ts` runs as the user that runs Dédalo, the owner of
  `<private>` (`sudo -u <engine user> …`). It refuses any other uid, root included,
  because root-owned 0600 secrets would be unreadable by the engine. It reads the agent's
  `engine.env.fragment` and `engine_bundle.pem`. The token comes from the pasted fragment
  line, a 0600 `--token-file` or `--token-stdin`, and never from argv. The CLI refuses
  placeholders, contradictions and credential files readable by others, proves the pairing
  live (the `/health` fingerprint, no bearer), and only then writes the secrets and the
  registry record. An address typed into a web form would be an SSRF and
  credential-exfiltration surface. The panel edits only `public_url`, `qualities` and the
  probe paths, and it can remove a host.
- **One door.** `src/core/publication_host/transport.ts` is the only engine code that
  dials an agent. It is the fourth outbound door (`engineering/OUTBOUND_SPEC.md` §2.1):
  exact address, mTLS or unix, bounded, redirects refused.
- **Pairing before the bearer** (`src/core/publication_host/agent_client.ts`, the
  `tools/tool_sitebuilder/server/daemon_client.ts` order): an unauthenticated `GET /health`,
  the fingerprint compared, and only then the bearer request. A mismatch (for example, the
  agent re-provisioned with a new token) is `publication_host.pairing_mismatch`. The
  bearer is never sent and nothing is applied.
- **Errors** are the `publication_host.*` family: `unconfigured`, `registry_invalid`,
  `unreachable`, `pairing_mismatch`, `auth`, `rejected` (an agent 4xx refusal), `failed`
  (an agent 5xx), `busy` (an agent 409, OR the work host's own registry lock held past its
  wait by the pairing command or another panel write — `wire.ts` `registryError`, logged as
  `registry_reason: locked`) and `timeout`. The agent's problem `reason` maps to a public
  sentence (`src/core/publication_host/wire.ts`). The agent's prose is logged, never shown.
- **The panel** is the `publication_hosts` maintenance widget (category `publication`,
  `src/core/area_maintenance/widgets/publication_hosts.ts`, wire entry
  `engineering/wire_contract/WC-2026-10-03-publication-hosts-widget.md`). For each host it
  shows the checks `registry`, `secrets`, `reachable`, `pairing`, `agent_version`,
  `media_mode`, `media_mount`, `media_read_only`, `rules_hash`, `api_v1` and `api_v2`, the
  expected vs reported rule hash (§5.1), and each API's current/previous release. The
  actions `apply_rules`, `probe`, `rollback_api`, `set_host_fields` and `remove_host` are
  ROOT-ONLY: the Dédalo root user, as in the `media_control` precedent. A global admin
  who is not root gets `perm.denied`, and no agent call is made; it reads the checks
  without the host's network address. `media_control` carries one read-only line
  linking to the panel.

## 3. Publication API deployment

Each API is its own deployable on the publication host, code from the engine's verified
release, state outside the code:

```
<pub root>/publication_api/
  v1/shared/server_config_api.php     v1/releases/<release>/   v1/current -> releases/<release>
  v2/shared/v2.env                    v2/releases/<release>/   v2/current -> releases/<release>
```

- Apache `Alias` (v1) and the systemd unit (`WorkingDirectory`, `EnvironmentFile=` v2.env)
  point at `current`. v2 reads only `process.env`, so `EnvironmentFile` needs no code change.
- **Release id** = `<version>_<digest7>`, validated `^\d+(\.\d+){1,3}_[0-9a-f]{7}$`
  (e.g. `7.0.3_a1b2c3d`). Developer-channel installs keep the version, so only the digest
  tells two releases apart. Re-installing an existing id only re-points `current`.
- **Bundle = gzip'd ustar, parsed in-process** (`publication/host_agent/src/releases/ustar.ts`).
  There is no system `tar`, so there are no GNU-vs-BSD differences, and validation and
  extraction are one code path. Only entry types `0` (file) and `5` (dir) are allowed,
  plus PAX `x` records that carry only `path`. Total bytes (`MAX_BUNDLE_BYTES`), entry
  count (`MAX_BUNDLE_ENTRIES`) and path length (1024) are capped. No absolute, `..` or
  duplicate path is allowed. An offending entry is refused BEFORE it is written, and
  staging is removed. The stream's sha256 must equal the declared one. Phase 4 writes the
  engine-side writer and its round-trip twin test.
- **No registry egress.** A v2 bundle carries its production `node_modules`, built on the
  work host with the pinned Bun (phase 4). The agent never runs `bun install`.
  `bun build --compile` is not an option: v2 reads `swagger-ui-dist` assets from
  `node_modules` at runtime (`src/routes/docs.ts`). Its dependencies are pure JS, so the
  tree is platform-neutral.
- **v1 config stays outside the release.** v1 resolves its config at the fixed path
  `dirname(__FILE__,2)/config_api/`. After extraction the agent links
  `releases/<r>/config_api/server_config_api.php` (and `server_config_headers.php` when
  `shared/` has one) → `shared/`. A v1 bundle that carries either file is refused
  (`reserved_path`).
- **Install** = stream into staging with the stamp verified → (v1) `php -l` lint →
  (v2) boot the release on a scratch port and probe its health → atomic `current` swap
  (temporary symlink + `rename`) → (v2) restart the unit, then health. A failure before
  the swap leaves the old release serving. A failed post-restart health swaps `current`
  back and restarts the unit on the previous release. **Rollback** = swap back to the
  newest non-current release. Keep `RELEASES_RETAINED` releases (default 3, minimum 2).
  Pruning never removes the current or the previous release.
- **Why `shared/`:** the engine's code updater keeps only `.git` across a tree swap
  (`PRESERVE_ROOT_ENTRIES`, `src/core/update/code_update.ts`), so any state stored inside
  a code tree dies on update.
- **Lockstep:** the API release equals the engine release that published the data. The
  engine updates first, then pushes the API bundle; the panel shows both versions and
  flags a mismatch.

## 4. Media URL

Published records and the APIs (`MEDIA_BASE_URL`, default `/dedalo/media`) already carry
`/dedalo/<mediaDir>/…` URLs. The publication host serves media at **the same URL path**.
No rewriting of published data, and the MEDIA-03 envelope pattern
(`imageEnvelopePcre`, URL-derived) holds unchanged on both hosts.

## 5. Media modes (per publication host, declared on the host, shown in the panel)

| mode | who holds the bytes | gate on the publication host |
|---|---|---|
| `copy` | the agent, a copy of the published files only | none needed — everything present is public |
| `shared` | shared storage: work host RW, publication host RO | Rule B only, rendered for the host's mount root |
| `none` | nobody — the host serves no published media | — |

The mode is declared on the publication host (the agent's `MEDIA_MODE`, written by its
provisioner) and reported by `status`. The panel shows it and never sets it: changing
what a public machine mounts is a root operation on that machine.

The work host's own mode (`MEDIA_PROTECTION.md` §6) is independent. With a separate
publication host, `private` (Rule A only) is the recommended work-host mode: the work
media is then never anonymously reachable.

### 5.1 `shared` — the `publication_host` rule profile

The work host's generated rules embed the WORK host's media root and include Rule A, so
they are wrong on the publication host twice: the root path differs (every request
fails closed → 404), and the `auth/` markers (live work-session credentials) must never
be honoured publicly. The publication host gets its own profile, rendered by the engine
from the same templates:

- **Contents:** the always-on hardening block, rule 0 (marker store never served), Rule B
  against `<host root>/.publication/pub/`, default deny as 404. **No Rule A.**
- **Apache:** a vhost include (`Alias /dedalo/<mediaDir>` + `<Directory "<root>">` with
  `AllowOverride None`), so the work host's `.htaccess` on the shared tree is never read.
  `RewriteEngine` is NOT wrapped in `<IfModule>`: a host without mod_rewrite refuses to
  start rather than serving ungated.
- **nginx:** a server{} include holding ONE outer `location ^~ /dedalo/<mediaDir>/` with
  the hardening (`nginxHardeningLocations`, shared with the work conf) and the Rule B
  location (`alias`ing into the root) NESTED inside, and `return 404` as its default. The
  `^~` is load-bearing: a plain-prefix catch-all loses to any server-level regex location
  (an operator's `location ~* \.(jpg|mp4)$`), which then serves masters and unpublished
  files from `root`. The existing http{} map file is reused unchanged (the SVG header maps).
- **Mount placement:** the mount must NOT sit under any server/vhost document root (second
  layer behind the `^~`; on Apache the `<Directory>` gate is filesystem-scoped anyway).
- **Inputs:** `root` (absolute, `^/[A-Za-z0-9._/-]+$`, no `..`) and the public qualities
  (through `filterPublicQualities` — never a master tier). An empty quality list is
  refused: a host that may serve nothing is a misconfiguration, not a mode.
- **Hash:** its own `# config-hash:` over `{TEMPLATE_VERSION, profile, server, root,
  qualities, mediaDir}` (`getPublicationHostConfigHash` — call it, never re-derive it) —
  what the agent reports and the panel compares. `server` is in it: the Apache and nginx
  includes of the same inputs carry different hashes. The panel's EXPECTED hash calls it
  with `server` and `root` taken from the agent's `status`, and `qualities` taken from the
  host's registry record (null = the engine's `getPublicQualities()`). `apply_rules` renders
  the include from the same inputs with `buildPublicationHostApacheConf` /
  `buildPublicationHostNginxConf` and sends `rules.apply`
  (`src/core/publication_host/rules.ts`).

**Exports.** Export to the publication host, read-only with `root_squash`, ONLY the public
quality folders and `.publication/pub/`, mounted under one root with the same relative
layout. Never originals, unpublished qualities, `.publication/auth/` or `dbs/`. A
compromised publication host reads everything it can mount.

**Attribute caching.** NFS/SMB cache attributes (≈60 s by default): an unpublish stays
visible, a publish stays hidden, until it expires. Mount `.publication/pub` separately
with `lookupcache=none,noac` (NFS) or `actimeo=0` (SMB). Media folders keep normal caching.

### 5.2 `copy` — the media copy target

A diffusion target beside MariaDB, driven by the same publish/unpublish events and by the
`media_index` ground truth:

- Copies the public qualities only; originals never leave the work host.
- Transfer = `media.put` (temp file → sha256 verify → atomic rename) / `media.delete`.
- Reconcile = the agent's manifest (path, size, sha256) diffed against the published set;
  the same "recompute from ground truth" law as `media_index`.
- **Unpublish is a verified deletion**: logged, then confirmed against the manifest.
  Withdrawn consent must remove bytes from the public host, not an index entry.

## 6. Agent command set (closed)

Every route is under `BASE_PATH` `/publication/host_agent`. Only `/health` is public.
Every route is a literal path: no route takes a parameter, so the per-API release routes
are spelled out one per API. The route column is gated against
`publication/host_agent/src/router.ts` in both directions
(`publication/host_agent/tests/spec_routes.test.ts`).

| command | route | effect |
|---|---|---|
| (pairing) | `GET /health` | liveness + `instance_fingerprint` (§2.3); unauthenticated |
| `status` | `GET /v1/status` | agent + Bun version, platform, fingerprint, per-API `current`/`previous` release, applied rule hash, media probe, state-root free bytes |
| `media.probe` | `GET /v1/media/probe` | mount present, read-only, `pub/` readable, marker count |
| `rules.apply {server, text, hash}` | `POST /v1/rules/apply` | write the include, `configtest`, reload; on a failed configtest restore the previous file, re-run configtest, never reload |
| `release.install {api: v1, release, sha256, bundle}` | `POST /v1/releases/v1` | §3 install of a v1 release; the bundle is the request body |
| `release.install {api: v2, release, sha256, bundle}` | `POST /v1/releases/v2` | §3 install of a v2 release, auto-rollback on failed health; the bundle is the request body |
| `release.rollback {api: v1}` | `POST /v1/releases/v1/rollback` | swap v1 `current` back to the previous release |
| `release.rollback {api: v2}` | `POST /v1/releases/v2/rollback` | swap v2 `current` back to the previous release, restart, health |
| `media.put` / `media.delete` / `media.manifest` | (phase 5) | `copy` mode only |

Errors are `application/problem+json` (RFC 9457, type base
`https://dedalo.dev/publication-host/problems/`, `Cache-Control: no-store`). Every
mutating call names its actor in the `X-Dedalo-Actor` header and is audited.

## 7. Verification — the public-URL probe

A rule hash proves rules are INSTALLED, not that they GATE. The engine fetches through the
publication host's **public URL** a known published file (must answer 200) and a known
unpublished one (must answer 404), after every rule change and on a schedule. A failed
probe is red in the panel. The two probe records are scratch records the engine owns.

## 8. Phases

| # | deliverable | depends on |
|---|---|---|
| 1 | `publication_host` rule profile (Apache + nginx), a CLI rendering it, the lockstep tripwire extended, a real-engine drill. Usable by hand before any agent exists. **Built:** `src/core/media/publication_host_rules.ts`, `bun run media:publication-host-rules`, `bun run test:media:pubhost`. | — |
| 2 | The agent: pairing, `status`, `rules.apply`, `media.probe`, `release.install/rollback`. **Built:** `publication/host_agent/` (daemon + root-run provisioner: mTLS material, units, sudoers, polkit, engine bundle), `src/core/publication_host/pairing.ts` + its twin tripwire, `bun run hostagent:test`, `bun run test:pubhost:agent`. Operator page: `docs/install/publication_host.md`. | 1 |
| 3 | Engine side: publication-host registry, the paired agent channel (the fourth outbound door), client, and the `publication_hosts` maintenance panel (`media_control` links to it; the media mode is declared on the host, §5). **Built:** `src/core/publication_host/` (registry, secrets, door, agent client, host status, expected rules), `scripts/publication_host_pair.ts`, `src/core/area_maintenance/widgets/publication_hosts.ts` + `client/dedalo/core/area_maintenance/widgets/publication_hosts/`, `test/unit/publication_host_door_tripwire.test.ts`, `engineering/wire_contract/WC-2026-10-03-publication-hosts-widget.md`. Operator page: `docs/install/publication_host.md` (*Pair it with the work system*, *The Publication hosts panel*). | 2 |
| 4 | Updater pushes the API bundles after an engine update. | 2, 3 |
| 5 | `copy` mode: the diffusion media-copy target + reconcile. | 2, 3 |
| 6 | Public-URL probe, on change and scheduled. | 3 |

Decided per phase, in its own plan: host registry storage (decided in phase 3: a
dedicated atomic registry file + per-host secret files, §2.1), transport (decided in
phase 2: mTLS + bearer + pairing fingerprint, §2), probe record provisioning (phase 6).
