---
title: Serving your ontology to other installations now has its own maintenance panel, Serve Ontology.
type: changed
audience: admin
date: 2026-09-28
wc: WC-2026-09-28-maintenance-serve-ontology-widget
---
The **Update Ontology** panel used to do two jobs: download an ontology from a master server, and — folded away at the bottom — report whether this installation can serve its own ontology to others. The two are now separate panels. **Update Ontology** only downloads; the new **Serve Ontology** panel shows the three `../private/.env` settings that decide serving (`IS_AN_ONTOLOGY_SERVER`, `ONTOLOGY_SERVER_CODE`, `DEDALO_CORS_ALLOWED_ORIGINS`), the lines to add, and the address other installations must register.
