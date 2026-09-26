---
title: Pre-expiry warning.
type: added
audience: user
date: 2026-07-25
---
The client warns before a session dies, so unsaved work
can be committed instead of the next click failing. Lead time is
`SESSION_WARNING_SECONDS` (default 300; `0` disables it). The boot payload
ships only the absolute deadline — the idle window restarts on every request,
so the client re-arms a local timer from its own activity beat.
