---
title: The five migration panels (*Move TLD*, *Move locator*, *Move to portal*, *Move to table*, *Move lang*) show their definition files again.
type: fixed
audience: admin
date: 2026-08-18
---
Each opened
with no explanation text and an EMPTY file list, so there was nothing to
select and the transform could not be run at all. The engine had been serving
the body and the file list all along — the panel simply never asked for it.

Both bugs are the same invariant broken from opposite sides: a panel's value
load is a PAIR (the widget serves a value, the panel asks for it) and either
half alone is a broken panel. A gate now checks the pairing in both
directions for every maintenance widget, so a half-wired panel fails the
test suite instead of an operator's browser.
