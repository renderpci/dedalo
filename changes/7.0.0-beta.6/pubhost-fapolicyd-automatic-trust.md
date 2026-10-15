---
title: "On a publication host with fapolicyd, the trust of the agent, its Bun and every Publication API release it installs is now kept by the host itself: no trust lines to run by hand, and a rollback is trusted too."
type: changed
audience: admin
date: 2026-10-09
---
Before, the guided install stopped at `host.fapolicyd` until you ran printed `fapolicyd-cli`
lines for the site's Bun and the agent's code, again after every code update, and the API
releases the agent installed later were not covered at all. Now, wherever fapolicyd is installed,
`provision apply` writes one trust file per instance (`/etc/fapolicyd/trust.d/dedalo_<instance>`)
and installs a root service, `dedalo-pubhost-trust-<instance>`, that the agent starts after every
release install and before every rollback. The service works out what to trust from the
instance's declaration (the Bun, the agent's code, the current and the previous release of each
API it serves); the agent cannot name a file. A release it cannot verify is refused with
`trust_failed` and the previous release keeps serving. Two new init items warn about fapolicyd's
own settings and print the lines that change them: `host.fapolicyd_integrity` when `integrity`
would let a file changed after it was trusted still run (`integrity = sha256`), and
`host.fapolicyd_mounts` when `allow_filesystem_mark = 0`, fapolicyd's default, under which it
never sees what the agent and the API services open at all. `install.sh` still stops, with the one
line to run, when fapolicyd denies the Bun it starts. A `dedalo` trust file left by the old hand-run
lines is no longer needed. See
[Publication host agent](./install/publication_host.md#rhel-rocky-and-alma).
