---
title: "On RHEL, Rocky and Alma with SELinux, the Publication API v2 of a site installed in its home now starts: systemd may read its settings and its release links."
type: fixed
audience: admin
date: 2026-10-09
---
The first API v2 release pushed in the EL install drill never started. Under the home layout the
v2 directory kept the home's own SELinux type, which systemd may not read, so neither the v2
settings file (`v2.env`) nor the links to the current release and to the release being tested
could be followed: every install was refused (`scratch_start_failed`). `provision apply` now
labels `<home>/dedalo/publication_api/v2` `data_home_t`, a type systemd reads and the web server
still may not. The v2 services also start their entry with `bun src/index.ts` instead of
`bun run src/index.ts`, which left links in the service's private `/tmp` that systemd could not
remove at every stop (an SELinux denial each time). Run `provision apply` (or init) again on such
a site. See [Publication host agent](./install/publication_host.md#rhel-rocky-and-alma).
