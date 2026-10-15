---
title: Large exports no longer load the whole selection into the server's memory.
type: changed
audience: admin
date: 2026-10-11
wc: WC-2026-10-11-export-buffered-cap-and-admission
---
An export now reads its records in pages from one consistent snapshot of the selection, instead of loading every record id before writing the first line, so a very large export uses the same memory as a small one. Two limits are now visible: the in-page (non-streamed) export answer is refused with *export.format_limit* above `DEDALO_SEARCH_CLIENT_MAX_LIMIT` records — the streamed and background exports serve the same selection — and each server process runs at most a quarter of `DB_POOL_MAX` exports at once (at least one), answering *export.busy* (retry shortly) to an export asked for directly beyond that, while a background export waits for its turn instead of failing. A server configured with `DB_POOL_MAX=1` cannot run exports; give it at least 2. A streamed export whose reader stops reading for 15 minutes is closed with *export.consumer_idle*, which frees its database connection; an export that keeps being read is never cut, however slow.
