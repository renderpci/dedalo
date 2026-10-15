---
title: "`install.sh` now asks you to trust its Bun in the instance's own fapolicyd file, and says when to remove it."
type: changed
audience: admin
date: 2026-10-09
---
On a first install with fapolicyd running, `install.sh` stops until the Bun it starts is trusted.
The line it printed wrote a shared `dedalo` trust file, which the guide elsewhere tells you to
remove, and kept a stale entry for every instance installed that way. It now writes
`/etc/fapolicyd/trust.d/dedalo_init_<instance>`, and prints the line that removes it once init
converged; the installed Bun is then trusted by the instance's own trust file.
