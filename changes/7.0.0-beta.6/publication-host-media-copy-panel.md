---
title: The publication hosts panel shows each copy-mode host's media copy, and root can bring one host back in sync on demand.
type: added
audience: admin
date: 2026-10-05
wc: WC-2026-10-03-publication-hosts-widget
---
For a publication server that keeps its own copy of the published media, the publication hosts panel now has a **Media copy** row. It reads OK when the copy matches what the work system publishes. It reads pending while files are still being copied or removed, and red when an unpublished file has not been confirmed deleted from the public server after one check period (ten minutes), or when the server stopped being a copy server while it still held files. The engine checks and repairs every copy server by itself every ten minutes, and right after a data restore. The root user can run it for one server at once with **Reconcile media copy**. Applying it by hand, here or from the **Reconcile** panel, is reserved to root. A server that cannot be reached is reported as a failure, never as done, and its pending deletions are completed on the next check. A copy server is now protected by the same media rules as a server that mounts the shared media (**Apply media rules** works for it too), so an unpublished record stops being served before its files are deleted.
