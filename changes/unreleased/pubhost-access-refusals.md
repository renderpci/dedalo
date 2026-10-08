---
title: "`provision check` now refuses a publication host where a service could not read or run its own code, and an `engine_group` that is one of the instance's own groups."
type: changed
audience: admin
date: 2026-10-08
---
Until now, a home directory left at Ubuntu's `0750`, an agent copy that only root could read,
or a site Bun the v2 account could not execute passed `check` and `apply`, and the service
failed later with *Permission denied*. `check` now judges every path a service runs from
with that service's own user and groups: the agent's code and every directory above it,
the site's Bun for the agent and the v2 API, the binary that checks v1 releases, and the way down
to the state root for the agent, v2 and v1. Each refusal names the account, the path and the
`chmod` that fixes it. On one machine it also refuses an `engine_group` that is the agent's
own group, or the group of the v1 or v2 accounts: the agent's socket would then be closed
to the work system. Whether the work system's user is in the declared group is still proved
by the socket request of step 7. `check` reads only the mode bits, so a host that grants
access through an ACL alone is now refused: give the access with the mode instead. See
[Publication host agent](./install/publication_host.md#4-provision).
