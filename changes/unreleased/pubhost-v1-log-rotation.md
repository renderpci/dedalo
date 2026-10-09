---
title: The Publication API v1 error log on a publication host is now rotated.
type: fixed
audience: admin
date: 2026-10-09
---
Each site's v1 API writes its errors to `/var/lib/dedalo_publication_host/<instance>/v1/log/error.log`. Until now nothing rotated that file, so it grew until the disk was full. `provision apply` now writes `/etc/logrotate.d/dedalo_<instance>_v1` for every site, in either layout. The file rotates daily and keeps 14 compressed copies. The rotation runs as the v1 user, because that account owns the directory and root never renames files in a directory another account can change. Run `provision apply` (or `provision init`) once for each site to get it. See [Publication host agent](./install/publication_host.md#lay-out-each-site-in-its-home-directory).
