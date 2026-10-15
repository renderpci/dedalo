---
title: After an install from a kit converges, `provision init` offers to remove the kit file it was given.
type: added
audience: admin
date: 2026-10-09
---
`install.sh --kit` now tells init which kit file it was given and the sha256 it verified. When the install converged, init asks whether to remove that file (the default is no); without a terminal, `-- --yes` removes it. Only that file is removed, and only while it still has the verified sha256: a replaced file or a link is left in place and named. Re-runs need no kit, and the work host can always build it again. See [Publication host agent](./install/publication_host.md#the-kit).
