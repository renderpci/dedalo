---
title: Uploaded script files under the media folder answer "not found" on Apache
type: security
audience: admin
date: 2026-10-03
---

A server script file (`.py`, `.sh`, `.cgi`, …) placed under the media folder was
already never executed nor served, but Apache refused it with "forbidden",
which confirms to anyone probing that the file exists. Apache now answers
"not found", like nginx already did, in every protection mode and on a
separate publication host; without `mod_rewrite` it still refuses the file.
The `.htaccess` regenerates on its own after the update; re-render a
publication host's rule files with `scripts/media_publication_host_rules.ts`.
