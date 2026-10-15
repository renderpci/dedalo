---
title: The MARC21 and Zotero imports refuse a computed field, and an AI agent can remove one child of a thesaurus term.
type: fixed
audience: user
date: 2026-10-03
breaking: false
wc: WC-2026-10-02-relation-children-write-through, WC-2026-08-30-remove-requires-item-id
---
A field whose value is computed and never stored (a term's children, an inverse or index list, an external record) can no longer be the target of a MARC21 or Zotero import map. Before, an import mapped onto a term's children could quietly move records under another parent in the thesaurus. Now the whole import is refused before anything is written, and the message names the field and tells you what to import instead (for children: the parent, on the child records). The CSV import already worked this way.

An AI agent using the save tool can now remove one child from a term by naming the child record. Each removal is checked against the agent user's permissions and recorded in the Time Machine. On every other field, a remove still has to name the item id.
