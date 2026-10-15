---
title: The search pane on a phone: tap a field to add it, no drag needed
type: added
audience: user
date: 2026-10-14
---
Building a search filter used to mean dragging a field from the FIELDS list onto a search group. A touch screen never fires a drag, so on a phone the filter could not be built at all.

Every field in the list now carries a **+** button on a touch screen: tap it and the field is added to the search. Opening a group's **Add a field** slot still shows the FIELDS list, and the tap remembers which group the next field belongs to; the list closes once the field is added so the result is visible.

Below 1024px — **tablet and phone** — the pane stops being a three-column desktop: the TYPE / FIELDS / PRESET tabs become a row of chips above the region each controls, every panel and the filter canvas take the full width and stack in one column, and a drilled-in section list replaces the list it came from instead of opening a second column that ran off the screen. A long field name now ellipsizes instead of stretching the section sideways (the list is an auto table that grew past the screen, leaving the label overlapping the add and drill controls). The saved-search list (CONFIG) becomes compact one-line rows — name, apply, edit and delete, with a long name ellipsized — and its empty paginator strip is dropped, instead of the desktop four-column grid that squeezed it into unreadable slivers. A mouse keeps the drag exactly as before.
