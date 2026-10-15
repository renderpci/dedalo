---
title: A publication host can now serve the Publication API v2 only, without the Publication API v1.
type: added
audience: admin
date: 2026-10-09
wc: WC-2026-10-09-publication-host-v2-only-site
---
The Publication API v1 is legacy: it is needed only by websites built for Dédalo v6. A publication host's declaration without a `v1` block now installs a v2-only site, the recommended shape for a new site: no v1 account, no v1 configuration file and no v1 runtime on the host, and the guided install (`provision init`) neither looks for nor asks about any of them. The draft chooses with `"apis": "v2_only"` or `"v1_and_v2"`, or by the presence of its own `v1` block, and a v2-only site names its distribution family in `site.os_family`. The work system never pushes a v1 release to such a host, and its **Publication hosts** panel shows the v1 row as *Not served*, which is not a fault. Existing hosts that declare v1 are unchanged. See [the publication host install](./install/publication_host.md).
