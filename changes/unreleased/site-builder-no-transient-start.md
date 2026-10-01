---
title: The site builder can no longer start its agent units through polkit
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

The rule now allows only *stop* and *kill*, and only on the runs of the museum's declared
sites. The daemon no longer starts any unit. A run is started by systemd from units that root
installs for each site, as that site's own user (see the entry on per-site agent users, in
this same release). No per-run file is written for systemd to read as root.

**Action needed:** run the site-builder provisioner (`provision apply`) on every host. It
installs the narrowed rule together with the per-site units.
