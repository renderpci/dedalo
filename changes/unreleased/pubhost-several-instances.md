---
title: Several publication hosts on one server are checked for isolation.
type: added
audience: admin
date: 2026-10-06
breaking: true
---
`provision check` and `provision apply` now read the other publication-host declarations on the
server. They refuse an instance that shares a user, the v1 or v2 group, the v2 unit or port, a
listening port, or a directory with another. Before, a shared user let one instance change the other's
media rules and API releases, and a shared port only failed when the service started. When a
runtime path (Bun, the v1 API's runtime) or the agent's directory is a link, the refusal now prints
the real path to declare. The new section
[Several instances on one server](./install/publication_host.md#several-instances-on-one-server)
lists what each instance needs of its own.

**Action needed:** the declaration's `web.group` is now `v1.group`, the group the Publication
API v1 runs as. Move the value (`"web": {"server": …, "unit": …}`, `"v1": {"group": …}`). With
one process pool per site for the v1 API, use that site's pool group; two instances can no longer share it,
because the group can read the v1 API's database credentials.
