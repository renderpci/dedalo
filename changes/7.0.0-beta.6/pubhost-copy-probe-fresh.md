---
title: "**Probe media** on a new copy-mode publication host no longer reports a problem before anything is published."
type: fixed
audience: admin
date: 2026-10-09
---
On a copy host, the marker directory `.publication/pub/` is created by the agent with the first
published record. Until then the probe reported it as missing, so the first probe after pairing
said *found 1 problem(s)*. An absent marker directory is now zero published records on a copy
host; on a shared host it is still a problem.
