---
title: "Pairing from the sealed package: the guide puts the copy where the Dédalo user can read it, and an unreadable copy says why."
type: fixed
audience: admin
date: 2026-10-09
---
The guide told you to carry the `.pairing` file to `/root/`, which the Dédalo user cannot pass
(`0550` on RHEL, Rocky and Alma, `0700` on Debian and Ubuntu), so the pairing command answered
*could not be read (EACCES)*. The guide now uses `/opt/dedalo/pairing/`, and the command's refusal
for an unreadable file says that every directory above it must be passable too. The guide also
shows the firewall rule that lets only the work host reach the agent's port, on firewalld and ufw:
[Publication host agent](./install/publication_host.md#pairing).
