---
title: A publication host on another machine installs from one kit file built on the work host.
type: added
audience: admin
date: 2026-10-09
---
Installing a publication host on a second machine no longer means copying five entries of the work checkout by hand. On the work host, `bun run hostagent:pack -- --draft <draft.json>` builds one archive — the agent's code with its production dependencies (installed for the kit, without the tests), the draft and the installer, with a list of every file's checksum — and prints its sha256. The same checkout and draft always give the same file. The kit carries no password and no token: those are typed or created on the publication host. There, `sh install.sh <instance> --kit <file> --kit-sha256 <sha256>` refuses a kit whose sha256 is not the one the work host printed, then refuses an altered, extra or missing file before any of its code runs. A draft the guided install would refuse is refused when the kit is built. Installing from a checkout (`--source`) is unchanged. See [the kit](./install/publication_host.md#the-kit).
