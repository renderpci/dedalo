---
title: The publication host's guided install now configures the running web server when both Apache and nginx are installed.
type: fixed
audience: admin
date: 2026-10-09
---
On a machine with both Apache and nginx installed, where only one of them runs, the guided install (`install.sh`, `provision init`) proposed Apache whatever ran and then found no site to attach to, so the install stopped asking for a manual step. It now proposes the web server that is running, and when you choose the other one, it looks at that server's sites before going on. Measured on Ubuntu 24.04, which keeps a stopped, disabled Apache listed. See [the publication host install guide](./install/publication_host.md).
