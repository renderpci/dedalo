---
title: Session expiry retuned.
type: changed
audience: admin
date: 2026-07-25
---
The idle timeout drops from 12 h to **1 h**
(`SESSION_TTL_SECONDS`) and the absolute cap from 30 days to **12 h**
(`SESSION_ABSOLUTE_TTL_SECONDS`). An unattended browser is the threat the idle
window exists for, and because the client polls in the background the idle
clock alone never expires anything — the cap is what actually ends a working
day. Both clocks were already enforced on read; only the defaults moved.
**Long-running work is unaffected**: background imports keep their requesting
user on the job record and diffusion re-derives the enqueuing principal at run
time, so a publication run or a massive import survives its owner's logout and
reattaches after re-login.
