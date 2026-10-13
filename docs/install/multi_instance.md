# Several instances on one host

> See also: [Production install](production.md) · [Installer reference](installer_reference.md) · [The web server site](reverse_proxy.md) · [Upgrading](upgrading.md)

One engine process serves **exactly one entity and one database**. It reads its configuration once, at boot — there is no per-request switch of entity or database. So hosting several collections on one server does not mean one bigger process: it means **several independent instances**, each a complete installation, side by side behind one shared web server. The Production route is built for this: every production install is a **named instance**, and adding one is running the installer again with another name.

!!! info "When you do NOT need this"
    A single installation is already multi-user and multi-project: many users, many research projects, one ontology and one database, separated by permissions. That is not multi-instance. Reach for a second instance only when you need a **separate domain with its own database, its own media and its own login realm** — a distinct institution, a distinct collection that shares nothing.

## The named-instance model

Every name and path of a production instance derives from its instance name `<i>` (`src/core/install/host/layout.ts`), except the install folder and the service account, which the operator may choose ([The install folder and the service account](production.md#the-install-folder-and-the-service-account)). The derived names cannot collide by construction; the chosen ones are checked:

| Per instance | Value |
| --- | --- |
| service user and group | `ded_<i>` by default (`--service-user`, `--service-group`) |
| install folder, release tree, private directory, backups | `/home/ded_<i>/` by default (`--install-dir`), `…/dedalo/`, `…/private/`, `…/backups/` |
| web root, media, published client | `/srv/dedalo/<i>/`, `…/dedalo/media/`, `…/client/` |
| socket | `/run/dedalo-<i>/dedalo_ts.sock` |
| database and role | `dedalo_<i>`, owned by the peer role named like the service user |
| publication database (default) | `web_<i>` |
| units | `dedalo-ts@<i>` and its watchdog, restart, rollback and backup instances, with this instance's drop-ins |
| site file | `dedalo-<i>.conf`, with the nginx names `dedalo_<i>` and `dedalo_<i>_api` |
| certificate | `dedalo-<i>` (Let's Encrypt) |
| root-run scripts | `/opt/dedalo/instances/<i>/bin/` |
| installer record | `/var/lib/dedalo-install/<i>/` |

The layout follows one rule, by role rather than by path. **The instance directory** — the install folder, `/home/ded_<i>/` by default — is owned by the service user and holds its code, private directory and backups; an in-app code update renames the code tree only inside it, so its parent stays root's. **Everything a root-started unit runs** — the Bun runtime and the watchdog, rollback, backup and alert scripts — lives in root-owned directories outside every instance directory (`/opt/dedalo/bun/<pin>/`, `/opt/dedalo/instances/<i>/bin/`). A host installed by hand follows the same rule, with an install folder of its own choosing, for example one per domain such as `/home/my_domain.org/dedalo` — see [Install by hand › The layout](manual_install.md#the-layout).

### One account, one group, one folder per instance

A hosting server often has an account per domain. The installer can use one as the service user — `--service-user my_domain.org --install-dir /home/my_domain.org/dedalo` — and never creates, changes or deletes it. Each instance still needs **its own** account, group and folder: the System check refuses a service user or group another instance uses, and a folder that is, contains or lies inside another instance's folder (component-wise: `/home/a` and `/home/ab` do not overlap). It finds the other instances in the host registry, the units' drop-ins, the records of unfinished installs and any hand-installed `dedalo*.service`, and names the file in its refusal — remove a genuinely stale one, or choose another name.

With an existing account and no `--service-group`, the web server joins the account's **primary group**, and can then read whatever that group can read. The Review says so; a group of its own (`--service-group ded_<i>`) is the recommended choice, and the only one that keeps two instances apart when a hosting panel gives all its accounts one shared primary group.

Two components are **shared and trusted**, one each for the whole host:

- **The web server** terminates TLS for every instance and is the media gate for every instance. Its user joins each instance's group, so it can connect to each socket and read each media tree and published client.
- **The PostgreSQL cluster** — one server, one database and role per instance. That per-database split is the data isolation boundary.

## What the instances share

A few resources are installed once per host and used by every instance. The installer keeps a registry of the instances it set up — one file each, `/var/lib/dedalo-install/instances/<i>.json` (`0644`, root) — and counts who uses each shared resource, so an `--abort` removes one only when no other instance still names it:

| Shared resource | Where |
| --- | --- |
| the template units | `/etc/systemd/system/dedalo-ts@.service` and its siblings (`deploy/systemd/*@*`) |
| Bun at a pin | `/opt/dedalo/bun/<pin>/` — shared by every instance on the same pin |
| the SELinux module | `dedalo_engine` (RHEL family) |
| the nginx media map | `/etc/nginx/conf.d/dedalo-00-media-map.conf` |
| packages and repositories | never removed: shared host state |

!!! warning "Same-host instances run the same release (nginx)"
    The media map's variables are global to nginx, so exactly one instance's map is included host-wide, and an instance whose map differs — another release — is refused. Keep every instance on one nginx host at the same release.

## Adding an instance

Run the installer again, choose **Production**, and type another instance name (for example `archive`) on the first screen:

```shell
sudo sh install.sh
```

Headless, the run carries every required answer, as on the [Production route](production.md#run-the-installer):

```shell
sudo --preserve-env=DEDALO_INSTALL_ROOT_PASSWORD sh install.sh -- \
  --route production --instance archive --entity archive \
  --server-name archive.example.org --letsencrypt-email it@example.org --execute
```

The System check refuses, before any change, anything that would collide with what is already on the host: the user, database or role of that name, its unit or drop-ins, its site file, its socket, the nginx `upstream` and rate-limit zone names, any of its directories, and **the address already served by another site** on the same ports. Every refusal is listed in [Troubleshooting › The System check refuses](troubleshooting.md#the-production-system-check-refuses).

Each instance has its own public address and its own certificate. The installer writes one site file per instance and never edits another instance's.

## The isolation model, stated plainly

Each instance is one long-lived process supervised by systemd, running as **its own user**. The security boundary between two instances is therefore ordinary filesystem ownership: instance A's `.env` is `0600` owned by `ded_a`, inside a `0700` directory, and `ded_b`'s process cannot read it. The media trees are `0750`, never world-readable; the web server reads them through each instance's group.

!!! danger "Never point two instances at one private directory"
    They would share the session store, `ts_state.json` and the socket path — a silent corruption, not a clean error. The installer gives every instance its own; on a host set up by hand, every instance needs its own instance directory (its `private/` comes with it) or a distinct `DEDALO_PRIVATE_DIR`.

## Pitfalls specific to several instances

- **`DB_POOL_MAX` is per process.** Budget the **sum** across all instances — plus each diffusion runner and RAG drain — against PostgreSQL's `max_connections`, not each instance in isolation.
- **Adopted users share the web server's group.** A host upgraded from v6 keeps the web server's group as its service users' primary group, and two such instances then have **no boundary between them**. Give every instance its own group — [Phase E](migrating_from_v6.md#82-give-the-adopted-user-its-own-group).
- **The site-builder backup covers the whole host.** Ask for it (`--backup-site-builder`) on one instance at most.

## Verify each instance

- [ ] `curl --fail --unix-socket /run/dedalo-<i>/dedalo_ts.sock http://localhost/health` → `200` with `"db":"ok"`.
- [ ] `curl --fail https://<address>/health` → the same `200`, through the web server.
- [ ] Log in, create, save and reload a record; upload an image — the derivative and thumbnail appear.
- [ ] `curl -I -H 'Range: bytes=0-99' https://<address>/dedalo/media/image/thumb/<file>.jpg` → `206` (nothing is in the media byte path).
- [ ] As this instance's service user, confirm another instance's `<its install folder>/private/.env` is **not** readable — the boundary holds.
- [ ] `systemctl reboot`; every instance, socket and site comes back on its own.

## Upgrading one instance at a time

Each instance updates its own code from its own **Maintenance** panel, so you can update them one at a time and verify each before the next. Two limits apply: on nginx, instances on one host must end up on the same release (the shared media map), and a release that changes the runtime pin or the root-run scripts needs manual work today — see [Upgrading](upgrading.md).

## Removing an instance

There is no command that removes a completed instance. `--abort` takes apart only an install that did not finish; on a completed one it undoes only the host steps after the engine install and keeps the instance, its user, its database and its code.

`--abort` removes a service user and group only when that install created them. An **existing** account used as the service user is never removed — neither by `--abort` nor by anything else the installer does — and neither are its home and its other files.
