---
title: Any component offering "every ontology" as a search target took 42 ms to configure — on every single request.
type: fixed
audience: admin
date: 2026-08-11
---
Resolving such a component's search
configuration enriches each target section it offers, and asked the database
twice per section whether it has a *new record* and a *delete record* button —
four times over for a section with neither. On an installation carrying 205
ontologies that is ~800 queries to draw one autocomplete, repeated on every
page that shows it, and nothing about the answers changes between requests.

The lookup is now remembered alongside the other ontology reads, so it costs
**0.64 ms**. Authoring a new button still shows up immediately — the memory
is dropped whenever the ontology is written, like every other ontology cache.
Building the LLM map, which resolves 9 408 such fields, went **21.7 s → 1.2 s**
on the same installation, producing a byte-for-byte identical file.
