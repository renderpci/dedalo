---
title: Removing a linked record from a portal now checks the portal field and the record's projects.
type: security
audience: admin
date: 2026-10-01
wc: WC-2026-10-01-delete-locator-write-door
---
Removing a linked record from a portal (the unlink button, and the "delete index" of the indexation tool) used to check only the section's permission. A profile that could edit the section but only read the portal field could still unlink from it, a record outside the user's projects could be changed, and a user manager could unlink their own profile, active or administrator flag. Removing a link now requires write access to that portal field and to the record itself (its projects), checked before anything is read or locked; a user manager can no longer unlink their own profile, active or administrator flag; and a record id of 0 or below is refused for every user, administrators included.
