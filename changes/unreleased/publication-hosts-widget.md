---
title: The maintenance area has a Publication hosts panel for the separate machines that serve your public website.
type: added
audience: admin
date: 2026-10-03
wc: WC-2026-10-03-publication-hosts-widget
---
The new **Publication hosts** panel, in the Publication group, shows every publication machine this installation is paired with. For each one it shows:

- whether the pairing is proved;
- its media mode;
- the media rule hash it runs, next to the one this installation expects;
- the Publication API releases it serves.

The root user can apply the media rules, check the media mount, roll an API back to its previous release, edit the host's public address, public qualities and probe files, and remove the host. Other administrators can read the panel's checks but cannot act on it, and do not see the hosts' network addresses. Hosts are added only on the command line, with `scripts/publication_host_pair.ts`, never from the panel.
