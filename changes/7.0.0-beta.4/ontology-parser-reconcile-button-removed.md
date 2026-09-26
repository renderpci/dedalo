---
title: The ontology parser's *Reconcile* button.
type: removed
audience: admin
date: 2026-08-11
---
The tool offered two writes onto
the runtime ontology — an incremental *Reconcile* that applied only what had
drifted, and *Regenerate*, which wipes the hierarchy's runtime nodes and
re-derives them. Reconcile's whole justification was that it never left the
ontology momentarily empty, and that stopped being true of Regenerate the day
the rebuild moved inside a single transaction: readers keep seeing the current
ontology until the new one commits, and a failure rolls back. What was left was
a strictly weaker write offered beside the stronger one, with nothing to tell an
operator which to press — and a second code path to keep in step with the
ontology parser forever.

**Regenerate is now the one write onto the runtime tree**, and *Refresh
status* still answers "what drifted" without changing anything. Ordering a
node no longer prompts the question the button existed to ask: reordering
genuinely changes every sibling that moved, so "only what drifted" was the
whole hierarchy anyway.
