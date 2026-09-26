---
title: Expired sessions are garbage-collected when they hit the absolute cap.
type: fixed
audience: admin
date: 2026-07-25
---
The sweeper matched only the idle clock, so a session kept warm by a
polling client past the cap was refused on every request and its row kept
forever.
