---
title: Master media folders are protected whatever their letter case
type: security
audience: admin
date: 2026-10-03
---

The list of media folders that may be served publicly now refuses an archival
master or retouched work copy written in any letter case. Before, an entry such
as `image/ORIGINAL` or `image/Original` in the public qualities setting was not
recognised as a master; on storage that ignores case (macOS disks, Windows/SMB
network shares) that folder is the same as `image/original`, so the full-size
master files could be served to anonymous visitors. The same applies to a
renamed master tier configured by your installation. If you set public
qualities by hand, the refused entry is now logged at startup; regenerate the
media rule files from the maintenance panel so the web server picks up the
corrected list.
