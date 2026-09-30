---
title: The site builder can no longer start its agent units through polkit, and refuses confined agent runs until per-site identities land
type: security
audience: admin
date: 2026-09-30
breaking: true
---
The polkit rule the site-builder provisioner installs
(`/etc/polkit-1/rules.d/49-dedalo-site-<instance>-agent.rules`) allowed the site builder's
service user to *start* any systemd unit whose name began with the instance's agent
prefix. polkit is told the unit's name, but not which user the unit will run as. On
systemd 257 or newer that meant the service user could start a unit with that name as
root, so the site builder's daemon was effectively root on the host.

The rule now allows only *stop* and *kill*. Because a confined agent run can no longer be
started, the site builder now refuses every confined run (an agent turn, a build step, a
`git` command in a site workspace) up front, with a 503 that says why. This lasts until
per-site agent identities (root-installed units whose user the daemon cannot choose)
replace the current launch. The per-run environment file systemd reads as root is also
never written through a symbolic link or into a directory the daemon does not own.

**Action needed:** re-run the site-builder provisioner (`provision apply`) on every host
so the narrowed rule is installed. Until the follow-up release, AI site building on a
provisioned host will answer "confinement unavailable".
