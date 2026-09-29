# WC-2026-09-29-search-where-parts-parenthesized — every WHERE part is one parenthesized conjunct; a root `$or` filter no longer escapes the ACL

- **Date:** 2026-09-29 (`src/core/search/sql_assembler.ts`, `whereAll`).
- **Decision:** none (a security defect fix; recorded because the answer to a
  root `$or` search changes for scoped callers). Found by the review of
  WC-2026-09-29-search-deep-leaf-mixed-rule.

## Shape before (TS)

`buildSearchSql` renders the client filter tree to ONE WHERE part and ANDs it
with the section pin and the ACL parts (projects filter, dd478
filter_records, filter_by_locators). The filter tree parenthesizes only NESTED
groups, never the ROOT, and `sanitizeClientSqo` accepts a root `$or`. So

    { "filter": { "$or": [A, B] } }

rendered `WHERE pin AND A OR B AND acl`, which binds as
`(pin AND A) OR (B AND acl)`: branch A escaped the record ACL (a scoped caller
listed records of projects she does not hold), branch B escaped the section
pin (and, in a UNION branch, the branch guard). Measured on the suite
database: a scoped non-admin running `$or: [hidden value, visible value]` got
the hidden record back.

## Shape after (TS)

Every WHERE part is parenthesized where all parts meet (`whereAll`), so each
part is one conjunct whatever operators it contains:
`WHERE (pin) AND (A OR B) AND (acl)`. Every consumer of `whereAll` (page, count,
sparse-projects probe, filtered-ids CTE, browse-count signature) inherits it.

## Reason

A filter must only ever narrow the caller's visible set (SEC-02 search
refusal law); an operator in the client's tree must never widen it past the
ACL.

## Gate reconciliation

`test/unit/search_path_acl_native.test.ts` — "a ROOT $or filter stays inside
the section pin and the record ACL" (admin sees both records; the scoped
caller sees only her own). SQL text of every search gains parentheses; no
parity fixture compares SQL text, none re-harvested.
