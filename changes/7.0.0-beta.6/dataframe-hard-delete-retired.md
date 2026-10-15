---
title: Removing a dataframe frame no longer deletes the frame's target record.
type: fixed
audience: user
date: 2026-09-29
breaking: false
wc: WC-2026-09-29-dataframe-hard-delete-retired
---
Since the late-September update, removing a frame (a valuation rating, say)
from the frame window, or removing the value it qualified, deleted the frame's
target record whenever the ontology slot carried the old `hard_delete: true`
flag. That flag was retired on purpose in v6, because the Time Machine needs
the target to show past states. It is ignored again: a removed frame is only
unlinked, and its target record stays.

Targets deleted during that window can be recovered from the Time Machine.
Ontology authors who want frame-private targets emptied on unlink can set
`"dataframe": {"delete_policy": "delete_target"}` on the slot. The data is
cleared and the record is kept.
