---
title: Moving, adding and reordering terms in the thesaurus tree is recorded in each term's history and updates its "modified by" and "modified date".
type: fixed
audience: user
date: 2026-10-11
wc: WC-2026-10-11-parent-link-cycle-every-door
---
Before, a change made in the thesaurus tree itself — dragging a term under another broader term, creating a narrower term with the tree's add button, or dragging terms into a new order — was stored without a trace: the term's history showed nothing, and its *modified by* and *modified date* still named the previous edit. Such a change could therefore be neither seen nor undone from the history.

Now each of these changes is recorded like an edit made in the form. The moved term's history shows the move as one change (its broader term before and after), the new position among its siblings is recorded too, and every term whose position changed shows who changed it and when. See [the thesaurus tree](./core/thesaurus/index.md).
