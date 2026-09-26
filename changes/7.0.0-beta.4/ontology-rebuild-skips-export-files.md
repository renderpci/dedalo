---
title: Rebuilding an ontology no longer refreshes the export files, and is ~20× faster for it.
type: changed
audience: admin
date: 2026-08-11
---
*Regenerate* used to rebuild the LLM map for the **whole
installation** afterwards, whichever single hierarchy you had ticked. That map
is one of the files other installations download, and a rebuild refreshes none
of its companions — so keeping it alone current never made the published set
coherent, while costing 21 of the 22 seconds an operator spent waiting. The
files are refreshed by **Export**, which publishes all of them together.

!!! tip "If you rebuilt in order to publish"
    Press **Export** afterwards. That was already true of the ontology
    definition files; it is now true of the LLM map too.

This is also where the `dropped sqo target …` lines in the server log during
a rebuild came from — the whole-install map walk, reporting components that
point at ontologies this installation has registered but never imported.
They still appear on an export, and in normal editing of those components,
which is where they are actionable.
