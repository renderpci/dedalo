---
title: Related-record lists answer one bounded page, and say so when they cut it.
type: changed
audience: developer
date: 2026-10-11
wc: WC-2026-10-11-relation-reads-client-page
---
The *Referencias* list (`read` with `source.action` `get_relation_list`), the tools' related-records listing (`related_search`) and the thesaurus indexations grid (`get_indexation_grid`) used to read an absent limit or `limit: 0` as "every record", and answered a malformed limit or offset (`'all'`, `1e21`) with a server error. Every client window is now bounded by `DEDALO_SEARCH_CLIENT_MAX_LIMIT`: an absent, zero or out-of-range limit becomes the ceiling, an offset past the end returns an empty page, and the answer carries a `search.page_clamped` notice naming the window asked for and the one served — for an absent limit, only when a record the caller may see lies past the page (records outside the caller's sections or projects never decide it). An indexation cell embedded in a record read is bounded the same way. The same bound applies to every API request at the parse door. A non-administrator's page may hold fewer rows than the limit while more pages exist (rows outside the caller's projects are dropped after paging): page by offset until an empty page.
