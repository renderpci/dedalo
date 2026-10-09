---
title: "On RHEL, Rocky and Alma, the v2 API of a site installed in its home now uses the publication host's own SELinux type, as in the system layout."
type: changed
audience: admin
date: 2026-10-09
---
With SELinux, the v2 API tree of a site installed in its home (`/home/<domain>`) was labelled
`data_home_t`, a home type the web server can read when `httpd_read_user_content` is on. It is
now labelled `dedalo_publication_v2_t`, the one type of the publication host's own policy module
`dedalo_publication_host`, in both layouts: systemd may only read it and the web server may not
read it under any boolean. `provision apply` (or init) installs the module on every SELinux host.
On a site already installed in its home, the next run re-types its own rule in place and
relabels the tree, before v2 starts again; nothing is to be done by hand. A rule of yours on the
same path is refused, never changed. Run `provision apply` (or init) again on such a site. See
[Publication host agent](./install/publication_host.md#rhel-rocky-and-alma).
