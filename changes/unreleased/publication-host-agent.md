---
title: A separate publication server can now run a small agent that the work system pairs with, to install the Publication APIs, apply media rules and report status, without root access.
type: added
audience: admin
date: 2026-10-04
---
Institutions whose public website runs on its own server, or on its own hostname on the same server, can install the **publication host agent** there. It accepts a fixed list of requests from the work system and nothing else: report status, check the media mount, apply the web server's media rules (keeping the previous rules if the new ones fail the configuration test), and install or roll back a Publication API release (the previous release keeps serving when a new one is not healthy). The work system connects over mutual TLS, or over a local socket on a single server, and proves the pairing with a fingerprint. The agent runs as its own user with two narrow grants (the web server's configuration test; and reloading the web server, restarting the v2 API, and starting or stopping a scratch copy of the v2 API on a local port to test a new release), and the publication server never needs to download packages. The maintenance panel learns to drive it in a later release. See [Publication host agent](./install/publication_host.md).
