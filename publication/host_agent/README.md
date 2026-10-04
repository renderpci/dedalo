# Dédalo publication host agent

A small Bun daemon that runs on an institution's **publication host**: the machine (or,
on a single server, the separate public hostname) that serves the website, the
Publication APIs v1 and v2, and the published media. The work system's engine is its only
client. It executes a closed set of commands (status, media probe, web-server rule
apply, API release install and rollback) and nothing else.

The definition is `engineering/PUBLICATION_HOST_SPEC.md`: §2 is the trust law, §3 the
release layout and bundle grammar, and §6 the command → route table. This README does not
restate them; it says how the package is built, provisioned and paired. The operator's
manual page is `docs/install/publication_host.md`.

It follows `publication/site_builder`'s shape: a strict three-layer config, the bearer
checked before routing, an RFC 9457 problem envelope, an append-only audit, and a
provisioner that renders every host artifact from one declaration. **Nothing is imported
from either.** The agent is a separate deployable. Where code was reused it was copied,
and the copy's header names its source file.

## Trust model, in one paragraph

Direction is work → publication only: the agent holds no work-host address or credential.
A compromised work host IS a compromised publication host (`release.install` runs pushed
code). The agent validates the SHAPE of what it is sent (sha256 stamp, bundle grammar,
path confinement), never the intent of its paired engine, and it records every
`current` swap `from → to`. See spec §2.6.

## Transport

| Topology | Listener | Who can connect |
|---|---|---|
| two machines | TLS on `TLS_HOST:TLS_PORT`, `requestCert` + `rejectUnauthorized` (constants) | only a client certificate issued by this host's private CA (the engine's) |
| one machine (spec §1.1) | unix socket `SOCKET_PATH`, mode 0660, group = the engine's | only the engine's group |

There is no third kind: `LISTEN_KIND` is `unix` or `tls`, and **plain TCP does not
exist**, not even for tests. The hermetic suite listens on a unix socket (`.env.test`),
and the mTLS gates (`tests/boot_mtls.test.ts`) bind TLS on `127.0.0.1` with a CA they
generate in the scratch tree.

A TLS listener whose certificate, key or `TLS_CLIENT_CA_FILE` is missing, unreadable or
not PEM refuses to boot. Firewall the TLS port to the work host's address. WireGuard
underneath is recommended, never a substitute.

On every listener, `Authorization: Bearer <SERVICE_TOKEN>` is required on every route
except `GET /health`, and it is checked before routing. `/health` publishes
`instance_fingerprint` (`src/security/pairing.ts`), never the instance name.

## Privileges

The daemon never runs as root. It has two grants, both rendered and hash-stamped by the
provisioner:

| Grant | Allows | Why it cannot be narrower |
|---|---|---|
| sudoers | `apachectl -t` or `nginx -t`, exactly that argv | a configtest must read root-only TLS keys |
| polkit | `reload` of `WEB_UNIT`, `restart` of `V2_UNIT`, `start`/`stop` of the `<V2_UNIT>-scratch@<port>` template | the same unit-scoped rule the site builder uses |

Every child process goes through `src/exec.ts`, a closed set of named commands
(`webConfigtest`, `webReload`, `v2Restart`, `phpLint`, `v2ScratchBoot`). A package test
fails if any other `src/` module spawns. `process.env` is read only in `src/config.ts`,
and that is gated too. Open: the scratch template unit is rendered and granted, but
`v2ScratchBoot` still boots a release under test itself, as the agent user, from a
committed `releases/<id>` directory only (spec §2.5).

## On the host

```
<STATE_ROOT>/
  publication_api/v1/{releases/<id>/, shared/, current -> releases/<id>, staging/}
  publication_api/v2/{releases/<id>/, shared/v2.env, current -> releases/<id>, staging/}
  rules/dedalo_media_publication.<apache|nginx>.conf    the include rules.apply writes
  audit/audit.jsonl                                     append-only NDJSON (chattr +a in production)
```

The state root carries a `.dedalo_host_agent_instance` marker naming the instance, and
the daemon refuses to boot against an unmarked root. A release id is `<version>_<digest7>`.
The v1 config files live in `v1/shared/` and are linked into each release after
extraction (spec §3). The agent never runs `bun install`: a v2 bundle carries its
production `node_modules`.

## Configuration

There is one resolution path, the same on a laptop and on a host. `src/config.ts` parses a
named env file (`.env.test` under `NODE_ENV=test`), merges a small ambient allowlist, and
layers `$CREDENTIALS_DIRECTORY` on top; the credential always wins. Every key and its
grammar are the zod schema in `src/config.ts`. `.env.test` is a complete, committed
example. An unknown key is a named refusal. `SERVICE_TOKEN` is a credential: on a host it
arrives through systemd `LoadCredential=`, never in a rendered file.

## Development

```bash
bun install
bun test              # hermetic: unix socket + loopback mTLS only, no sudo/systemctl
                      # (exec seam injected), scratch roots under .test-tmp/ (marker-guarded)
bunx tsc --noEmit
```

From the repo root: `bun run hostagent:install`, `bun run hostagent:test`,
`bun run hostagent:start`. The live end-to-end drill is `bun run test:pubhost:agent`. It
runs real mTLS, a user-mode Apache and nginx, and real v2 releases over the suite MariaDB,
on the CI instance tier.

## Provisioning

There is no installer script. One declaration states the deployment, and the provisioner
derives every artifact from it: the agent's systemd unit, the v2 unit, the environment
file, the sudoers rule, the polkit rule, the mTLS material (private CA, server
certificate) and the engine bundle.

The declaration is `/etc/dedalo_publication_host/<instance>.json`. `--declaration <file>`
names another path. Its shape is `HostDeclaration` (`src/provision/layout.ts`), validated
strictly by `src/provision/schema.ts`. Two complete, gated examples are
`deploy/examples/instance.example.json` (two machines, TLS, nginx) and
`deploy/examples/instance.single_machine.example.json` (one machine, unix socket, Apache). The provisioner never creates accounts: if the
agent user, the v2 user or a declared group is missing, `check` refuses and prints the
`useradd` / `groupadd` line to run.

```bash
bun run provision render <instance>    # print every artifact; writes nothing, no root needed
bun run provision check  <instance>    # as root: plan only; exit 1 on drift, 3 when refused
bun run provision apply  <instance>    # as root: converge; writes only what drifted
```

The arguments are positional. The same command runs from the repo root as
`bun run hostagent:provision <verb> <instance>`. Exit codes: 0 ok, 1 drift (`check`),
2 usage, 3 refused, 4 failed.

The order is: schema → layout → pure stamped renderers → plan → dumb apply. Each rendered
file carries a hash of its body, so a hand edit shows up as a refusal on the next `check`
and is never overwritten. `deploy/examples/rendered/{tls-nginx,unix-apache}/` is the full
output for two fixture layouts in a tree that mirrors the host, and
`deploy/examples/rendered.index` lists each file's mode and owner. Both are generated and
gated (`tests/provision_examples.test.ts`). Re-render them with
`UPDATE_EXAMPLES=1 bun test tests/provision_examples.test.ts`, never by hand.

Besides the host artifacts, `apply` writes `/etc/dedalo_publication_host/<instance>/engine.env.fragment`
(secret-free): the engine-side keys the phase 3 client is expected to read (proposed names;
no engine release reads them yet), with the expected pairing fingerprint rendered in.

**Install the code without registry egress:** run `bun run hostagent:install` on the
work host, then copy `publication/host_agent/` (with its `node_modules/`) to the
publication host.

## Pairing

1. `provision apply` on the publication host issues the mTLS material. It writes the
   engine's half as ONE file, `/etc/dedalo_publication_host/<instance>/engine_bundle/engine_bundle.pem`
   (root-owned, `0600`, in a `0700` directory). The file holds three PEM blocks, in this
   order: the client certificate, the client private key, the CA certificate. The client
   key exists nowhere else. When `apply` reissues the client certificate it prints
   `THE ENGINE BUNDLE CHANGED`, and the bundle must be carried again.
2. The operator carries the bundle to the work host. This is the one manual step, and it
   is deliberate: it crosses the isolation boundary.
3. Verify from the work host. First split the bundle for `curl`:

   ```bash
   umask 077
   sed -n '1,/-----END PRIVATE KEY-----/p' engine_bundle.pem > client.pem   # certificate + key
   sed '1,/-----END PRIVATE KEY-----/d'    engine_bundle.pem > ca.pem       # the CA
   curl --cacert ca.pem --cert client.pem \
     https://<TLS_HOST>:<TLS_PORT>/publication/host_agent/health
   ```

   Then compare `instance_fingerprint` with this value, computed on the publication host
   (as root):
   `printf 'dedalo-publication-host:%s\n%s' <instance> "$(cat <credential file>)" | sha256sum`.
   `<credential file>` is the path in the agent unit's `LoadCredential=` line
   (`provision render` shows it). The two must be equal; the same value is rendered as
   `DEDALO_PUBLICATION_HOST_FINGERPRINT` in `engine.env.fragment`. A wrong instance and a
   wrong token give the same mismatch.

The engine-side client, the publication-host registry and the panel are phase 3. Until
then, the engine-side recipe `src/core/publication_host/pairing.ts` exists and is held
equal to `src/security/pairing.ts` by `test/unit/publication_host_pairing_tripwire.test.ts`.
