---
title: "`./install.sh` runs on macOS again (and wherever Docker's storage lives in a VM)."
type: fixed
audience: admin
date: 2026-10-08
---
On macOS, and on Docker Desktop under WSL or with a remote Docker host, `./install.sh` stopped silently right after its banner. Its free-disk check used a Linux-only option. The check is now portable. Where the free space cannot be measured from the host, the check is skipped and the install continues. See [Simple install](./install/quickstart.md).
