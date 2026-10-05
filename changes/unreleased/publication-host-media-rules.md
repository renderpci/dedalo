---
title: A separate publication server can now serve published media from shared storage, with its own access rules.
type: added
audience: admin
date: 2026-10-03
---

Institutions whose public website runs on its own server, reading the same media storage as the work system (read-only), can now generate media rules for that server: `bun run media:publication-host-rules --root <mount>` (Apache, or nginx with `--server nginx`). The publication server then serves only the files of published records, in the public quality folders, and never accepts the work system's login cookie. Originals are never served. See *A separate publication server with shared media storage* in the media protection manual page.
