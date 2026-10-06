---
title: Publication host provisioning works with Apache on Debian and Ubuntu.
type: fixed
audience: admin
date: 2026-10-06
breaking: true
---
`provision check` refused every Debian or Ubuntu Apache host with *web.configtest_bin
'/usr/sbin/apachectl' is a symlink*, because the provisioner used one fixed path for every
system. It now picks the configuration-test command found on the host: `apache2ctl` on Debian
and Ubuntu, `apachectl` on RHEL, `nginx` for nginx. The agent's settings file now names that
command. **Action needed** for an agent provisioned before this change: after copying the new
agent code, run `bun run provision apply <instance>` again. Until you do, the agent refuses to
start because the setting is missing. If the agent restarted repeatedly before you ran it,
systemd may have stopped retrying: run `systemctl reset-failed dedalo-publication-host-<instance>`
and `apply` again. See [Publication host agent](./install/publication_host.md).
