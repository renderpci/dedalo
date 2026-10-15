---
title: Browsers that ran Dédalo v6 no longer load stale v6 scripts after the upgrade to v7.
type: fixed
audience: user
date: 2026-10-02
---
A browser that had used Dédalo v6 kept v6's file-caching service worker after the
installation moved to v7. That worker went on answering the browser's requests for
Dédalo's scripts with the old v6 copies, so the v7 interface loaded a mix of v6 and
v7 code and misbehaved — and the browser could not replace the worker on its own.

Now the first visit to v7 removes the v6 worker and its cache, and reloads the page
once with the v7 code. Nobody has to clear the browser cache by hand, and saved
preferences stay where they are.
