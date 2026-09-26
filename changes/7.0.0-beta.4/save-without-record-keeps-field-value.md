---
title: A field whose save comes back without its record keeps its value instead of emptying itself.
type: fixed
audience: user
date: 2026-08-19
---
When the answer to a save did not carry the record back —
the save itself having succeeded — the field threw away everything it knew
about what it was editing: the value on screen, and the copy it keeps to
decide whether anything has changed since. From that point the field looked
perfectly normal but had nothing left to save, every later edit was reported
as a change whether or not it was one, and the only notice of it was a console
line that appeared solely with developer mode on.

The field now keeps what it was editing, records that it is out of step with
the server, and says so unconditionally. While it is in that state it also
stops trusting its own record of what the server holds: its next save is
always sent, rather than being skipped as *nothing has changed* — so the
edit the server never confirmed is retried instead of being quietly dropped.
Tests hold all of this, including that the retry really goes out.
