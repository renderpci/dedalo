---
title: "On a publication host with fapolicyd's `allow_filesystem_mark = 1`, the agent keeps its right to reload the web server and start its services."
type: fixed
audience: admin
date: 2026-10-09
---
With `allow_filesystem_mark = 1`, the setting the guided install recommends, fapolicyd also checks
the sandboxed polkit service, and polkit could no longer load the agent's rule: **Apply media
rules** failed with *reload_failed* and every API push with *trust_failed*, while the agent logged
*Interactive authentication required*. The instance's trust file now lists the agent's polkit rule,
and `provision apply` restarts polkit after each trust update, so a rule that failed to load
earlier is loaded again. The same setting stops the distribution's own polkit rules from loading,
for every program on the host: [Publication host agent](./install/publication_host.md#rhel-rocky-and-alma)
shows how to check for it and the lines that trust those rules. A failed start of the trust service
now says that polkit refused it, instead of a bare *exited 1*.
