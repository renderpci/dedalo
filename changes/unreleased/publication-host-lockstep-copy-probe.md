---
title: A paired publication server now gets the Publication APIs matching the work system's version, can keep a verified copy of the published media, and is checked from the public side.
type: added
audience: admin
date: 2026-10-05
---
After every code update or restore, the work system sends the matching Publication API releases to each paired publication server, exactly as the update verified them. A file changed on disk since then stops the push and is named in the panel. In **copy** mode the publication server keeps its own copy of the published media, only public qualities of published records. Unpublishing makes the files answer "not found" at once, then deletes them, and the deletion counts as done only once the server's file list confirms it. The maintenance panel can also check each publication server through its public address: a published file must load and an unpublished one must not, after every rules change and on a schedule. See [Publication host agent](./install/publication_host.md).
