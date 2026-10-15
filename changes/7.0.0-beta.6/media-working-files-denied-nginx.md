---
title: Working files under the media folder are never served, on Apache or nginx
type: security
audience: admin
date: 2026-10-03
---

Soft-deleted, temporary, import and CSV working files kept next to the media
(`.deleted`, `.temp`, `.tmp`, `.import`, `.csv`) are now refused with "not
found" by both web servers, in every protection mode and on a separate
publication host. Before, the generated nginx rules did not refuse them at all:
a working file of a published record whose name followed the media naming
pattern was served to anonymous visitors. Apache already refused them, but
answered "forbidden" (confirming the file exists) and only in lower case, so on
storage that ignores case (macOS disks, Windows/SMB shares) `.TMP` was served.
The media rule files regenerate on their own after the update; on nginx, reload
it afterwards (`nginx -t && nginx -s reload`), and re-render a publication
host's rule files with `scripts/media_publication_host_rules.ts`.
