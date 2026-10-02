---
title: Adding or removing a term's children from its Children field now saves.
type: fixed
audience: user
date: 2026-10-02
wc: WC-2026-10-02-relation-children-write-through
---
A Children field lists the records that name this one as their parent. Linking a
record there, removing one, or emptying the field looked accepted but changed nothing:
the field showed the old children again and no record was re-parented. Each change now
updates the Parent field of the child records themselves, as the thesaurus tree does —
a new child gets this record as its parent (and its place at the end of the siblings),
a removed child loses it. Each child's change is checked against your permissions on
that child, recorded in its history, and undone by **Revert the bulk process** when it
was part of a batch run. A link that would make a record its own ancestor is refused
with an error, and the children cannot be reordered by dragging in this field (each
child keeps its own order, as in the tree).

Three batch tools no longer touch a Children field: **Update cache** skips it (it holds
nothing to regenerate), **Propagate component data** refuses it, and a CSV import
refuses a column mapped to it — import or propagate the Parent field on the child
records instead. Administrators can remove the leftover
bytes the old behaviour stored with `bun scripts/relation_children_orphan_sweep.ts`
(a dry run that lists them; add `--apply` to remove them).
