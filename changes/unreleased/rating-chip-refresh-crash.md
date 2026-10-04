---
title: Applying a Time Machine value no longer breaks a record's rated portal.
type: fixed
audience: user
date: 2026-09-29
wc: WC-2026-09-29-select-family-mode-datalist
---
A portal whose items carry a rating (the coloured chip of a dataframe, such as
the certainty of an attribution) could stop rendering right after the Time
Machine tool applied an earlier value to it: the refresh failed and the portal
stayed broken until the page was reloaded. The server now sends the rating's
list of options with every copy of the rating it returns, so the chip always
finds its colour, and the portal refreshes normally after an apply. The client no longer
depends on it either: it picks the copy of the rating that carries the options,
keeps new items in the order the server sent them, and paints the default
colour instead of failing when a rating has no options.
