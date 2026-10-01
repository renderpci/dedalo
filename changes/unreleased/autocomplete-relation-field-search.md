---
title: Autocomplete searches work again in pickers with a related-record field, and the field inputs search as you type
type: fixed
audience: user
date: 2026-10-01
wc: WC-2026-10-01-relation-search-display-paths
---

In an autocomplete whose search fields include a related-record field (for
example the ontology "Sobrescritura" picker, with its "Modelo" field), typing in
the main search box answered "No se ha podido completar la búsqueda". Such a
field is now searched through the values it shows, each with its own input
under the search box ("Modelo › Término", "Modelo › Código"): "section" there
finds the terms whose model is *section*. A related-record field that shows
nothing searchable (only an image, for example) no longer gets a search input.

The per-field inputs under the search box (Término, Código, tld…) also search
on their own a moment after you stop typing; before, the search waited until you
moved to another input.
