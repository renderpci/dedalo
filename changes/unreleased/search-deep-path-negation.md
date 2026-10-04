---
title: Searches through a related section now answer negations and combined conditions correctly.
type: fixed
audience: user
date: 2026-09-29
wc: WC-2026-09-29-search-deep-leaf-mixed-rule, WC-2026-09-29-number-not-equal
---
A search condition that looks inside a related record (for example *Movements →
Municipality*) now means what it says:

- **Negations mean "none".** "Does not contain X", "is empty" and "different
  from X" now return the records where *no* related record matches. Before, a
  record linked to one matching and one non-matching record was returned too,
  so the result was silently too large (on one installation, 38,749 records
  instead of 18,635).
- **Two conditions on the same field** joined with AND can now be met by
  different related records: "Municipality = Madrid AND Municipality =
  Valencia" finds people with one movement to each. Before it always found
  nobody.
- **Conditions on different fields** joined with AND still describe the same
  related record: "Municipality = Madrid AND Year = 1939" finds a movement to
  Madrid in 1939, not one to Madrid and another in 1939.
- A number search "different from *n*" now returns the records whose value is
  not *n*. Before, it returned the records whose value is zero.
