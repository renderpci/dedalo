---
title: The publication tool shows every publication of a section, including two that share a database definition.
type: fixed
audience: admin
date: 2026-10-14
---
When two publications reach the same table through their own *database alias* pointing at one shared database definition (for example a production and a pre-production web), the publication tool showed only the first one, so the second could not be published from the tool. Each publication now has its own panel, with its own database, connection status and *Publish* button.
