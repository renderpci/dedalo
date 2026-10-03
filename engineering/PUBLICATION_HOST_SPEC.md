# PUBLICATION HOST — a separate publication machine, controlled from the work system

> **Status 2026-10-03: DESIGN; phase 1 (the `publication_host` rule profile) BUILT.** Nothing below is built yet except where a phase in §8
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

## 2. The control channel (trust law)

The panel controls the publication host through a **publication agent**: a small Bun
daemon on the publication host (`publication/host_agent/`, its own package, its own
`.env`, its own tests — the `publication/site_builder` precedent).

1. **Direction is work → publication, only.** The publication host never opens a
   connection to the work host. The firewall states it; the agent holds no work-host
   credential and no work-host address.
2. **The channel is private.** A private network (WireGuard) or mTLS on a non-public port,
   firewalled to the work host's address. Never routed through the public vhost.
3. **Pairing is proved, not assumed.** Shared bearer + the domain-separated pairing
   fingerprint recipe of `src/core/site_builder/pairing.ts` (a mis-pasted env file must
   name the mismatch, never silently drive another institution's host).
4. **Closed command set.** The agent executes ONLY the commands in §6. There is no
   "run script", no shell, no path argument outside its own roots.
5. **Least privilege.** The agent runs as its own user, writes only under its roots
   (API releases, media copy, generated web-server includes), and reloads the web server
   through one sudo rule for `apachectl configtest && apachectl graceful` (or the nginx
   pair) — nothing else.

Rejected alternatives, for the record: manual operation (drift, no panel visibility,
unpublish depends on a human); SSH scripts from the engine (a shell credential for a
public host in the engine's hands); a hosting panel's API (far wider than the job);
publication-host pull (reverses the firewall direction).

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
- Install = stage the release → (v2) `bun install --frozen-lockfile --production` →
  health check → atomic `current` swap (`rename`) → restart. A failure before the swap
  leaves the old release serving. Rollback = swap back. Keep the last 3 releases.
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

## 5. Media modes (per publication host, chosen in the panel)

| mode | who holds the bytes | gate on the publication host |
|---|---|---|
| `copy` | the agent, a copy of the published files only | none needed — everything present is public |
| `shared` | shared storage: work host RW, publication host RO | Rule B only, rendered for the host's mount root |

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
  includes of the same inputs carry different hashes.

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

| command | effect |
|---|---|
| `status` | agent + API versions, health, disk, media mode, applied rule hash, mount state, manifest hash |
| `release.install {api, release, sha256, bundle}` | §3 install, auto-rollback on failed health |
| `release.rollback {api}` | swap `current` back |
| `rules.apply {server, text, hash}` | write the include, `configtest`, graceful; keep the previous file on failure |
| `media.probe` | mount present, read-only, `pub/` readable, marker count |
| `media.put` / `media.delete` / `media.manifest` | `copy` mode only |

## 7. Verification — the public-URL probe

A rule hash proves rules are INSTALLED, not that they GATE. The engine fetches through the
publication host's **public URL** a known published file (must answer 200) and a known
unpublished one (must answer 404), after every rule change and on a schedule. A failed
probe is red in the panel. The two probe records are scratch records the engine owns.

## 8. Phases

| # | deliverable | depends on |
|---|---|---|
| 1 | `publication_host` rule profile (Apache + nginx), a CLI rendering it, the lockstep tripwire extended, a real-engine drill. Usable by hand before any agent exists. **Built:** `src/core/media/publication_host_rules.ts`, `bun run media:publication-host-rules`, `bun run test:media:pubhost`. | — |
| 2 | The agent: pairing, `status`, `rules.apply`, `media.probe`, `release.install/rollback`. | 1 |
| 3 | Engine side: publication-host registry, client, `media_control` per-host mode + status. | 2 |
| 4 | Updater pushes the API bundles after an engine update. | 2, 3 |
| 5 | `copy` mode: the diffusion media-copy target + reconcile. | 2, 3 |
| 6 | Public-URL probe, on change and scheduled. | 3 |

Decided per phase, in its own plan: host registry storage (phase 3), transport choice
WireGuard+bearer vs mTLS (phase 2), probe record provisioning (phase 6).
