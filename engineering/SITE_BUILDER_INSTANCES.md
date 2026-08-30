# SITE_BUILDER_INSTANCES.md — the per-museum instance

Status: 2026-08-29 · the permanent definition of a site-builder INSTANCE — what one is,
what declares it, what is derived from that declaration, and which properties of the
result are mechanically gated. It lives in `engineering/` and not in `rewrite/` for the
usual reason: gates read it, and `rewrite/` is not on a clone.

Subsystem home: `publication/site_builder/` — a standalone Bun/TS daemon, a PEER of the
engine (it never opens the matrix Postgres, never reads the engine's `../private/`, and
its only data source is the read-only Publication API v2). This document is about the
HOST: the users, groups, directories, modes, credentials and web-server configuration one
museum's tenancy consists of.

Phase 0 (the test fixture and its guard, `publication/site_builder/tests/fixtures/instance.ts`
+ `tests/fixture_guard.test.ts` + `tests/seam_tripwire.test.ts`) landed green, and Phase 1
— the declaration grammar (`src/provision/schema.ts`), the derivation
(`src/provision/layout.ts`), the reference declaration
(`deploy/examples/instance.example.json`) and the composition gate
(`tests/provision.test.ts`) — landed on top of it. The fixture already writes the marker of
§5 (taking its name and its content from `layout.ts`) and already names the instance-scoped
root keys of §2, so the provisioner lands against a suite that satisfies the contract
instead of against eleven red files.

Phase 2 then landed the RENDER move and executed the retirement §4 describes: the
renderers (`src/provision/render/{unit,env,sites,nginx,apache,engine_fragment}.ts` behind
`renderAll()`), a gate each, and — in the same commit — the deletion of the six
hand-written artifacts.

`sites.ts` joined them later (2026-08-29) and is the one artifact a PROGRAM reads: the SITE
TABLE, `<config dir>/sites.json`, which publishes every site's derived placement so the
daemon can stop deriving one of its own. It exists because the two sides HAD derived it
independently — the provisioner honouring `sites[].webspace`, the daemon always computing
`<WEBSPACE_BASE>/<domain>` — and disagreed for any site using the override, including the
one in the committed reference declaration: the vhosts served one directory and the daemon
published into another. Being JSON it is the one artifact whose stamp line is `//` rather
than `#` (its reader strips that line before parsing); being load-bearing, it is proved at
boot exactly like a root marker, and a table that is absent, unstamped, hand-edited or
stamped for another instance refuses the start. Their text is now pure functions; the rendered output of the one
committed declaration is committed beside it (`deploy/examples/rendered*`, §4.3) and
byte-compared against a fresh render, so an example can no longer become a seventh
hand-maintained file.

The PROVISIONER then landed on top of that: `src/provision/{fleet,plan,apply,cli}.ts` — the
declared fleet, the PURE `plan(layout, manifest, hostState) => Action[]`, the DUMB `apply`
that executes an already-decided plan and writes only on drift, and the one entry point
`bun run provision <verb>`. Its two lifecycle verbs completed the set: `adopt` (§8), which
infers a declaration from a live pre-instance install and then calls the same
`plan()`/`apply()`, and `remove` (§9), which decommissions by archiving rather than deleting
and never frees a uid. `src/provision/verify.ts` is the serving proof both of them rest on.
The operator's manual for all of it is `docs/management/site_builder.md`; the fifth member
of the backup set is `engineering/PRODUCTION.md` §6.

WHAT A GATE STILL CANNOT SAY. Every provisioning gate drives synthetic prefixes with `exec`
and `chown` stubbed, so what is proved is the plan, the writes, the renames and the modes —
not that `systemctl`, `usermod`, `groupadd` or a real `chown` behave as expected, and not
that the uid boundary holds in the kernel. That is the operator's `provision check` on the
box, and §11 states it as a standing limit rather than a temporary one.

## 1. What an instance is, and the pairing topology

**An instance is one museum's site-builder tenancy**: one OS user, one OS group, one
systemd unit, one daemon process, one socket, one state tree, one audit log, and the set
of webspaces that museum's sites are served from. It is the unit of ISOLATION — the
boundary this whole design defends is the one BETWEEN museums.

Isolation is uid-level rather than path-level, and that is the load-bearing decision. An
agent turn executes arbitrary generated code (a template's `bun install`, a build script
the agent just wrote) as the service user. Confinement helpers (`src/util/paths.ts`) keep
the DAEMON's own copies and deletes inside a root; they cannot constrain a child process
the daemon spawned. What constrains that child is the uid it runs as, and the fact that
nothing belonging to another museum is readable by that uid.

**Topology is fixed and is 1:1.** N museums means N Dédalo engines and N site builders,
paired one to one:

```
museum-a:  engine A (own DB, own ../private/.env)  ──bearer──►  site builder A  ──►  webspaces A
museum-b:  engine B (own DB, own ../private/.env)  ──bearer──►  site builder B  ──►  webspaces B
```

Each engine keeps exactly ONE `DEDALO_SITE_BUILDER_URL` + `DEDALO_SITE_BUILDER_TOKEN`
(catalog: `src/config/catalog/sitebuilder.ts`) pointing at its own daemon. Consequences,
all of them deliberate:

- **There is no engine-side tenant map, and there must not be one.** An engine does not
  select an instance; it has one address. A map would be a second place where the pairing
  is stated, and the first thing that could disagree with the daemon's own identity.
- **The daemon needs no tenant routing either.** It serves one instance, so a request that
  reaches it is by construction that museum's request. Multi-tenancy inside one process
  would put the boundary in application code; here it is in the kernel's credential check.
- **The engine's authorization decision is still the only one made.** The daemon verifies
  the shared token and records the actor the engine reports (`src/security/auth.ts`); it
  authorizes nothing itself. Per-instance isolation does not change that contract — it
  bounds the blast radius of a daemon that has been convinced of something false.
- **A shared host is allowed; a shared uid is not.** Several instances may live on one
  machine. What they may never share is a user, a group, a state tree, a credential file
  or an agent HOME.

## 2. The declaration, and everything derived from it

### 2.1 The one declaration

```
/etc/dedalo_sites/instances/<instance>/instance.json
```

The directory NAME is the instance name, and the manifest repeats it; the provisioner
refuses a manifest whose `instance` field disagrees with its own directory (a renamed
directory would otherwise silently provision a second identity from the first one's data).

`instance.json` grammar. The table is the human contract;
`publication/site_builder/src/provision/schema.ts` is its executable copy and
`src/provision/layout.ts` owns every grammar the schema validates against, so the two are
one grammar with one owner rather than two that agree today. **The document quotes; it
never restates.**

| Field | Required | Meaning |
|---|---|---|
| `instance` | yes | The tenancy name, matching `INSTANCE_PATTERN` (§2.2). Equals the containing directory. Every derived name is a function of it. |
| `description` | no | One line, no control characters. Rendered into every generated artifact's header — which is why it is a constrained string and not free text. |
| `engine.private_dir` | yes | The paired engine's `../private/`. Declared for two reasons only: so the provisioner can assert it lies OUTSIDE every root this daemon owns, and so the pairing fragment lands in the right engine. The site builder never reads it. |
| `engine.group` | yes | The OS group the paired engine runs as. It owns the pairing fragment and the daemon socket. **Never defaulted** — see below. |
| `engine.checkout_dir` | yes | The engine checkout this museum's daemon runs out of. The unit's `WorkingDirectory=` is `<checkout>/publication/site_builder` — that suffix is a fact about the repository, so it is derived; the checkout is a fact about the host, so it is declared. **Never inferred** — see below. |
| `engine.bun_bin` | yes | The PINNED bun binary, absolute. The unit's `ExecStart=`. Never a bare `bun`: PATH is shared between instances and a stray `bun upgrade` must not be able to change a museum's production runtime. |
| `web.server` | no | `nginx` or `apache`: which vhost renderer. Absent means the layout's default. |
| `web.group` | yes | The web server's runtime group. Sole use: the GROUP OWNER of every webspace and of `preprod.htpasswd`. **Never defaulted** — see below. |
| `publication_api.url` | yes | THIS museum's read-only Publication API v2. Per instance because each museum publishes its own data; frozen into a site at scaffold time (§10, residual 3). |
| `publication_api.key_path` | no | The ABSOLUTE PATH of a root-owned 0600 file. Never the key. |
| `identity.user` / `identity.group` | no | An ADOPTED unix identity. Absent is the normal and safer case — see §2.2. |
| `paths.config_base` / `state_base` / `runtime_base` / `unit_dir` / `vhost_dir` | no | The host's BASES. `state_base` moves the three state roots together. |
| `paths.vhost_enabled_dir` | no | Where the web server READS its vhosts — Debian's `sites-enabled/` by default. State it EQUAL to `vhost_dir` on a host whose web server includes that directory wholesale (RHEL's `conf.d/`): the provisioner then plans no enabling link, because writing the file is what enables it. |
| `roots.workspaces` / `roots.home` / `roots.audit` | no | ONE state root each, for a host that already keeps one somewhere else. |
| `webspace_base` | no | Where webspaces live. Default is the layout's. |
| `sites[].slug` | yes | Instance-LOCAL (§2.2), matching `SLUG_PATTERN`. |
| `sites[].domain` | yes | The production domain. Owns a webspace. |
| `sites[].webspace` | no | Pins this site's webspace; otherwise `<webspace_base>/<domain>`. |
| `serving.preprod.enabled` | yes | A security switch, so it has no default: the file says the draft surface is served or it says it is not. |
| `serving.preprod.host_prefix` | no | The label prepended to a site's domain for its draft vhost (`pre`). |
| `serving.preprod.auth.mode` | yes | `htpasswd` or `none`. A security switch: no default. |
| `serving.preprod.auth.realm` | no | Rendered INSIDE QUOTES in a root-owned web-server config, so it is a constrained string (§2.4). |
| `serving.preprod.auth.htpasswd` | no | Pins the password file; otherwise one per instance beside the declaration. |
| `serving.preprod.auth.users[]` | no | `name` plus `password_file` — a PATH to a root-owned 0600 file, never a password. |
| `serving.prod.tls.mode` | yes | `letsencrypt`, `files` or `none`. Required including the choice not to terminate here: an absent block would have to mean either "no TLS" or "TLS elsewhere". |
| `serving.prod.tls.certificate` / `key` | with `files` | Paths. Refused when the mode would ignore them. |
| `serving.prod.tls.account_email` | with `letsencrypt` | The ACME address that receives expiry warnings. A constrained string (§2.4). |
| `serving.aliases` | no | Extra hostname → the SLUG that owns it. A map and not a list, because an alias with no target cannot become a vhost. |
| `agent.driver` | yes | Default driver for this instance's sites. |
| `agent.bins` | yes for the selected driver | Driver → ABSOLUTE path. Never a bare command name: PATH is shared between instances. |
| `secrets` | no | Credential KEY → the ABSOLUTE PATH of a 0600 file. NAMES and PATHS only; each becomes one `LoadCredential=`. |
| `limits.*` | no | Per-instance caps. **Optional with NO defaults** — see §2.5. |
| `resources.*` | no | `memory_max`, `memory_high`, `cpu_quota`, `tasks_max`, rendered into the unit. Absent means the host's default. |

**Why `web.group` and `engine.group` are required and never guessed.** Those two names
belong to the HOST, not to this convention: the web server's group is `www-data` on Debian
and `nginx` or `apache` elsewhere, and the engine's group is whatever that install's unit
was given (the engine's own unit refuses to guess it too — it ships a `DEDALO_USER`
placeholder). A guessed group is not a cosmetic default. It is a 0640 htpasswd the web
server cannot read and a 0660 socket the engine cannot open, discovered at the first
request instead of at provisioning time.

**Why the daemon's own code and runtime are declared and never inferred.** They were
inferred, until 2026-08-30, from `engine.private_dir` by a "canonical 1:1 topology" —
`<parent>/master_dedalo/publication/site_builder` and `<parent>/.bun/bin/bun`, as siblings
of `private/`. That is a convention this project has seen on its own hosts, not a fact about
anybody else's: a museum whose tree is laid out otherwise got a unit whose
`WorkingDirectory=` named a directory nobody had created, whose `AssertPathIsDirectory=`
then refused to start it — and whose own header told the operator to state
`engine.checkout_dir`, a field the schema refused as unknown. A guess dressed as a
derivation is worse than a required field, because it is a required field nobody knows they
have to get right. The `Assert*` lines stay: a DECLARED path can be wrong too, and a refusal
at `systemctl start` naming the missing path beats systemd's bare `status=203/EXEC`.

**Why a site's DOMAIN is declared while its CONTENT is not.** A domain is an operator
fact — DNS, a certificate, a vhost, sometimes a contract. It cannot be conjured by an API
call, so it is declared, and the vhost that serves it is generated from the declaration.
Everything INSIDE a site — the workspace, the agent turns, the builds, the releases — is
runtime and is never written here. A `POST /v1/sites` for an undeclared slug is refused:
there would be nowhere to serve it, and a site the museum cannot see is not a site.

### 2.2 Naming arithmetic (settled)

```
INSTANCE_PATTERN = ^[a-z][a-z0-9-]{1,18}$
```

The service user is `<USER_PREFIX><instance>`, where `USER_PREFIX` is `dedalo-site-`.

**The rule is an INEQUALITY, and it is asserted in code, not stated here as a number.**
`layout.ts` refuses to load unless

```
USER_PREFIX.length + MAX_INSTANCE_LENGTH <= 32
```

— the 32 being the Linux user-name ceiling `useradd` enforces. The upper bound on an
instance name is therefore not a taste judgement and must not be relaxed without moving
the prefix: a longer name produces a user name `useradd` refuses, on the museum's host, at
provisioning time, complaining about a string nobody wrote down.

The arithmetic is stated as an inequality on purpose. Two earlier written statements of
this same rule put the prefix at thirteen characters (it is twelve) and concluded that the
sum was exactly the ceiling. Both were wrong in the same direction and neither was
checkable, because a prose sentence carrying a subtraction has no way to fail. The
assertion in `layout.ts` cannot be wrong about the prefix's length, and cannot drift when
the prefix changes; this document quotes the pattern and the relation, and no arithmetic
result appears in it as a literal.

**The identity is DERIVED, and an override is the exception.** `identity.user` /
`identity.group` exist for one reason: a museum already running under a hand-made user
must be describable in THIS vocabulary rather than through a second code path — an adopted
install the provisioner cannot express is an adopted install that keeps its hand-written
unit forever. The derived form is nevertheless the safe one, and stays the default:
derived names cannot collide (two instances declaring the same user is not a naming
mistake but a silent un-isolation — one museum's agent turn running as the user that owns
another's tree), and derived names cannot escape the inequality above. So `derive()`
enforces on an overridden identity exactly what the derived form gave for free: both names
must match the unix grammar AND stay within the ceiling, refused at the declaration rather
than at `usermod` time, halfway through a run.

A **slug** is unchanged (`src/util/slug.ts`, `^[a-z][a-z0-9-]{1,39}$`) and stays
**instance-local**: two museums may both own the slug `coleccion`, and nothing anywhere
concatenates instance and slug into an OS identity, so nothing has to arbitrate that. The
generated vhost FILENAME does carry both (`<USER_PREFIX><instance>-<slug>.conf`), because
two museums' `coleccion` vhosts in one `sites-available` would be one museum silently
serving the other's document root.

### 2.3 The derived layout

Every name and path below is a pure function of the declaration. Nothing in this table is
ever typed by an operator, and nothing in it appears twice in the tree (§4).

`layout.ts` exposes **one function**, `derive()`, returning one frozen object; the
"Accessor" column is the expression that produces each value, on

```ts
const layout = derive(parseManifest(instanceJson));
```

Example values are for `instance = museum-a`, `sites[n]` = `{ slug: 'coleccion', domain:
'www.museum-a.org' }`, with every path left to its default.

| Derived thing | Accessor | Value for the example |
|---|---|---|
| Instance name (echoed) | `layout.instance` | `museum-a` |
| Description | `layout.description` | the declared line, or `''` |
| Web server flavour | `layout.webServer` | `nginx` |
| Service user | `layout.identity.user` | `dedalo-site-museum-a` |
| Service group | `layout.identity.group` | `dedalo-site-museum-a` |
| Web server's group | `layout.identity.webGroup` | the declared `web.group` |
| Engine's group | `layout.identity.engineGroup` | the declared `engine.group` |
| systemd unit name | `layout.unitName` | `dedalo-site-builder@museum-a.service` |
| Unit file | `layout.unitPath` | `/etc/systemd/system/dedalo-site-builder@museum-a.service` |
| Declaration dir | `layout.configDir` | `/etc/dedalo_sites/instances/museum-a` |
| Manifest | `layout.manifestPath` | `…/museum-a/instance.json` |
| Site table (generated) | `layout.siteTablePath` | `…/museum-a/sites.json` |
| Secrets dir | `layout.secretsDir` | `…/museum-a/secrets` |
| Secret file | `layout.secretPath('ANTHROPIC_API_KEY')` | `…/museum-a/secrets/ANTHROPIC_API_KEY` |
| Declared credentials | `layout.secrets` | `{ ANTHROPIC_API_KEY: '…' }` — key → declared file |
| Preprod htpasswd | `layout.htpasswd` | `…/museum-a/preprod.htpasswd` |
| Preprod realm | `layout.preprodRealm` | `Dedalo preprod` |
| Rendered env | `layout.envFile` | `…/museum-a/env` |
| Rendered env CONTENTS | `layout.envVars` | `SITES_ROOT`, `AGENT_HOME`, `AUDIT_DIR`, `WEBSPACE_BASE`, `SITE_TABLE_FILE`, `PUBLICATION_API_URL`, … |
| Engine pairing fragment | `layout.engineFragment` | `…/museum-a/engine.env.fragment` |
| State dir (root-owned) | `layout.stateDir` | `/var/lib/dedalo_sites/museum-a` |
| Workspaces (`SITES_ROOT`) | `layout.roots.workspaces` | `…/museum-a/workspaces` |
| Agent HOME (`AGENT_HOME`) | `layout.roots.home` | `…/museum-a/home` |
| Audit dir (`AUDIT_DIR`) | `layout.roots.audit` | `…/museum-a/audit` |
| Audit file | `layout.auditFile` | `…/museum-a/audit/audit.jsonl` |
| systemd `RuntimeDirectory=` | `layout.runtimeDirectory` | `dedalo-sites/museum-a` |
| Runtime dir | `layout.runtimeDir` | `/run/dedalo-sites/museum-a` |
| Socket | `layout.socketPath` | `/run/dedalo-sites/museum-a/daemon.sock` |
| Webspace base (`WEBSPACE_BASE`) | `layout.webspaceBase` | `/home/www` |
| Vhost dir | `layout.vhostDir` | `/etc/nginx/sites-available` |
| Enabled-vhost dir | `layout.vhostEnabledDir` | `/etc/nginx/sites-enabled` |
| Webspace | `layout.sites[n].webspace` | `/home/www/www.museum-a.org` |
| Preprod domain | `layout.sites[n].preprodDomain` | `pre.www.museum-a.org` |
| Release store | `layout.sites[n].releasesDir('prod')` | `…/www.museum-a.org/.releases/web` |
| Served link | `layout.sites[n].linkPath('preprod')` | `…/www.museum-a.org/pre` |
| Prod vhost | `layout.sites[n].vhostPaths.prod` | `/etc/nginx/sites-available/dedalo-site-museum-a-coleccion.conf` |
| Preprod vhost | `layout.sites[n].vhostPaths.preprod` | same directory, `-coleccion-pre.conf` |
| Prod vhost, ENABLED | `layout.sites[n].vhostEnabledPaths.prod` | `/etc/nginx/sites-enabled/dedalo-site-museum-a-coleccion.conf` |
| Preprod vhost, ENABLED | `layout.sites[n].vhostEnabledPaths.preprod` | same directory, `-coleccion-pre.conf` |
| Serving declaration (echoed) | `layout.serving` | so a vhost renderer reads ONE object |
| Resource caps (echoed) | `layout.resources` | rendered into the unit |
| Engine private dir | `layout.enginePrivateDir` | asserted disjoint from everything above |
| Engine checkout | `layout.daemon.checkoutDir` | the declared `engine.checkout_dir` |
| Daemon `WorkingDirectory=` | `layout.daemon.workingDirectory` | `…/master_dedalo/publication/site_builder` |
| Pinned bun (`ExecStart=`) | `layout.daemon.bun` | the declared `engine.bun_bin` |
| The unit's `ReadWritePaths=` | `readWritePaths(layout)` | the three roots + the runtime dir + EVERY site webspace |

**One unit per INSTANCE, two vhosts per SITE.** The two artifacts have different natural
grains and the layout follows each rather than forcing one. `ReadWritePaths=` has to name
THIS museum's webspaces, which are per-site, so a `…@.service` template could not express
it and would need a drop-in kept in step with it; an explicit instance unit is complete on
its own. A vhost, conversely, carries one `server_name`, one document root and one TLS
block, so one file per site per surface is the only shape that is not a compromise.

**The rendered `env` replaces the daemon's hand-written `.env`,** and the surface roots
moved with it: `SITES_ROOT` is instance-scoped, `AGENT_HOME`, `AUDIT_DIR` and
`WEBSPACE_BASE` joined the census, and `PREPROD_ROOT`/`PROD_ROOT` are DELETED — a surface
is per-site, inside that site's webspace (§6). So are `PREPROD_BASE_URL`/`PROD_BASE_URL`:
an instance-wide base URL could only ever be one site's on a host that serves each site at
its own domain. What replaced them is two host facts the declaration owns and the daemon
cannot derive — `PREPROD_HOST_PREFIX` (from `serving.preprod.host_prefix`) and
`PROD_URL_SCHEME` (`http` when `serving.prod.tls.mode` is `none`, else `https`) — which a
site's own domain completes into a URL.
`SITE_TABLE_FILE` joined the census on 2026-08-29: the daemon is TOLD where every site of
this instance lives (`<config dir>/sites.json`, §4) instead of computing a placement from
`WEBSPACE_BASE`, which disagreed with the vhosts for any site using `sites[].webspace`.
`publication/site_builder/tests/seam_tripwire.test.ts` lists the current root names, so the
suite's one root-knowing module keeps holding across each move instead of quietly ceasing
to mean anything.

### 2.4 Every string that reaches a rendered artifact is constrained

A domain was always checked, because it lands verbatim in a `server_name`. The realm, the
ACME address, the API base URL and the description are the same class of string and are
now checked the same way: they are rendered VERBATIM into a root-owned web-server config,
a systemd unit or a generated header comment.

The realm is the sharp one. It is rendered INSIDE double quotes (`auth_basic "…";`,
`AuthName "…"`), so an unconstrained realm can close its own quote and open a `location`
block of the declaration author's choosing, in a file nginx reads as root. The grammars
are therefore ALLOWLISTS and the values are REFUSED rather than escaped — escaping is a
per-renderer property two renderers would have to agree on forever, while a grammar is a
property of the value itself. They live in `layout.ts` beside the domain grammar
(`REALM_PATTERN`, `EMAIL_PATTERN`, `API_URL_PATTERN`, `DESCRIPTION_PATTERN`), and the
schema imports them.

### 2.5 `limits` has no defaults, on purpose

The seven `limits.*` fields are the same quantities as `src/config.ts`'s `MAX_SITES`,
`SESSION_TURN_TIMEOUT_MS` and the rest. They are optional here **and carry no default**,
and only a STATED limit is rendered into the instance's env.

A default in the declaration grammar would silently shadow `config.ts`'s. Every rendered
env would then state today's value explicitly, and on the day somebody changed the
daemon's default nothing would move on any museum — the owner would have stopped owning it
without any file saying so. An absent limit is absent from the env, and the daemon applies
its own; the field-name → env-key map (`LIMIT_ENV`) lives in `layout.ts`, so the census
cannot drift from the rendering.


## 3. The uid / gid / mode matrix — a gated contract

This table is the contract, not an illustration. The provisioner sets exactly these
owners and modes and re-asserts them on every run; `MODES` in
`publication/site_builder/src/provision/layout.ts` is its executable copy, and the gate
reads both and demands they agree, row for row and in both directions (§11). `<i>` is the
instance, `SU`/`SG` the service user/group, `WG` the declared `web.group`, `EG` the
declared `engine.group`.

Every row carries an owner AND a group AND a mode, because **a mode without an owner is
not a permission**: `0750` reads as "the daemon may write here" or "the daemon may NOT
write here" depending entirely on who owns the directory, and those two readings were, for
a while, written in two different files about the same path.

`/etc/dedalo_sites/` and `/etc/dedalo_sites/instances/` are ordinary root-owned 0755
directories that nothing derives, so they carry no row; `…/<i>/instance.json` is 0644
root:root and is the ONE hand-written file.

| Path | `MODES` key | Owner | Group | Mode | May read | May write |
|---|---|---|---|---|---|---|
| `/etc/dedalo_sites/instances/<i>/` | `configDir` | root | root | `0755` | anyone (traverse) | root |
| `…/<i>/secrets/` | `secretsDir` | root | root | `0700` | root | root |
| `…/<i>/secrets/<KEY>` | `secret` | root | root | `0600` | root, and the service process per turn via `$CREDENTIALS_DIRECTORY` | root |
| `…/<i>/env` | `envFile` | root | SG | `0640` | SG (the daemon) | provisioner (generated, secret-free) |
| `…/<i>/sites.json` | `siteTable` | root | root | `0644` | anyone (the daemon reads it) | provisioner (generated) |
| `…/<i>/preprod.htpasswd` | `htpasswd` | root | WG | `0640` | the web server | provisioner |
| `…/<i>/engine.env.fragment` | `engineFragment` | root | EG | `0640` | the paired engine's operator | provisioner |
| the unit, and the two vhosts per site | `hostConfig` | root | root | `0644` | anyone | provisioner |
| `/var/lib/dedalo_sites/<i>/` | `stateDir` | root | root | `0755` | anyone (traverse) | root only |
| `…/<i>/workspaces/` | `workspaces` | SU | SG | `0750` | SG | SU (the daemon AND its agent children) |
| `…/<i>/home/` | `home` | SU | SG | `0700` | SU only | SU |
| `…/<i>/audit/` | `auditDir` | root | SG | `0750` | SG | root only |
| `…/<i>/audit/audit.jsonl` | `auditFile` | SU | SG | `0640` | SG | SU (append) |
| `/run/dedalo-sites/<i>/` | `runtimeDir` | SU | SG | `0750` | SG | SU |
| `…/<i>/daemon.sock` | `socket` | SU | EG | `0660` | EG | EG |
| `/home/www/<domain>/` | `webspace` | SU | WG | `2750` | the web server | SU |
| `…/<domain>/.releases/` | `releases` | SU | WG | `2750` | the web server | SU |
| `…/<domain>/{pre,web}` | *(symlinks)* | SU | WG | — | the web server | SU |

Read the design out of five of those rows:

- **`workspaces/` is the SERVICE USER's, 0750.** The daemon `mkdir`s a site workspace, so
  a root-owned workspaces root makes creating a site a permission error. The property
  "the daemon cannot replace its own roots" is kept by the row above it instead:
  `stateDir` is root-owned 0755, so the daemon writes INSIDE its roots and can neither
  create, move nor replace one.
- **`home/` is 0700.** The agent's HOME holds `~/.claude` — session state, caches,
  whatever the vendor CLI decides to keep. Not even the instance group sees it.
- **`audit/` is root-owned 0750, and the FILE is the daemon's 0640.** Append-only is
  otherwise a convention (`src/audit.ts` says so honestly: "enforced by convention here,
  not by the filesystem"). Unlink and rename are permissions on the DIRECTORY, so a
  root-owned directory holding a service-user-owned file means the daemon can append to
  the log and cannot delete it, truncate it away or replace it — which is the property an
  audit trail actually needs. The provisioner therefore CREATES the file and chowns it (a
  root-owned directory the daemon cannot create a file in would mean no log at all), and
  **rotation is the provisioner's job for the same reason**: the daemon cannot rename its
  own log, and must not be able to.
- **The socket is 0660 `SU`:`EG` — the ENGINE's group, and NOTHING JOINS ANYTHING.**
  Group-owning the socket with the engine's own group gives the engine reachability with
  no group membership at all. That is the same argument this document already wins with
  for the web server, applied to the other side of the pairing: a `usermod -aG` in a
  provisioning script hands its target read access to everything else that group owns, to
  solve a problem group OWNERSHIP solves without any of that. There is no step anywhere in
  this design that adds a user to a group.
- **The webspace and its release store are SETGID (2750), group `WG`.** Three things
  follow. The web server reads the served trees WITHOUT joining any instance group.
  `setgid` makes every release directory the daemon creates inherit `WG`; without it a new
  release would carry the daemon's primary group and the web server would 403 on a site
  that published successfully. And the closed world bits are load-bearing: at 0755 every
  museum's UNPUBLISHED preprod tree would be readable by every uid on the host, another
  museum's service user included, which is precisely the boundary this design exists to
  draw. The unit's `UMask=0027` keeps the group READ bit while denying everyone else.

**Which web-server user needs which group, stated plainly:** none. `www-data` (Debian) or
`nginx` (RHEL) is added to NO instance group. It reads what it must because it is the
group owner of the webspaces and of `preprod.htpasswd`. The
`usermod -aG dedalo-sites www-data` the retired `install.sh` performed (its §2) was exactly
the shape this replaced: it handed the web server read access to every workspace — git history, `node_modules`, the
agent's tree, `.builder/` — to solve a problem that group ownership on the served tree
solves without any of that. **The paired engine's user needs no group either**, for the
identical reason and by the identical mechanism.

**Credentials never reach the process through the environment.** Provider keys live only
in `secrets/<KEY>` (0600 root:root) and are delivered by systemd `LoadCredential=`, so the
key material exists for the process under `$CREDENTIALS_DIRECTORY` and is absent from the
rendered `env`, from `/proc/<pid>/environ`, from the unit file and from any file the
service user could read on its own. The daemon reads the file and hands the value to the
driver child (`src/util/spawn.ts` constructs a child environment rather than inheriting
one; the drivers allowlist what they forward). `publication_api.key_path` is delivered the
same way — the rendered env carries `PUBLICATION_API_KEY_FILE`, a PATH, never a value. The
rendered `env` being SECRET-FREE is therefore not a courtesy: it is what makes it safe for
that file to be group-readable by the service user at all.

**The `LoadCredential=` set is `credentialSources(layout)`, not the declaration's
`secrets`.** Two of the credentials a daemon needs are never declared: the shared bearer,
which the provisioner MINTS at `secrets/SERVICE_TOKEN` and the pairing fragment quotes to
the operator, and `publication_api.key_path`, which is declared as a PATH into a 0600
root:root file inside a 0700 directory — a file the service user cannot open, so naming the
path in the env accomplishes nothing on its own. Rendering the unit's credential block from
`secrets` alone produced a fully converged host — every file present, every mode correct,
`provision check` clean — whose daemon exited at boot for want of the one credential the
same provisioner had just created for it. One map now feeds the unit's `LoadCredential=`
lines, the plan's credential files and the fragment's `cat` instruction, so the file that is
minted, the file that is loaded and the file an operator is told to read cannot be three
different files.

**And the daemon BUILDS its configuration rather than reading the ambient environment.**
`src/config.ts` parses the named env file, merges a short ambient allowlist
(`DEDALO_SITE_INSTANCE`, `NODE_ENV`, `LOG_LEVEL`), then layers `$CREDENTIALS_DIRECTORY` on
top — the credential wins, because it is the only one of the three layers a service user
cannot have written. An unknown key in that source is a NAMED boot refusal, not a silent
no-op: a generated env file carrying a key nothing reads is either a renderer inventing a
knob or a daemon that dropped one, and both take effect nowhere while every file on disk
looks correct. The instance name is the one ambient key that may also appear in the file,
and a DISAGREEMENT between the two is refused rather than resolved by precedence — the unit
stating it last would otherwise win silently while the ROOTS the daemon writes to came out
of the same stale file.


## 4. The generated-artifact law

**No deployment fact is stated twice.** It is stated in `instance.json`, and every host
artifact that needs it is RENDERED from there by a pure function. The precedent is
`src/core/media/protection.ts`: pure builders, a hash embedded in the artifact, a write
that happens only on drift, and a read-only status call the operator can ask.

Rendered artifacts, all of them, per instance:

| Artifact | Replaced (deleted 2026-08-29, Phase 2) |
|---|---|
| one `/etc/systemd/system/dedalo-site-builder@<i>.service` per INSTANCE (an explicit instance unit, not a template plus a drop-in — see §2.3) | `deploy/dedalo-site-builder.service` |
| `…/instances/<i>/env` | `sample.env` (and the hand-copied `.env`) |
| `…/instances/<i>/engine.env.fragment` | the two lines `install.sh` prints and asks an operator to retype |
| `…/instances/<i>/preprod.htpasswd` | `install.sh` §5 |
| one prod vhost + one preprod vhost per SITE, **and the symlink that enables each of them** | `nginx/dedalo_sites_prod.conf`, `nginx/dedalo_sites_preprod.conf`, `apache/dedalo_sites.conf`, and `install.sh`'s §8 checklist item 3 ("copy … into /etc/nginx/sites-available/ … then nginx -t && systemctl reload nginx") |
| users, groups, roots, modes, markers | `install.sh` §2 |

`install.sh`, `deploy/dedalo-site-builder.service`, `nginx/*.conf`, `apache/*.conf` and
`sample.env` ARE DELETED — Phase 2, 2026-08-29, in the commit that landed the renderers, and
kept deleted by a gate (`tests/provision_examples.test.ts`) rather than by anyone
remembering. Their text is pure functions now. What that killed, concretely — every one of
these WAS in the tree, and the line numbers are the retired files' own:

1. **Identity was hardcoded TWICE with no templating.** `install.sh:13-14` set
   `SERVICE_USER`/`SERVICE_GROUP` and `deploy/dedalo-site-builder.service:23-24` set
   `User=`/`Group=`, and the installer copied the unit **verbatim** (`install -m 644`).
   Worse, the two shell assignments used a plain `=` while the roots beside them used
   `${VAR:-default}` — so the identity was silently NON-overridable and looked overridable.
   Now: `layout.identity` is derived from the instance name, and the unit renderer reads it
   from there.
2. **`ReadWritePaths=` did not follow the roots.** The unit hardcoded
   `/var/lib/dedalo_sites /var/www/dedalo_sites` under `ProtectSystem=strict` while
   `install.sh` accepted `SITES_ROOT`/`PREPROD_ROOT`/`PROD_ROOT` overrides. Override a root
   and the install SUCCEEDED; the daemon died later, at publish time, on a read-only
   filesystem. Now: the directive is `readWritePaths(layout)`, one line per entry, and a
   hand-written list is refused by that renderer's gate.
3. **`useradd --system --create-home` with no `--user-group`** left group creation to
   distro policy while the unit hard-required `Group=dedalo-sites`. The engine's own unit
   documents the same trap (`deploy/dedalo-ts.service:45-51`).
4. **One shared `/etc/dedalo_sites/preprod.htpasswd` for every museum's drafts** — one
   password, and every museum's unpublished work behind it. Now: `layout.htpasswd` is per
   instance, and both vhost renderers read it from the layout.
5. **The Apache preprod vhost's basic auth did not authenticate anything.**
   `apache/dedalo_sites.conf:19-21` put `Require all granted` in the same `<Directory>` as
   `AuthType Basic` + `Require valid-user`; httpd 2.4 wraps a section's `Require`
   directives in an implicit `<RequireAny>`, so access was granted when EITHER succeeded.
   Every museum's drafts were public to anyone who knew the hostname, and the file read as
   though it protected them. Found while porting the text into `apache.ts`, which is the
   argument for this whole move in one line: the defect was four years old, in plain sight,
   in a file nothing could test.

The mechanics:

- **Every artifact's FIRST LINE is its stamp**, in the artifact's own comment syntax:

  ```
  # dedalo-provision: <instance> <kind> <sha256 of everything below this line>
  # GENERATED by publication/site_builder/src/provision/render/<module>.ts — do NOT edit.
  ```

  The second line is ordinary prose inside the hashed body — it names the module so an
  operator holding a drifted file knows where to look — and only the FIRST line is the
  stamp.

  Three fields and no more, because every one of them is load-bearing: the INSTANCE, so a
  file belonging to another museum is refused rather than overwritten; the KIND, so a
  stamped file found on a host names the module in `src/provision/render/` that produced it
  (which is why the two vhost kinds are `nginx_vhost` and `apache_vhost` and not one
  `vhost` — on a host whose web server changed, that is exactly the moment the file must
  say who wrote it); and the HASH.

  Deliberately a hash of the RENDERED BODY, not of the inputs as in `protection.ts`: the
  artifact set here is heterogeneous and hand-editable, and an input hash cannot see a hand
  edit at all. `src/provision/hash.ts` owns `stamp()` / `parseStamp()` / `bodyHash()`, and
  `artifact()` in `render/types.ts` is the only constructor of an artifact, so a renderer
  cannot forget to stamp and cannot invent a different shape. `renderAll()` re-reads the
  stamp back off every artifact it returns, which closes the same door from the other side.
- **A run writes only on drift.** Body hash matches → nothing is written, nothing is
  touched, and the run is a no-op that can be scheduled.
- **A hand edit is DRIFT and is reported, never silently kept.** `--check` renders without
  writing, prints every artifact whose body no longer matches its header, and exits
  non-zero; a normal run re-renders it and SAYS SO by name. The fix for a wanted hand edit
  is to change `instance.json` and re-run — never to keep the edit, because an artifact
  that survives a re-render is a second source of truth that will be silently reverted on
  the day nobody is watching.
- **An artifact with no header at all is drift too** (someone replaced the file wholesale),
  and so is a header naming another instance.
- **The provisioner is idempotent and orderable**: identities → roots and modes → markers
  → secrets → rendered files → `daemon-reload` → **enable each vhost** → vhost validate →
  reload. A failure at any step leaves the previous state intact and names the step.
- **A RENDERED VHOST IS NOT A SERVED VHOST, and the difference is a symlink.** Debian's two
  directories are not a filing habit: `sites-available/` is a library and `sites-enabled/`
  is the configuration, and nothing in the first is read until a link in the second names it
  (`a2ensite` is that `ln -s` and nothing more). Until 2026-08-30 this provisioner wrote the
  first and no action anywhere made the link, so a fully converged, fully green provision
  served NOTHING — and no gate could see it, because every artifact the subsystem knew about
  was in place. The link is now a planned action per vhost, derived from
  `paths.vhost_enabled_dir` (§2.1), placed in the `web` phase between the artifact writes
  and the configtest that gates the reload, and `provision remove` unlinks it BEFORE it
  unlinks the vhost — a dangling include is a configtest failure for every museum on the
  host. A host whose web server reads its vhost directory directly (RHEL's `conf.d/`) says
  so by declaring the two directories as one, and no link is planned.
- **A VHOST WHOSE SITE HAS BEEN UNDECLARED IS REPORTED, never removed.** Dropping a site
  from `sites[]` leaves its vhosts, its enabling links and its webspace exactly where they
  are, so the site stays on the internet while every signal says it is gone. `plan.ts`'s
  `orphanedVhosts()` lists the two vhost directories, matches this instance's own generated
  prefix, and names every file no declared site would produce; `check` counts it as drift
  and `apply` exits non-zero on it. It is read off the DIRECTORIES rather than out of the
  previous site table, which the same run rewrites — a memory kept there would last exactly
  one run and then agree that nothing was wrong.

### 4.3 The rendered output is COMMITTED, and gated

Deleting six hand-written files cost something real, and it is worth naming rather than
celebrating the deletion. A hand-written config is READABLE: an operator opened
`nginx/dedalo_sites_prod.conf` and saw, on one screen, what would land on the host. A pure
function is not readable in that way — nobody diffs a function against the box in front of
them.

So the complete rendered output of the ONE committed declaration is committed beside it:

| Path | What |
|---|---|
| `deploy/examples/instance.example.json` | the reference declaration — generic, never a real museum's name, the same law as the engine's generic `test` TLD |
| `deploy/examples/rendered/` | `renderAll(derive(parseManifest(…)))` on that declaration, in a tree that MIRRORS the host: `rendered/etc/…` is `/etc/…` |
| `deploy/examples/rendered-apache/` | the same declaration with `web.server` flipped to `apache` — the one field an httpd host changes |
| `deploy/examples/rendered.index` | the census: artifact → host path, owner, group, mode. The one fact a checked-out file cannot carry, and here it is the isolation model |

`publication/site_builder/tests/provision_examples.test.ts` re-renders the declaration and
byte-compares every committed file, **in both directions**: an artifact with no committed
example is a file landing on a museum's host that nobody documented, and a committed
example no renderer produces is `sample.env` again — a file everybody trusted, that nothing
produced and nothing checked. The same gate keeps the six retired files retired, and refuses
any prose in the package that still tells an operator to run or copy one of them, because a
dangling instruction is worse than the installer was: the installer at least did something.

The examples are regenerated, never edited
(`UPDATE_EXAMPLES=1 bun test ./tests/provision_examples.test.ts`, a run that writes and then
fails on purpose so a stray environment variable cannot turn the gate green by rewriting
what it checks).

**Why a second tree rather than a second declaration.** `apache/dedalo_sites.conf` was the
only Apache documentation this subsystem had; deleting it with nothing in its place would
have left every httpd operator with no example and the Apache renderer's bytes undocumented.
A second `instance.apache.json` would have been a second declaration to keep in step — the
defect. The variant is therefore COMPUTED by the gate from the one committed declaration,
and what the flip changes is itself asserted: the vhosts, and one line of `env`
(`DEPLOYMENT_MODE`). The unit and the pairing fragment are byte-identical across the two
trees, so the duplication there is three files a gate holds identical rather than three
files a person keeps in step.

## 5. The marker law

**A root that does not declare itself is refused, loudly, with nothing written.**

Each root carries `.dedalo_site_instance`, whose entire content is the instance name and a
newline — so the check is a string compare and not a parse, and a root naming ANOTHER
instance is exactly as refusable as a root naming none. The provisioner plants the marker
when it creates the root; the daemon only ever reads it, at boot, before it listens.

Refusal semantics. The two sides are NOT symmetrical, and the asymmetry is the law:
**the provisioner and the suite may plant a marker; the daemon may only read one.**

For the provisioner (`plan.ts`, the tree phase) and the fixture (`resetInstance`):

- Root missing → created and marked (provisioner) / adopted (fixture).
- Root exists, marker names this instance → proceed.
- Root exists, EMPTY, no marker → adopted and marked. There is nothing there to lose, and
  refusing would only punish a clean host.
- Root exists, non-empty, marker missing or naming another instance → **refuse**. Nothing
  is planned, nothing is written, and the message names the root, what it found and what it
  expected.

For the daemon (`src/instance/roots.ts::assertInstanceRoots`), every state of the world but
one is a refusal: the root exists AND carries a marker naming this instance, or the process
does not start. An empty unmarked root is refused here even though the provisioner would
adopt it, because a daemon that planted what was missing would be asserting only that it can
write — the marker would be one this process invented, about a directory nobody had claimed.
On a provisioned host the marker is always there: the provisioner plants it immediately
after each root's own `mkdir`, before the root is filled.

This is the same law as the engine's `dedalo_test_marker` row and its `.dedalo_test_media`
file, for the same reason: **a path is a claim; a marker is the directory itself saying
whose it is.** A root arrives as an ordinary string in an ordinary file. Between a
mistyped `WEBSPACE_BASE` and another museum's live site tree there must be something more
than the typo's own correctness — and on this subsystem the operations behind that string
include `rm -rf` (`tests/fixtures/instance.ts::resetInstance`) and a recursive copy over a
served tree.

The suite already implements exactly this shape (`tests/fixture_guard.test.ts`), including
the two properties worth stating: every root is checked BEFORE any root is destroyed, so a
bad last root cannot leave the earlier ones already wiped; and a reset leaves every root
marked, so the instance stays bootable rather than merely empty.

### 5.1 The boot preflight — what the daemon proves before it writes

The marker check is one of five, and they run as the FIRST STATEMENT of `src/index.ts`,
above the top-level `await sweepOnBoot()`. That placement is load-bearing rather than tidy:
the session sweep WRITES at module evaluation — it commits recovered work and rewrites
session metadata — so a check that ran "before the first request" would already have let a
misconfigured daemon touch whatever tree it was pointed at. The ordering is gated as a
source-order assertion anchored on `sweepOnBoot`, never on `Bun.serve`, because the serve
call is not the first write.

| Check | Refuses |
|---|---|
| `assertNoLegacyEnv` | a credential-shaped key in the env file wherever credentials exist (the law of §3 enforced from the READER's end, not only the renderer's), and a leftover per-checkout `.env` on a provisioned host |
| `assertInstanceRoots` | a root that is missing, unmarked, or marked for another instance |
| `assertRunningAs` | uid 0, and a root the running uid does not own — identity proved by OWNERSHIP, because the expected user NAME is machine-specific and could never be committed to a suite |
| `assertRootsWritable` | a root this process cannot write, by create-and-unlink — or, for the root-owned audit directory, by appending to the file the provisioner created |
| `assertAgentBinaries` | a driver binary that is not absolute (a name resolved off `PATH`, which is what a compromised turn can influence), one that is group- or world-writable, and — on a production run — one that is not root-owned |

The write probe is the one that pays for itself. Under `ProtectSystem=strict` a root the
unit's `ReadWritePaths=` omits is mounted READ-ONLY, and that is not an install failure: it
is EROFS the first time that museum publishes, at night, on a live site. Probing at boot
converts it into a refusal that names the root, which systemd reports and an operator can
act on before anyone is looking at a broken page.

## 6. The webspace, and the hard rule

One site, one webspace, named by its production domain:

```
/home/www/www.museum-a.org/
    .releases/
        pre/<release>/        immutable copies, NEVER served directly
        web/<release>/        immutable copies, NEVER served directly
    pre  -> .releases/pre/<release-id>      the preprod vhost's document root
    web  -> .releases/web/<release-id>      the prod vhost's document root
```

A build promotes into `.releases/pre/<new>` and swaps the `pre` symlink; a publish copies
the current `pre` release into `.releases/web/<new>` and swaps `web`. Both swaps are a
temp-link-plus-`rename`, atomic on one filesystem, so no web-server reload is involved and
a visitor never sees a half-updated site. Release ids are UTC + a monotonic counter, so
they sort lexically and rollback is "point the link at a retained id".

### 6.1 How the DAEMON finds this directory

A surface is a PAIR — a release store and a served link — and every function of
`src/build/promote.ts` takes that pair rather than a root and a slug. The pair is derived
from the site's webspace, and the webspace from the site's DOMAIN, which lives in the
daemon-owned `site.json` and is required when a site is created. Both ends call the same
function (`webspaceFor(webspaceBase, domain)`, `src/provision/layout.ts`), so the directory
the provisioner CREATES and points two vhosts at is the directory the daemon PUBLISHES
into. Before that phase the daemon wrote to `<PREPROD_ROOT>/<slug>` and `<PROD_ROOT>/<slug>`
— trees no generated vhost has ever served.

Four properties hold the pairing together, because a path is still only a claim — a
declared one included:

- **The placement is READ, not derived** (2026-08-29). The provisioner publishes every
  site's webspace, release stores and served links into `<config dir>/sites.json`; the
  daemon looks the site up there by slug and computes none of them. The two sides derived it
  independently until then, and disagreed for every site using `sites[].webspace`.
- **The webspace must declare itself this instance's** (`.dedalo_site_instance`, §5's marker
  law). `WEBSPACE_BASE` is shared by every museum on the host, so a domain mistyped into a
  `site.json` can name somebody else's live site.
- **It must be writable by this process, proved now.** The same write probe the boot
  preflight runs over the state roots: a webspace missing from the unit's `ReadWritePaths=`
  is read-only under `ProtectSystem=strict` and would otherwise fail as EROFS halfway
  through a publish.
- **A site with no row, or whose webspace is absent, is REFUSED by name** — at create, at
  build, at publish and at delete — never published into (nor deleted from) a directory no
  web server reads. The daemon does not create webspaces: a document root is the
  provisioner's to make.

The one shape the daemon cannot follow is a per-site `sites[].webspace` OVERRIDE: it derives
`<webspace_base>/<domain>` and nothing else, so an overridden site is refused with a message
that says so. The override remains for an adopted host's legacy layout, and its cost is
stated here rather than discovered on one.

**HARD RULE: the WORKSPACE root may never live inside a webspace.** `web`, `pre` and
`.releases` are servable and may; the workspace may not, ever, under any layout.

The reason is what a workspace CONTAINS: the git repository (every past revision of the
site, including anything the agent ever pasted into it), the agent's working tree, a
`node_modules` with thousands of files nobody in this project audited, and the daemon's
private `.builder/` state. A webspace is a document root: whatever is under it is one
missing rule away from being a URL. `.git/config`, a `.env` an agent wrote while
experimenting, a build script with a token in a comment — none of that is protected by
being uninteresting. Keeping the two trees apart means the question never has to be
answered by a web-server rule.

Two structural consequences:

- **`.releases` is a SIBLING of `web`/`pre`, never underneath either.** Underneath, the
  served document root would contain every retained release, and a single directory
  listing or a guessed path would serve bytes that were rolled back — including a preprod
  draft from the production host.
- **Every generated vhost denies dotfiles** (`location ~ /\. { deny all; }` / the Apache
  equivalent). `.releases` is already outside the document root, so this is defense in
  depth for the dotfiles a site's own build output might carry.

The vhost follows the served symlink (`disable_symlinks off` / `Options FollowSymLinks`)
and nothing else: the daemon needs no root at runtime, and creating, building, publishing
or rolling back a site needs no reload. A vhost is regenerated only when a site is added,
removed, or renamed — i.e. when `instance.json` changes.

## 7. Why TWO release stores and not one

`.releases/pre/` and `.releases/web/` are separate stores holding separate copies, and
publish stays a COPY (`src/build/publish.ts` — `promoteRelease(surfaces.prod, source)`,
where `source` is the current preprod release directory). Pruning is confined to the store
of the surface being promoted, which under this shape is a different directory from the
other surface's, so preprod's retention cannot reach production's bytes even in principle.

The tempting alternative — one store, with `pre` and `web` as two links into it — saves a
copy and is wrong: **preprod pruning would delete the bytes production is serving.**
Retention (`RELEASES_RETAINED`, default 5) prunes the oldest releases of a surface. Preprod
churns — every agent turn can produce a build — while production changes rarely. Share the
store and the fifth preprod build after a publish prunes the release the `web` link points
at, and the live site 404s from a directory that no longer exists, at a moment nobody
connected to a publish.

Two stores also give the property the publish contract needs anyway: what goes live is
exactly the bytes that were previewed, held independently of the workspace and of preprod,
so deleting a workspace or wiping preprod can never take down a published site.

## 8. Adopting a pre-instance install

A museum that has run a site builder since before this subsystem existed is the one host
this document could not describe: a daemon, a `.env` full of plaintext credentials, a unit
installed under a fixed name, three roots, and LIVE SITES. `provision adopt` turns it into
instance N=1 of the same mechanism.

**It is not a second provisioner.** `src/provision/adopt.ts` INFERS a declaration from what
is on disk and then calls the ordinary `plan()`/`apply()`. It does only the four things
`plan()` structurally cannot, and every one of them is named here so the boundary is
checkable rather than remembered:

1. **Write the declaration.** `plan()` takes a manifest; it cannot invent one.
2. **Claim the roots.** §5 refuses a root that is non-empty and unmarked, which is every
   root of a pre-instance install — so `plan()` could not provision such a host at all.
   Stamping a marker is a statement that a directory belongs to an instance, and it is a
   statement only a human makes: `provision adopt --instance <i>` IS that statement. The
   markers are adoption's own step, sharing `plan.ts`'s `markedRoots()` rather than a second
   list. A root already carrying ANOTHER instance's marker stops the migration dead, and
   there is no flag for it.
3. **Move the credentials.** A plan is printed, so `FileContent` has no source carrying a
   literal secret and must never grow one. `SERVICE_TOKEN`, `ANTHROPIC_API_KEY`,
   `OPENCODE_ENV`, `PI_ENV` and `PUBLICATION_API_KEY` become root-owned `0600` files under
   `secrets/`. The bearer is PRESERVED, never re-minted: the engine is already paired with it.
4. **Retire the old files.** The `.env` is RENAMED to `.env.pre-instance`, never deleted —
   and MADE `root:root 0600`. The retired installer wrote that file `chown
   $SERVICE_USER:$SERVICE_GROUP, chmod 600` (its §4), so a rename alone leaves the daemon's
   own uid — and every agent turn that runs as it — owning a file holding the bearer and
   every provider key in plaintext, which undoes the whole point of moving them into
   `LoadCredential`. A revocation that fails is a FAILED step even though the bytes moved:
   reporting it as done would report a migration as secure when it is not. `apply` has no
   `rm` and no `rename` at all, deliberately.

Everything else is `plan()`'s, unchanged: the missing GROUP (the latent failure the retired
installer left — `useradd --system --create-home` with no `--user-group` while the unit hard
required a `Group=`, so on a host whose `USERGROUPS_ENAB` says no the install "succeeded" and
the daemon never started), the unit, the vhosts, the rendered env, `sites.json`, the pairing
fragment, and the new service enabled.

**IT INFERS FROM THE SHAPE THAT ACTUALLY EXISTED.** There has only ever been ONE installer —
`install.sh` + `sample.env` + `deploy/dedalo-site-builder.service`, deleted in b46a29418e —
and it configured the daemon with `SITES_ROOT`, `PREPROD_ROOT` and `PROD_ROOT` and with NO
`AGENT_HOME`, `AUDIT_DIR` or `WEBSPACE_BASE`, because the daemon of that era had no such
keys. Adoption read the modern names and refused without them, which made it unable to adopt
any install that has ever existed: a migration path in name only. The three retired files are
committed verbatim as `publication/site_builder/tests/fixtures/pre_instance/` and frozen by
sha256 in the gate that builds its host from them, so the fixture cannot drift away from what
history was.

**WHAT KEEPS ITS PLACE AND WHAT DOES NOT.** The identity is VERBATIM — it comes out of the
installed unit's `User=`/`Group=` (a unit with no `Group=` reads as "named after the user",
and `plan()` creates the group before the user), and every byte on the host is owned by that
uid. So is `SITES_ROOT`, which becomes `roots.workspaces` unchanged. Three things cannot stay
where they are, and adoption MOVES them, one rename each, never a copy:

| Was | Becomes | Why it cannot stay |
|---|---|---|
| `PREPROD_ROOT` / `PROD_ROOT`, one pair shared by every site (`<root>/.releases/<slug>`, served through `<root>/<slug>`) | each site's own webspace (§6) | A vhost carries one document root and a site answers on its own domain. The old shape is not expressible in this grammar at all. |
| `<SITES_ROOT>/.audit/audit.jsonl` | `roots.audit`, outside the writable set | §3: the audit directory is root-owned precisely so an agent turn cannot unlink the record of itself. Inside `SITES_ROOT` it can. |
| the agent's HOME (`useradd --create-home`) | `roots.home`, 0700 under the state root — NOT carried over | It holds a vendor CLI's session cache, never a museum's material. |

`engine.checkout_dir` and `engine.bun_bin` are read off the installed unit's own
`WorkingDirectory=` and `ExecStart=` — this host's own statement of where its daemon lives,
which is a better answer than any topology. Two consequences are stated in the operator page
because an operator has to plan for them: the old vhost points at the old link, so there is a
window between the rename and the reload in which that path resolves to nothing; and a move
that would CROSS a filesystem is refused, loudly, having moved nothing — this command does
not copy a museum's published bytes.

**THE FLEET LAW RUNS BEFORE ANYTHING IS WRITTEN.** Adoption is the one verb that ADDS a
declaration to a host, and it was adding it unchecked: a museum inferred onto a domain, a
root or an identity another museum already held was provisioned on top of it — and the
collision it created then refused every subsequent verb for the whole host, `remove`
included, so the operator could not undo what the command had just done to them. The
candidate fleet is the declared one with this instance's own layout in it (replacing its
earlier self, so a resumed adoption is not refused for colliding with what the first run
wrote), and `assertFleetDisjoint` is asked about it before the serving proof.

**WHAT AN OPERATOR MUST STILL SUPPLY.** A pre-instance install records nothing about the
engine it is paired with, the web server's group, or how the public vhost terminates TLS:
those lived in an operator's head and in a hand-copied vhost. Adoption REFUSES and names
`--declare <fragment.json>` — one JSON fragment merged over the inference and validated by
the ordinary `parseManifest`, so a typo in it is refused by name instead of silently
ignored. That is a deliberate refusal, not a gap: a guessed group is a `0640` htpasswd the
web server cannot read and a `0660` socket the engine cannot open, discovered at the first
request.

### 8.1 The serving proof is the gate on "done"

`src/provision/verify.ts` is ONE function run TWICE against the same expectations.

- **BEFORE**, it decides whether this install can be proved at all. An install whose
  production link already disagrees with its own `site.json` is refused and nothing is
  written — afterwards there would be no way to tell a pre-existing disagreement from one
  the migration caused, and "the migration is done" would be unsayable.
- **AFTER**, the identical check is the gate on declaring the migration done. For every slug
  and every surface: the served link resolves, its target directory exists and is non-empty,
  and production serves the release the site's own manifest claims. A failure is FAILED,
  whatever else succeeded.

Production's expectation is the SITE'S OWN CLAIM (`site.json`'s `published.release`) and
deliberately NOT read off the link being checked; preprod, which has no such record, expects
what the link pointed at when adoption first looked, captured before anything is written. A
site that has never been published expects NULL, and null is a real expectation rather than a
skipped check: the provisioner creates the served link pointing at the release STORE as a
placeholder, so "this link must still be a placeholder" is exactly as checkable.

### 8.2 Resumable, therefore idempotent

A migration that can only be run once is a migration nobody can recover from. Every step is a
no-op when it has already happened, and the observation looks for `.env.pre-instance` when the
live `.env` is gone — so a second `adopt` re-reads the same facts, infers the same
declaration, finds the credentials already placed and the unit already disabled, and
converges. It refuses only when the declaration on disk DIFFERS from the inference, because
that file is what every artifact is generated from and replacing it with an inference,
silently, is not a thing this command may do.

## 9. Decommissioning

`provision remove` is the one verb that takes things away, and every part of its design is a
refusal to do the easy thing. What must not happen, under any flag, on any host, is that a
museum's cultural material ceases to exist because an operator typed a command with the wrong
name after it.

1. **It refuses by default while a site is published**, where published means the served link
   points at a RELEASE — not merely that a link exists, which would fire on every provisioned
   instance forever, and a refusal that always fires is one that gets worked around with a
   flag on the first day. `--purge-published` is how someone says they meant it.
2. **It archives; it never deletes.** Every tree with a museum's bytes in it — each site's
   webspace with both release stores, the workspaces root, the agent's HOME, the audit trail —
   is RENAMED beside itself as `<path>.retired-<utc>`, one instant for the whole run. A rename
   is atomic, keeps ownership and modes, and is undone with `mv` by a human. An archive whose
   destination is not in the same directory, or is the original itself, is refused by the
   plan's own coherence check rather than executed.
3. **It disables before it deletes, and a failed configtest STOPS it.** Every vhost's
   enabling link is unlinked first (proved ours by its TARGET, since a symlink carries no
   stamp) and only then the vhost itself: the other order leaves a dangling include, and the
   configtest three steps later then fails for every museum on the host. And that configtest
   is fatal rather than "skipped" — every failing command used to be downgraded, which is
   right for `systemctl stop` on an already-stopped unit and catastrophic here: the reload
   was issued anyway and the run reported "decommissioned" and exited 0.
4. **It names every credential it leaves behind.** `secrets/` lives inside the declaration's
   directory, which this verb does not remove, so the museum's bearer and provider keys are
   still on the host afterwards. That is the right default — they are not this command's to
   destroy, and the engine is still paired with the same token — but leaving them silently is
   how five live credentials stay on a decommissioned host with nothing saying so.
5. **It deletes only what it can prove it wrote.** The stamp is a body hash naming the
   instance. Three answers and no fourth: already gone; not ours (no readable stamp, or one
   naming another museum) so it stays and is reported by name; or ours, and it goes. There is
   no "it is at our path so it must be ours" — that sentence is how a decommission removes the
   vhost an operator wrote years earlier, or the museum next door's. The artifact set is
   `renderAll()`'s, handed in, never a list kept in `remove.ts` (§4's law, and the failure
   direction here is a museum's vhost left serving after its tenancy ended).
6. **It never frees a uid.** `usermod --lock`, and neither the user nor the group is deleted —
   a plan that tried to would be refused by `assertRemovalIsCoherent`. Every archived byte is
   owned by a NUMBER; returning it to the pool the next `useradd` draws from would give the
   next museum on this host the last one's files by accident. The instance NAME stays retired
   for the same reason, since the identity is derived from it.

Two things it deliberately leaves: `instance.json` (the operator decides, and the run says so
in its closing lines) and the paired engine's side of the pairing — the engine's
`../private/.env` still carries the fragment's lines, and that file is append-only.

`removalPlan()` is PURE, `(layout, artifacts, host, at) => RemovalStep[]`, for the reason
`plan.ts` gives at length and which is sharper here: this is the destructive verb, and a
destructive verb whose behaviour can only be observed by running it as root is a verb nobody
can review.

## 10. Stated residuals

Each of these is real, is not closed by this work, and is acceptable today for the stated
reason. They are listed so they cannot be quietly forgotten or quietly grown.

**Re-checked against the code 2026-08-30**, line by line rather than carried forward: 1, 2,
3 and 5 stand exactly as written (the spawn path is still a direct `Bun.spawn(plan.argv, …)`;
the htpasswd is still one file per instance with one reviewer set; `src/sites/template.ts`
still substitutes the API url once at scaffold time; `site.json` still lives inside the
workspace a turn can rewrite). 4 has moved and its text below says how.

**1. Within one instance, agent turns run as the daemon's uid.** The boundary defended
here is BETWEEN museums, not between two sites of the same museum, and not between the
agent and the daemon. A turn for `coleccion` can read the workspace of the same museum's
`archivo`. The reviewed sketch — spawning each turn through `systemd-run --uid=` into a
per-site transient scope — does NOT work against the current spawn path
(`src/drivers/process.ts:122` calls `Bun.spawn(plan.argv, …)` directly, and the driver
contract streams that child's stdout line by line and kills it by pid on interrupt), and a
half-built version of it would be worse than none: a per-turn uid that the stop path
cannot signal, or a stream the daemon cannot read, converts a working interrupt into a
runaway agent. Acceptable because the museum already trusts its own users and its own data
with each other — the engine grants the site-builder tool to those users — and because the
uid boundary that is built is the one where trust genuinely stops.

**2. The preprod password is ONE shared credential per museum.** `preprod.htpasswd` is per
instance (which is the defect it fixes), but within a museum every draft site sits behind
the same `preview` user. Preprod is a review surface for a small, known group and its
purpose is to keep drafts out of search engines and away from the public, not to
compartmentalize reviewers from each other. Per-site credentials would multiply an
operator-managed secret by the number of sites for a distinction nobody has asked for; if
one is ever asked for, the file is already per instance and the vhost already renders its
path from the declaration.

**3. `PUBLICATION_API_URL` is frozen into a site at scaffold time.** `src/sites/template.ts:94-96`
substitutes `__PUBLICATION_API_URL__` into the scaffolded tree once; from then on the value
lives in the site's own source, which the agent may edit and the git history keeps. Changing
the manifest afterwards does not move an existing site. Acceptable because the generated
site is a standalone static artifact that must keep working with no daemon at all — a
runtime indirection would make every published site depend on this service being alive —
and because a museum's publication endpoint changing is an operator event with a
documented repair (edit the site's source, rebuild, publish). The URL is at least now
DECLARED rather than hand-written — `publication_api.url` (§2.1) is what the rendered
env carries — so there is one value to change and one file to change it in. Honest
limit: nothing currently detects the divergence between that value and what an
already-scaffolded site froze.

**4. N complete Dédalo installs on one host is a REQUIREMENT, and the ENGINE's deploy
surface still has single-global assumptions.** 1:1 pairing means N engines beside N daemons.
The site-builder side of that is now templated by instance end to end, and as of 2026-08-30
so is its BACKUP: `engineering/PRODUCTION.md` §6 store 5 is per instance, and
`deploy/dedalo-site-builder-backup.sh` reads each instance's roots out of the artifacts the
provisioner generated for it rather than from a list of its own. What remains single-global
is the ENGINE's own ops surface: the default socket path `/tmp/dedalo_ts.sock`, the
`/opt/dedalo/bin/` out-of-tree supervisor scripts, the unit names in `deploy/`, and stores
1-4 of that same backup set (`PRODUCTION.md` §2, §3, §6, §12). Each is overridable per
install, none is templated by an instance the way this document templates the site builder.
That is a real gap and it is OUT OF SCOPE here: this work owns the site-builder side of the
pairing, and inventing an engine-side instance system as a side effect would be the second
source of truth for engine deployment. Recorded so that the day the engine gets one, the two
are designed to agree rather than discovered to disagree.

**4b. The serving proof has no verb of its own.** `src/provision/verify.ts` answers the one
question a converged host cannot ("does this museum's site still serve what it claims to
serve"), and it is reachable only from inside `provision adopt`. `provision check` proves the
host matches its declaration, which is a different question. The consequence is stated where
it bites: `PRODUCTION.md` §6.2 has to spell the reconciliation rule as three shell reads,
because after a restore there is no command that runs it. Acceptable only because the module
is already pure, already gated, and already takes an io seam narrow enough to expose — this
is a wiring job, not a design question, and it is deliberately not done in the same change as
the documentation that names it.

**5. A build step's command comes from a file an agent turn can rewrite.** `site.json`
lives at `<SITES_ROOT>/<slug>/site.json` — inside the workspace the driver is spawned with
as its cwd and that `git add -A` then commits — so a turn may rewrite its `build` block and
`readManifest` re-reads it at build time. `src/build/builder.ts` used to claim the opposite
("an agent cannot edit site.json") and justify its whitespace argv split on that premise;
the premise was measured false and the header now states what actually holds instead: there
is no shell (`Bun.spawn` receives an argv ARRAY, so nothing is parsed by `sh`), and a build
step runs at EXACTLY an agent turn's privilege — same unix user, same workspace, same
constructed `{PATH, HOME}` environment and no provider key at all. So an agent that
rewrites the build spec obtains nothing it did not already have while its turn was running.
Acceptable for the same reason as residual 1, and bounded by the same gate: the child
environment's key SET is held by `publication/site_builder/tests/agent_env_boundary.test.ts`,
which is what must be argued with the day a build step needs a credential. Not acceptable
was the false sentence, and it is gone.

## 11. What a gate may assert about this document

This file is prose, but parts of it are machine-checkable, and under DEC-12 the checkable
parts must be checked. Two gates read it —
`publication/site_builder/tests/provision.test.ts` (the declaration and the derivation) and
`publication/site_builder/tests/provision_examples.test.ts` (the render and the retirement)
— and between them they assert:

- **The matrix of §3 equals `MODES`.** Every row names a `MODES` key, and that key's
  owner, group and mode equal the row's — including the SETGID bit, compared as a whole
  number (`0o2750`), because a silent `0o750` is the difference between a museum's
  unpublished drafts being private and being world-readable. Both directions: a `MODES`
  key with no row is drift, and a row naming no key is drift too.
- **The accessors of §2.3 exist and resolve.** Every "Accessor" cell is evaluated against
  a real `derive(parseManifest(…))` result; an accessor that does not exist yields
  `undefined` and reddens. Both directions again: every top-level property of the derived
  layout must appear in the table, so a path that stops being derived cannot keep a row
  and a path that starts being derived cannot stay undocumented.
- **The naming arithmetic is the code's, and is an INEQUALITY.** The `INSTANCE_PATTERN`
  quoted in §2.2 is byte-identical to `INSTANCE_PATTERN.source`, the inequality quoted
  there is the one `layout.ts` asserts at module load, and this document states NO
  arithmetic result as a literal — not the prefix's length, not the sum. That last clause
  is itself checked, because both earlier prose statements of this rule were wrong about
  the prefix's length and neither could fail.
- **The slug grammar is UNCHANGED** — §2.2's pattern equals `src/util/slug.ts`'s `.source`.
- **The composition holds.** `derive(parseManifest(deploy/examples/instance.example.json))`
  succeeds. This is the assertion whose absence let three files describing three different
  systems sit green beside each other: nothing composed them, so nothing could notice.
- **No field validates and then vanishes.** Every override the schema accepts — a
  webspace, the webspace base, each of the three roots, an adopted identity, each base
  path, the realm, the host prefix, the API url, each stated limit — is asserted to move
  the DERIVED value. A field that installs cleanly and is then ignored is the defect this
  whole subsystem was built to remove (§4.2), and it is caught here rather than at publish
  time on a museum's host.
- **`readWritePaths()` covers every writable path,** asserted over a MATRIX and not one
  happy case: roots moved off the defaults, a webspace outside the webspace base, several
  sites. Coverage is checked with the daemon's own `isWithin`, so "the unit permits this
  write" and "the daemon permits this write" stay one question.
- **The refusals are refusals.** An inlined credential, a relative path, a bare (non
  absolute) agent bin, duplicate slugs, duplicate domains, and a realm or description
  carrying a quote or a newline are each rejected by name.
- **The marker constant and content of §5** are `layout.ts`'s, and the test fixture
  imports them rather than restating them (`INSTANCE_MARKER`, `markerContent`).
- **No path UNDER `rewrite/` is named anywhere in this file** — the repo-wide law. The
  directory is named twice, in the status block and here, only to state what does NOT
  live there; the gate matches `rewrite/<something>`, not the bare directory name, or it
  would redden on the sentence that documents the rule.

Added by Phase 2 (`tests/provision_examples.test.ts`):

- **The deleted files stay deleted** (§4): `install.sh`, `deploy/dedalo-site-builder.service`,
  `nginx/*.conf`, `apache/*.conf` and `sample.env` do not exist in the tree, the two
  directories that held only them are gone, and no prose in the package still instructs an
  operator to run or copy one.
- **Every committed example is byte-equal to a fresh render**, both directions, plus the
  census of §4.3 — so an example cannot be hand-edited and an artifact cannot go
  undocumented.
- **The stamp shape of §4 is `hash.ts`'s**, quoted from this document and compared against
  `STAMP_TOKEN` and against the first line of every committed example, so the document
  cannot describe a header shape nothing renders. (It did: this section previously
  specified a two-line `# GENERATED by …` / `# body-hash: …` header that no renderer ever
  produced, and nothing could notice.)
- **A render is STABLE and SECRET-FREE.** The same declaration is the same bytes twice
  over — the property the write-only-on-drift design rests on — and no committed example
  assigns a credential-shaped key any value but the pairing sentinel, nor carries a hex run
  long enough to be a token on any line but its own stamp.

Added by the provisioner (`tests/provision_{cli,adopt,remove,plan}.test.ts`):

- **A rendered vhost is an ENABLED vhost.** A two-site declaration plans one enabling link
  per vhost, each pointing RELATIVELY at its own file; a host whose vhosts are settled but
  never enabled is repaired and reloaded; a settled host plans none; a host that includes its
  vhost directory directly plans none and still tests and reloads; a COPY of a vhost or a
  link pointing elsewhere in the enabled directory refuses the instance rather than being
  silently replaced. And `remove` unlinks every enabling link BEFORE the configtest.
- **Adoption is measured against the install that actually shipped.** The three retired files
  are committed verbatim and frozen by sha256; the gate builds its synthetic host from THOSE
  bytes, and asserts that `sample.env` really does carry `SITES_ROOT`/`PREPROD_ROOT`/
  `PROD_ROOT` and really does not carry `AGENT_HOME`/`AUDIT_DIR`/`WEBSPACE_BASE`. The
  published surfaces and the audit trail are proved MOVED (the old stores are gone), the six
  surfaces are proved to serve the same releases, listings and bytes at their new address,
  and the retired env is proved `root:root 0600` from BOTH plausible starting modes.
- **A site that was never published is not a refusal**, and a site whose manifest claims a
  release with no link still is.
- **The fleet law runs before adoption writes anything**, and a second adoption is not
  refused for colliding with what the first one wrote.
- **A fleet collision does not make `remove` unusable** — it is reported, in full, and the
  run carries on, because taking one of the colliding instances off the host is HOW the
  collision is resolved.
- **A vhost whose site has been undeclared is named**, with its path and whether it is
  enabled, on a host the plan itself calls converged.
- **The documented exit-code table is the CLI's own closed set**, in both directions
  (`test/unit/operator_commands_tripwire.test.ts`).

- **Adoption takes the identity VERBATIM** from the installed unit, retires the `.env` by
  renaming it, writes each migrated credential `0600 root:root`, and lets no credential
  VALUE reach a step description. Asserted against the MIGRATION ALONE and not after the
  converge — `plan()`'s metadata re-assertion repairs a wrong mode on the way past, which
  hid the window the first time this was measured.
- **The serving proof is load-bearing in both directions**: a dangling link, an empty served
  target and a served release that disagrees with `manifest.published` each redden it, and
  an install whose production link ALREADY disagrees is refused before anything is written.
  Production's expectation is read from `site.json`, never off the link being checked — a
  mutation that read it off the link left every other gate green.
- **Removal archives rather than unlinks**, deletes only what carries this instance's stamp,
  refuses while a site is published, may never contain a step that deletes a user, and may
  never place a reload without a configtest immediately before it.
- **No verb makes a PARTIAL claim.** The `deferred` mechanism and its exit code were deleted
  rather than kept: a documented exit code no path returns is a promise to a script that will
  never be kept.

Added by the engine repo (`test/unit/operator_commands_tripwire.test.ts`):

- **An operator procedure in this repo is EXECUTABLE.** Every `provision` verb an operator
  page names exists in the CLI, every flag is one that verb accepts, every repo script it
  tells the operator to run is on disk, and every daemon environment key it names is one the
  daemon actually reads. And in the other direction: every verb the CLI has appears in
  `docs/management/site_builder.md`, so a new one cannot be shipped undocumented.
- **The backup set named in `engineering/PRODUCTION.md` §6 is the one the nightly unit
  copies**, in both directions, plus a behavioural leg that RUNS
  `deploy/dedalo-site-builder-backup.sh` over a synthetic host and asserts it copied the
  markers, the release stores and the served symlinks.

Assertions still to be written:

- **The renderers are pure** — no `process.env`, no clock, no filesystem read — asserted
  mechanically rather than by each renderer's own gate, so a `check` run is meaningful.
  Verified per module today; not yet ratcheted across the directory.
- **The residual list of §10 is SHRINK-ONLY**: a residual may be removed when it is closed
  and may not be added without a decision, the same ratchet the engine uses for its
  exemption lists.

A gate may NOT assert, and must not pretend to:

- that a running host matches this document — a doc gate reads the repo, not the museum's
  box. The provisioner's `--check` is the only thing that can say that, and only about the
  host it runs on;
- that the uid boundary HOLDS at runtime. It can assert the modes and the identities that
  are planned; whether the kernel and the vendor CLIs behave is the operator's `--check`
  and the residuals of §10;
- that an operator ever ran the provisioner. An instance that was hand-built to look right
  is exactly the state §4's body hashes exist to expose on the first run.
