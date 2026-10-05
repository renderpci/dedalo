---
title: The maintenance panel now shows each paired publication server, and can apply its media rules or roll back a Publication API release.
type: added
audience: admin
date: 2026-10-03
wc: WC-2026-10-03-publication-hosts-widget
---
A new **Publication hosts** panel in Maintenance, in the Publication group, lists every publication server the work system is paired with. For each one it shows whether the server answers, whether the pairing still matches, its media mode and mount, whether its installed media rules are the ones the work system would generate now, and which Publication API releases are current. The root user can apply the media rules, check the media mount, roll back a Publication API release, edit a server's public address, quality folders and probe files, or remove a server; other administrators see the panel read-only, without the servers' network addresses. Servers are added only on the work server's command line (`bun run dedalo:pair-publication-host`), run as the user that runs Dédalo, from the files the publication server's provisioner writes; the token is given in the fragment, a private file or standard input, never as an argument. The pairing is proved before anything is saved, and the work system never sends its token to a server whose pairing fingerprint does not match. The **Media access control** panel links to it. See [Publication host agent](./install/publication_host.md#pair-it-with-the-work-system).
