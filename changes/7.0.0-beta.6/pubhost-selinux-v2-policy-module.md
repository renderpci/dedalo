---
title: "On RHEL, Rocky and Alma, a publication host in the system layout now starts its v2 API: the provisioner installs its own small SELinux policy module."
type: fixed
audience: admin
date: 2026-10-09
---
With SELinux enforcing, an instance installed in the system layout (`/srv` and `/opt`) left
its v2 API tree with `/srv`'s own type, which systemd may not read: the v2 service could
not start. `provision apply` now writes and installs the policy module
`dedalo_publication_host` (one per host, a stamped CIL file, installed with `semodule`, no
compiler needed). It defines one type, `dedalo_publication_v2_t`, which systemd may read and the
web server may not, and labels the v2 tree with it before any service starts. The guided
install lists it as `selinux.v2_policy`. A module of that name that the provisioner did not
install is refused, never replaced, and the module is removed when no instance on the host
needs it any more. A first system-layout install also creates the shared directory `/srv/dedalo_publication_host` (it was refused when that directory did not exist). See
[Publication host agent](./install/publication_host.md#rhel-rocky-and-alma).
