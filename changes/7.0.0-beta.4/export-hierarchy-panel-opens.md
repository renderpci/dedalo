---
title: The *Export hierarchy* maintenance panel opens again.
type: fixed
audience: admin
date: 2026-08-18
---
Selecting it in the
maintenance area refused with *"The 'export_hierarchy' panel is not available
on this engine"* and rendered nothing — which also put its working
*Sync hierarchy active status* action out of reach, since the whole card dies
with the failed value load. The panel now reports that hierarchy EXPORTING is
not offered by this engine (it wrote install dump files) and renders the sync
form, which is the operation it actually has.
