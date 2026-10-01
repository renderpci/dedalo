# WC-2026-09-29-number-not-equal — number '!=n' is inequality, not '= 0'

- **Date:** 2026-09-29 (ported from the parked branch `wip/deep-search-semijoin`, f700760d44, where it was written 2026-09-24).
- **Decision:** none (a defect fix; recorded because shallow search output
  changes). Gates: `test/unit/builder_shallow_snapshot.test.ts` (the
  "number '!='" describe runs the SQL on real rows; the byte-identity leg
  exempts exactly the number '!=' cases and no others).

## Shape before

`builder_number` had no '!=' branch. `'!=5'` fell through to the default '='
branch, whose SEARCH-02 coercion turned the non-numeric `'!=5'` into `'0'`: a
"different from 5" search returned the records whose value is ZERO (and none
with 7). A bare `'!='` searched `= 0` too.

## Shape after

`'!=n'` (glued or in `q_operator`) = "has a value AND no value matches n":
`(<col> @? '$.<tipo>[*].value ? (@ != null)') AND NOT (<the '=n' predicate>)`.
The rest after `'!='` goes through the same grammar (`'!=1...5'` = not
between). A record without a value does not match (same as string `'!='`); a
record holding 7 and 5 does not match (some value is 5). `'!='` with no value
drops the clause. On a deep path the same leaf classifies `neq` (has `'*'`,
twin `'=n'`) — WC-2026-09-29-search-deep-leaf-mixed-rule.

## Reason

The old answer was not a narrower or wider reading of the question; it was a
different question. No client path depended on it.

## Gate reconciliation

No parity fixture replays a number `'!='`; no re-harvest needed.
