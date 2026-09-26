---
title: Text you have typed but not yet confirmed is now protected when you reload or close the tab.
type: fixed
audience: user
date: 2026-08-19
---
Typing into a field and reloading the page dropped the
typing with no warning: no prompt, no save, nothing in the console. It
happened in most field types — plain text, dates, numbers, e-mail, passwords,
coordinates — while long text fields were unaffected, which is what made the
loss look arbitrary.

The page only counted a field as unsaved once the field had *confirmed* its
value, and most fields confirm on leaving the field. Reloading or closing a
tab never leaves the field, so the page believed there was nothing to
protect. Unconfirmed typing now counts from the first keystroke, and leaving
the page forces the field you are in to confirm first — so a real edit
raises the browser's leave-page warning and can still be saved, while typing
you have already undone raises nothing.

Only fields that hold record data in edit mode are watched: search boxes,
list cells and the lookup box inside a related-records field are not your
unsaved work and never trigger the warning. A test now types into every kind
of field, for every component, and fails if any of them can be reloaded away
unnoticed.
