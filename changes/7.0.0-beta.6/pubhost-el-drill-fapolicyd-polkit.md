---
title: "The guided publication-host install now runs on RHEL 9 with SELinux enforcing and fapolicyd: the polkit rules directory, the SELinux tools and fapolicyd's trust are judged as EL ships them."
type: fixed
audience: admin
date: 2026-10-09
---
The first run of the EL install drill on a real RHEL 9.8 machine (SELinux enforcing) found three
things the guided install got wrong there. `provision apply` refused every instance because EL's
polkit package owns `/etc/polkit-1/rules.d` by the polkit daemon's account: that directory, as
the package ships it, is now accepted (any other owner is still refused). init reported the SELinux
tools missing because `/usr/sbin/restorecon` is a link to `setfiles` on EL: a link to a program
now counts. With fapolicyd active, an untrusted Bun may not even read the code it runs:
`install.sh` now stops before the hand-over with the one line that trusts its Bun, and init's
`host.fapolicyd` prints the lines for the site's Bun **and the agent's code** (re-runnable: an
existing entry is updated). See
[Publication host agent](./install/publication_host.md#rhel-rocky-and-alma).
