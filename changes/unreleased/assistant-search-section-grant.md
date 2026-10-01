---
title: The assistant can no longer search or count records of a section the user may not read.
type: security
audience: admin
date: 2026-09-30
wc: WC-2026-09-30-mcp-search-section-grant
---
The assistant's search, count and find-or-create tools applied the user's projects but not the section permission, so a user whose profile did not grant a section could still list and count its records through the assistant. They now refuse such a section, exactly as the record list does.
