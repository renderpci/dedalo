---
title: Two-machine publication hosts pair from one sealed, passphrase-protected file.
type: added
audience: admin
date: 2026-10-09
---
At the end of a guided install on a publication host reached over TLS, `provision init` now writes one encrypted pairing package — the engine fragment, the agent's token and the engine's TLS bundle — readable by root only, and shows its one-time passphrase once on the terminal (it is stored nowhere, and without a terminal no package is written). On the work host, `dedalo:pair-publication-host add <name> --package <file>` asks for the passphrase without echo (or reads it with `--passphrase-stdin`), opens the package in memory and runs the same checks and the same live proof as before. A wrong passphrase or an altered file is refused before anything is contacted. Delete both copies of the package afterwards; `--decide pair.package=again` writes a new one. Pairing with the three loose files is unchanged, and a host on the same machine still pairs directly. See [Pairing](./install/publication_host.md#pairing).
