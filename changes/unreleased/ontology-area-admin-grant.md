---
title: The Ontology area can now be opened by global administrators whose profile grants it, not only by root.
type: changed
audience: admin
date: 2026-10-07
wc: WC-2026-10-07-ontology-area-admin-grant
---
Until now only the root account could see the Ontology area in the menu or open it. It now also opens for a global administrator whose profile grants the Ontology area. Both are needed: a global administrator without that permission does not see it, and neither does a user who has the permission but is not a global administrator. Inside the area, the profile decides what the administrator sees: each ontology (for example `dd`, `rsc` or a local one) appears only if the profile grants read access to it, and its records and fields follow the usual read and edit permissions. Root still sees and edits everything. To give someone access, grant the Ontology area and the ontologies they should work on in their profile.
