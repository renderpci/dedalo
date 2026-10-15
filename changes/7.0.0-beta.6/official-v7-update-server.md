---
title: The official update server for v7 installations is v7.master.dedalo.dev.
type: changed
audience: admin
date: 2026-09-30
---
Code and ontology updates are now split by version. v7 installations update from `https://v7.master.dedalo.dev/dedalo/core/api/v1/json/` — the address the configuration examples for `CODE_SERVERS` and `ONTOLOGY_SERVERS` now show. v6 installations keep updating from their own server exactly as before; a v7 update server answers only v7 installations.

For an installation that serves updates to others, the suggested layout keeps the release archives in `/srv/dedalo/code` (`DEDALO_CODE_FILES_DIR`) and the ontology files in `/srv/dedalo/ontology` (`ONTOLOGY_DATA_IO_DIR`), next to the media in `/srv/dedalo/media`. Nothing changes for an installation that leaves these settings unset.
