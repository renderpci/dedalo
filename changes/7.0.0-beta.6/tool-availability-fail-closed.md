---
title: A tool whose code fails to load no longer appears in every section.
type: fixed
audience: admin
date: 2026-10-07
---
When a tool's server code failed to load (for example a missing dependency), its "only in these sections" rule was skipped and the tool appeared in every section. Such a tool is now hidden, and the server log names the load failure.
