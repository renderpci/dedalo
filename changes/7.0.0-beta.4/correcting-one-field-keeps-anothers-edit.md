---
title: Editing one field and then correcting a typo in another no longer loses the first edit.
type: fixed
audience: user
date: 2026-08-19
---
A long text field commits its change half a second after you
stop typing. If, inside that window, you typed a character in any other field
and deleted it again, the page concluded that nothing was unsaved: closing the
tab or moving to another record then discarded the text field's edit with no
warning, no save and nothing in the console.

The page tracked unsaved work as a single yes/no answer for the whole
screen, and every field was allowed to write it. A field returning to its
stored value answered *no* on behalf of every other field, including ones
still holding work. Each field now reports only for itself, and the page
answers *yes* while any of them still has something unsaved — so the
save-before-leaving sweep and the confirmation prompt both run when they
should. A test now holds that a field may only ever retire its own answer.
