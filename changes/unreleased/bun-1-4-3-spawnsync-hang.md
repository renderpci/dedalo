---
title: Dédalo now runs on Bun 1.4.3, which fixes a runtime defect that could leave a process waiting forever, at full CPU, on a program it had started.
type: fixed
audience: admin
date: 2026-10-14
breaking: true
---
On Bun 1.4.2, a process that had already run many synchronous calls to external programs could,
now and then, wait forever on one that had already finished, at 100% CPU (Bun issue 34069). The
server makes such calls for a few checks (the code update panel's git checks, the versions of the
PostgreSQL tools, ImageMagick, ffmpeg and curl); the command-line tools and the test suite make
many, which is where it was seen. Bun 1.4.3 fixes it, so the pinned runtime (`.bun-version`)
moves from 1.4.2 to 1.4.3, and the update panel refuses this release until the server runs it.

**Action needed, before you apply this update:**

- **Host installation:** as root, install the verified 1.4.3 runtime at `/opt/dedalo/bun/1.4.3/bun`
  exactly as [the `host_runtime` step](./install/manual_install.md#manual-host_runtime) does (with
  `PIN=1.4.3`, checked against this release's `.bun-sha256`), point the instance's `ExecStart` at
  it ([the `host_units` step](./install/manual_install.md#manual-host_units)), run
  `systemctl daemon-reload`, restart the instance, then apply the update.
- **Container installation:** nothing extra; the new image carries Bun 1.4.3
  ([Upgrading](./install/docker.md#upgrading)).
- **Publication hosts:** each site's Bun must move to 1.4.3 as well, or its **Bun version** row
  turns red ([Upgrading a site's Bun](./install/publication_host.md#upgrading-a-sites-bun)).
