---
title: "Upgrading a publication host's agent from a new kit no longer leaves the agent stopped on a host with fapolicyd."
type: fixed
audience: admin
date: 2026-10-09
---
When the new agent code was the only change, the guided install restarted the agent before
fapolicyd trusted the new files, and the agent stopped with *EPERM reading …/src/index.ts*. On a
host with fapolicyd, a run that installs new agent code or a new Bun now always runs `provision
apply` first, which trusts them, and only then restarts the agent. `provision apply` also clears a
service that stopped after too many failed starts, so a run that fixed the cause brings it back
instead of failing with *Start request repeated too quickly*.
