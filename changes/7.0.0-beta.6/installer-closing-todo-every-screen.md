---
title: Every installer front end ends with the same *To do on this host* list, the salt's read command in it.
type: fixed
audience: admin
date: 2026-10-14
---
The full-screen installer's Done screen had no *To do on this host* list: the firewall command, the outside check and the other notes flashed by during the run and were gone. The Done screen now lists them (and leaves them on your normal screen when it closes), as the line mode and `--resume` runs do. On Production, Docker and Trial the list also names the command that reads the generated `DEDALO_SALT_STRING` back, on every run that completes the install — also a `--resume` after an earlier screen had already shown it.
