---
title: A search whose conditions are joined by OR at the top level no longer returns records outside the user's projects.
type: security
audience: user
date: 2026-09-29
wc: WC-2026-09-29-search-where-parts-parenthesized
---
When every condition of a search was joined by OR (for example "title contains
X **or** title contains Y"), one of the conditions was checked without the
user's project restrictions and the other without the section being searched.
A user limited to some projects could therefore see records of projects they
do not hold. The conditions are now always kept inside those restrictions.
Administrators without project restrictions see no difference.
