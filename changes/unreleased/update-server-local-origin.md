---
title: An update server with no public host now says so, instead of sending download links that point at localhost.
type: fixed
audience: admin
date: 2026-09-28
---
When an ontology or code update server had no `DEDALO_HOST` set (or set it to `localhost`), it still answered other installations, but every download link in its answer pointed at `http://localhost`. The installation being updated rightly refused them, with an "origin mismatch" error that seemed to blame its own setup.

The server now refuses those requests itself, and its message names the setting to fix: set `DEDALO_HOST` (and `DEDALO_PROTOCOL`) on the update server. Requests from the same machine are still served, so local development setups keep working.
