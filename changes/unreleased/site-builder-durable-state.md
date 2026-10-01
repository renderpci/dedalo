---
title: Site builder state survives a power cut, and a damaged driver record is reported at startup.
type: fixed
audience: admin
date: 2026-10-01
breaking: false
---
The site builder's own state (each site's driver record, session and build
records, `site.json`) was written atomically but not forced to disk. After a
power cut or kernel crash, a newly written driver record could come back
empty. The site then refused every session that did not name its driver, on
every restart, and nothing explained why until a session was attempted. These
files, and the directories they are created in, are now forced to disk before
the write is reported done. A driver record that is present but unreadable is
now named in the startup log with the steps to fix it. It is left as found
and never rebuilt from `site.json`, which the agent can edit.
