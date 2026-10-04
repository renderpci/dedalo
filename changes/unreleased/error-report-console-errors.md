---
title: Error reports now include logged client errors
type: fixed
audience: admin
date: 2026-09-28
---

The "Report a problem" tool now attaches errors the client caught and logged (`console.error`), not only uncaught ones, so a report of real breakage no longer says "0 errors". Only a short message and stack are kept; repeats are counted, not duplicated.
