---
title: Semantic search in the client
type: added
audience: user
date: 2026-07-22
wc: WC-047
---
A *"Search by meaning"* quick
input in the section-list toolbar and a semantic block in the search panel
(composes AND with the structured filter). Ranked hits pin the list via
`filter_by_locators` plus the new `{"mode":"locator_position"}` SQO order
entry, so relevance order survives pagination, counts and exports; an
SQO-derived pinned chip makes the state visible and clearable. Sections with
several embed groups get a facet selector (`dd_rag_api embed_groups`).
Search presets store the LIVE natural-language query and re-run it on Apply.
