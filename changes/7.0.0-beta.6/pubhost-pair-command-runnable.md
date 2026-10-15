---
title: "The publication-host pairing command now names a command you can run, and says why it cannot read a copied file."
type: fixed
audience: admin
date: 2026-10-08
---
When the pairing command refused because of the user running it, its message suggested
`sudo -u <engine user> bun run …`. Pasted as is, the shell read `<engine user>` as a file
redirection, and with the user filled in, `sudo` could not find a bare `bun`. The message now
prints the full command: the checkout to run it from, the user (by its id), and the Bun that
ran it, by its full path. A token file or engine bundle copied as root, which the Dédalo user
cannot read, used to end in *unexpected failure (Error)*, exit 4. It is now named like the
fragment already was, *could not be read (EACCES)*, exit 3. The engine fragment that
`provision apply` writes no longer claims that no release reads its keys: the pairing command
reads exactly those keys. The next `provision check` lists the fragment as a change, and
`apply` rewrites it. See [Publication host agent](./install/publication_host.md#pair-it-with-the-work-system).
