---
title: Administrators' toolbars now show only the tools their profile grants.
type: fixed
audience: admin
date: 2026-10-01
breaking: false
wc: WC-2026-10-01-tool-grant-one-decision
---
Global administrators (other than root) saw every installed tool in their toolbars, even tools their profile does not grant — and clicking one was then refused. The toolbar and every tool door now follow the same rule: a tool is available when the user's profile grants it (or it is always active); only the root account holds every tool. An administrator who asks for a tool their profile does not grant now gets "not authorized" rather than "unknown tool".
