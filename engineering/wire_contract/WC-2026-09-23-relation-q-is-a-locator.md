# WC-2026-09-23-relation-q-is-a-locator — a relation search q that is not a locator is refused, never dropped

- **Date:** 2026-09-23.
- **Decision:** none (AGENTS.md hard rule "never silently narrow scope" — here the
  silent failure WIDENED the answer). Gates:
  `test/unit/relation_search_builders.test.ts` ("relation q contract" describe +
  the relation_children invalid-q case), `test/unit/search_path_acl_native.test.ts`
  (its `component_select` leaf now carries a locator q).

## Shape before (PHP)

`extract_normalized_relation_q` replaced any q that was not a locator with `'[]'`
and logged an error; the clause then ran against `'[]'`. The TS port refused it
"quietly": `normalizeRelationQ` returned null, `buildRelationFragment` returned
`false`, and the clause was DROPPED. With a glued operator (`{q:'!*',
q_operator:null}`) on mdcat1003 (222,434 records) both `!*` and `*` counted the
WHOLE section — the count shortcut answered `SELECT 222434::int`.
`builder_relation_children` substituted `'[]'` (PHP-faithful), so `'!='` over it
matched every parent with children.

## Shape after (TS)

Relation operators travel ONLY in `q_operator`. q is either absent (`null`, `''`,
the client sentinel `'only_operator'` — search.js) or a locator / locator array,
as an object or its JSON string (the PHP wire shape). Anything else — a glued
operator, free text, a number, a nested array, malformed JSON — throws
`request.invalid` (HTTP 400, public message naming `q_operator`). A glued
operator was deliberately NOT added as a second spelling: no client emits it (the
client writes `q_operator`, `service_autocomplete.js`), no stored preset holds it
(`matrix_list` / `matrix_tools` scanned on two installs), PHP never parsed it.
relation_children refuses the same way for its value operators (`'*'`/`'!*'`
never read q).

## Reason

A dropped clause answers a different question with no signal — a curator's
"records with no author" became "all records". Loud refusal is the only honest
answer to an unreadable q.

## Gate reconciliation

No parity gate replays a non-locator relation q; no re-harvest needed. The one
unit gate that fed a text q to a `component_select` leaf
(`search_path_acl_native`) relied on the drop and now sends a locator.
