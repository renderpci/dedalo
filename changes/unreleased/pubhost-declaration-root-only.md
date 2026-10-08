---
title: The publication host provisioner now refuses an instance declaration that anyone other than root could change.
type: security
audience: admin
date: 2026-10-07
breaking: true
---
`provision check` and `provision apply` build the agent's sudo and polkit rules and its services from the instance declaration, so whoever could edit or replace that file could choose which account the next `apply` grants them to. Both commands now refuse, before reading it, a declaration that is not a regular file owned by root and writable by no one else, or that sits under a directory that is not owned by root or is writable by others. The other declarations in `/etc/dedalo_publication_host/`, which the check between instances reads, and that directory itself follow the same rule. **Action needed:** before the next `check` or `apply`, run `chown root:root` and `chmod go-w` on each declaration and keep it in `/etc/dedalo_publication_host/`. `provision render` is unchanged and still works on a draft anywhere. See [Publication host agent](./install/publication_host.md#4-provision).
