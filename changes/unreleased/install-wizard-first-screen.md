---
title: The browser install wizard's first screen no longer fails with "An unexpected error occurred" in containers.
type: fixed
audience: admin
date: 2026-10-08
---
On a machine with no database yet, such as any container, the wizard's first call tried to read the database for the names of the configured languages and failed. The wizard now names them from the installer's own language list. See [Simple install](./install/quickstart.md#path-2-browser-wizard).
