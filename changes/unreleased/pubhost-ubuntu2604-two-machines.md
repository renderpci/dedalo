---
title: A publication host on its own machine is now proven on Ubuntu 26.04, from the panel's kit to the first publication.
type: changed
audience: admin
date: 2026-10-09
---
A work system and a separate publication host, both on real Ubuntu 26.04 machines with AppArmor enforcing, went through the whole two-machine path with no change needed: the kit built in the *Publication hosts* panel, the guided install from it, pairing from the command line and from the panel, a token rotation and a new pairing, then the media rules, the media probe, pushing the Publication APIs (v2 alone, and v1 with v2 on a second site), rolling them back and pushing again. The firewall rule from the guide, Ubuntu 26.04's sudo-rs and its sandboxed `apache2` service on both machines, and the Publication API v1 runtime on version 8.5 all work as they are. See [the publication host install guide](./install/publication_host.md).
