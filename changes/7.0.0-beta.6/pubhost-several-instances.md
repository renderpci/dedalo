---
title: Several publication hosts on one server are checked for isolation.
type: added
audience: admin
date: 2026-10-06
breaking: true
---
`provision check` and `provision apply` now read the other publication-host declarations on the
server. They refuse an instance that shares a user (agent, v1 or v2), the v2 group, unit or
port, a listening port, or a directory with another. Before, a shared user let one instance change the other's
media rules and API releases, and a shared port only failed when the service started. When a
runtime path (Bun, the v1 API's runtime) or the agent's directory is a link, the refusal now prints
the real path to declare. The new section
[Several instances on one server](./install/publication_host.md#several-instances-on-one-server)
lists what each instance needs of its own.

The installation page now declares the instance before creating its accounts, and gives the
exact commands. `provision check` names each missing account with its declaration field and
the command, in the order to run them. The new section
[Lay out each site in its home directory](./install/publication_host.md#lay-out-each-site-in-its-home-directory)
puts each site's state root beside its document root (`/home/<site>/dedalo`, with the home
owned by root) and shows the virtual host that maps the APIs into the site.

The examples' `v2.health_url` was `…/dedalo/publication/server_api/v2/health`, which answers
404 under the v2 API's default `BASE_PATH`, so every v2 release would fail its health check.
It is now `http://127.0.0.1:<port>/health`, which answers whatever prefix the API is published
under; use that form in your declaration.

**Action needed:** the declaration's `web.group` is replaced by `v1.user`, the user the
Publication API v1 runs as: with one process pool per site, that site's pool user (the pools may
share the web server's group). Write `"web": {"server": …, "unit": …}` and
`"v1": {"user": …}`. The v1 configuration file in `shared/` must now be owned by that user and
readable by it alone (`chmod 0400`): installing a v1 release is refused with
`shared_config_exposed` otherwise. The agent, v1 and v2 users must be three different accounts.
