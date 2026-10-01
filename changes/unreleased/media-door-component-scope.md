---
title: Posterframes, audio streams and clip downloads now respect the component's own permission and the user's projects.
type: security
audience: admin
date: 2026-09-30
wc: WC-2026-09-30-media-pair-scope
---
The audiovisual and 3D media actions (create or delete a posterframe, attach a 3D snapshot, read an audiovisual file's streams, cut and download a clip) used to check only the section's permission. A profile that was explicitly denied the audiovisual component could still use them, and any record id could be reached even outside the user's projects. They now check the section, the component itself and the record's project, in that order, before they look at the file. A user who can see a record's video in the player can still download its clips as before.
