---
title: The profile permissions tree opens in a fraction of a second instead of several seconds.
type: fixed
audience: admin
date: 2026-10-02
---
Opening a profile record rebuilt the whole permissions tree (every area, section
and field of the ontology — some 13,000 entries) on every visit, with several
database queries per entry: 6–7 seconds on a real installation. The tree is now
built from one ontology query and kept per interface language and per set of
granted areas, so the first opening takes well under a second and later ones are
immediate. It is rebuilt automatically after any ontology change and after any
change to a profile or a user's profile assignment, so it never shows outdated
structure or another user's areas.

Siblings that share the same ontology order number now always appear in the same
order (by creation), where before their relative order could vary between
servers.
