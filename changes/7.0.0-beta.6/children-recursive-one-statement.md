---
title: Searching a thesaurus branch with all its descendants costs the same however large the branch.
type: changed
audience: user
date: 2026-10-11
wc: WC-2026-10-11-children-recursive-one-statement
---
Expanding a term to all its descendants (the "with children" search, fixed filters, the tree) used to ask the database once per term of the branch — about 1,650 requests for a branch of 1,200 terms. The whole branch is now read in one request, in one consistent snapshot, with the same result. Sibling terms that share an internal number across two sections are now always listed in the same order (by section) instead of an order that could change between reads.
