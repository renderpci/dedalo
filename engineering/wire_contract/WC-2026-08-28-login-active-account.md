# WC-2026-08-28-login-active-account — login refuses a deactivated account (dd131 = No), and treats a MISSING datum as ACTIVE

- **Date:** 2026-08-28 (deep audit 2026-08-26, findings SEC-07 / SEC-08 / SEC-09 /
  SEC-14 / SEC-15; remediation row P1-4).
- **Decision:** DEC-15 (the refusal half is a parity REPAIR — PHP had it and TS lost
  it; the missing-datum half is a deliberate DIVERGENCE from PHP, argued below on
  measurement). DEC-12 (the gates land in the same change:
  `test/unit/account_revocation_native.test.ts`, plus the de-vacuumed dd131 fixture in
  `test/unit/permissions_audit_findings_native.test.ts`).

## Shape before (PHP, and TS through 2026-08-27)

**PHP** (`v7_php_frozen/master_dedalo/core/login/class.login.php`,
`active_account_check($section_id)`) refused an account whose dd131 'Active account'
radio did not point at dd64/1, in two places, and treated a MISSING datum as inactive
too (`:1102-1104`, `empty($active_account_data)` returns false).

**IT ALSO HAS A ROOT CARVE-OUT**, and this entry said twice that it did not. The
function opens with

```php
// root case
if( (int)$section_id===-1 ){
    return true;
}
```

at `class.login.php:1086-1088`. Re-read on 2026-08-28. The correction matters in both
directions: the root exemption below is **parity, not a divergence** (so this entry has
ONE divergence from PHP, not two), and a WC entry that files a parity behaviour as a
deliberate divergence teaches the next reader the wrong thing about what the frozen
engine did.

**TS** read dd132 (username) and dd133 (hash) and consulted nothing else.
`ACTIVE_ACCOUNT_COMPONENT` appeared in exactly ONE non-test file — `password_reset.ts`,
the RECOVERY path — so recovery honoured the flag and login did not. An operator could
deactivate an account, watch the recovery flow refuse it, and the account went on
logging in. The only NON-DESTRUCTIVE revocation an operator has was a total no-op; the
alternative was deleting the user record, which destroys the identity every audit row
references.

## Shape after (TS)

`login()` reads dd131 in the SAME `SELECT` that fetches the username and hash (a second
lookup could check one row's flag and verify another row's hash on an install with a
duplicated username — dd132 declares `unique`, but `duplicate_record.ts` bypasses
`saveComponentData` and therefore the unique check). Three states:

| dd131 | login | why |
|---|---|---|
| present → dd64/1 (`Yes`) | **allowed** | active, unchanged |
| present → anything else (dd64/2 `No`) | **REFUSED** | the operator's deactivation, finally honoured |
| absent, or an empty array | **allowed**, and shouted in the log | see below — this is the divergence |

The refusal happens **after** the Argon2id verify, so a deactivated account is not
distinguishable from a wrong password by an unauthenticated prober: same ambiguous
`LOGIN_FAILED_MESSAGE`, same cost. The activity row carries the real cause
(`Account is not active (dd131)`) for the operator.

**Wire effect:** a login POST for a deactivated account answers exactly as a wrong
password does — `ok:false` with the ambiguous message and no session token, where it
used to answer `ok:true` with a full session. No shape changed; the OUTCOME did, on the
most load-bearing door there is.

### The MISSING datum — the deliberate divergence, and the measurement behind it

Copying PHP here looks like the safe move. It is not: it is a **create-path outage
generator**. The shipped `dd131` ontology node carries no `properties.dato_default`
(seed line 5500, and the same on both installations read for this entry);
`record_defaults.ts` seeds only `dato_default`; the client `component_radio_button` has
no preselect; dd131 is not `mandatory`; and **nothing in `src/` writes dd131** — the
whole non-test census of the tipo was `password_reset.ts`. So **every user this engine
has created since the cutover is born with dd131 absent**, and "missing = inactive"
would refuse each of them at first login with a message that explains nothing.

MEASURED 2026-08-28, read-only, three corpora:

| corpus | dd128 records | dd131 absent | empty | Yes | No | of the "No", loginable today |
|---|---|---|---|---|---|---|
| suite DB `dedalo_v7_mht_test` | 1 (root) | 0 | 0 | 1 | 0 | — |
| shipped install seed | 1 (root) | 0 | 0 | 1 | 0 | — |
| live install `dedalo_v7_mht` | 24 | **0** | 0 | 8 | 16 | **0** |
| pinned `monedaiberica` snapshot (2026-07-11) | 75 | **0** | 0 | 37 | 38 | **0** |

So the REFUSAL half honours 54 already-intended deactivations across the two real
installations and locks out **zero accounts that can log in today** — none of those 54
carries an `$argon2` hash, and `auth.ts` already refuses a non-Argon2 hash. The MISSING
half would lock out zero existing records and every future one.

**The safe order is four steps. This entry ships 1 and 4a; 2, 3 and 4b are OPEN**, each
in a file outside the change that wrote this entry:

1. refuse a PRESENT dd131 pointing anywhere but dd64/1 — **SHIPPED**;
2. give the shipped `dd131` ontology node `properties.dato_default = [{section_tipo:'dd64',
   section_id:'1', type:'dd151', from_component_tipo:'dd131'}]`, so a created user is born
   Active through the ONE chokepoint (`record_defaults.ts`) and every door inherits it —
   list "+", tree "+", portal "+", both imports, both MCP write tools, portalize — **OPEN**;
3. a one-shot boot migration stamping dd131 = Yes on every dd128 record with
   `section_id > 0` and no dd131 datum, logging the count and the usernames it touched, so
   that afterwards "missing" genuinely means "someone removed the datum" — **OPEN**;
4. a) name every missing datum LOUDLY at login, with a once-per-process installation-wide
   count of the un-deactivatable population — **SHIPPED**;
   b) only after 2 and 3, treat missing as inactive — **OPEN, and it must not ship before
   them.**

### Root (dd128/-1) is exempt from the refusal — PARITY, not a divergence

`login::active_account_check()` returns true for `section_id === -1` before it reads
anything (`class.login.php:1086-1088`). TS does the same, for PHP's reason: root is the
installation's recovery identity, and if one mis-click on root's radio could refuse
root's login, the recovery story for a museum is "restore a backup". Root ships Yes in
the seed and IS Yes at both installations measured.

The exemption is also unreachable-by-escalation: no door writes root's dd131. Every
record-lifecycle door refuses a non-positive `section_id` AHEAD of the global-admin
bypass (`assertRecordWriteTarget`, SEC-05), and the ONE exception to that refusal — an
account editing its OWN record, see
`WC-2026-08-28-root-self-service-write.md` — covers only the four SELF_EDITABLE
components, of which dd131 is not one. A root marked inactive is shouted at every login.

## The revocation seam (same change — the reason this entry is not only about login)

Refusing a deactivated login is half of a revocation. The other half is that a
transition must END what is already live. Any transition of an account's identity or
authority now goes through ONE module, `src/core/security/revocation.ts`, whose
`revokeAccountAccess` ends the account's sessions, unlinks each session's MEDIA MARKER
and deletes its pending recovery codes.

**WHERE IT IS REACHED — the write CHOKEPOINT, not one door.** The first shape hung the
seam off `permissions.invalidatePermissionsForWrite`, reasoning that every write door
reaches it. It does not: `section_record/record_write.ts persistRecordKeys` called no
invalidation at all, so every account transition written through it —
`tool_propagate_component_data`, BOTH time-machine restore doors, `tool_translation`,
the observer mirror — revoked nothing AND left the security caches stale. The seam now
hangs off `persistRecordKeys` / `persistRecordColumns` themselves, beside the existing
`fireSaveEvent`, plus the one `saveComponentData` branch (the atomic insert) that
bypasses them, plus a SECOND named reach in `invalidatePermissionsForWrite` for
`relations/save.ts deletePortalLocator`, the one door that writes a dd128 relation key
with a direct `updateMatrixKeyData`. Gated by
`test/unit/dd128_write_census_tripwire.test.ts`, which derives every file calling a
record-write primitive and requires each to reach the seam or carry an enumerated,
shrink-only row.

**WHICH LANE.** A revocation is destructive and non-idempotent, so it rides
`registerCommitAction` (postgres.ts) — COMMIT-ONLY — and never `deferPostTransaction`,
whose documented contract is idempotent cache invalidation and which **replays on
ROLLBACK**. On the first lane a save that rolled back still logged every session of the
account out: an admin whose password edit FAILED had destroyed the target's sessions
anyway, and the audit trail recorded an edit that never happened. The two halves are now
split at the source — `clearSecurityCachesForWrite` (cache only, deferred lane) and
`invalidatePermissionsForWrite` (cache + revocation, commit lane) — so a caller cannot
pick the wrong one by accident. Gate: "the revocation rides the COMMIT-ONLY lane" in
`account_revocation_native.test.ts`, which rolls a real dd133 save back and asserts the
session, the marker, the recovery code AND the old password all survive.

**WHICH ORDER — MARKER FIRST, ROW SECOND.** Every path used to be
`DELETE … RETURNING media_key` with the caller looping `dropAuthMarker` afterwards. A
crash in between left NO session row and a LIVE marker — and the web server never
consults the session store, so that cookie kept read access to the entire digitised
archive, permanently, with nothing left to name it. The order now lives inside
`session_store.ts` (`endSessionRows`: SELECT, unlink, then DELETE **by token hash** —
the same rows the SELECT read), so no caller can get it wrong, and `dropAuthMarker` is a
STATIC import there rather than a registered hook (a hook is vacuous in exactly the
process that forgot to import the registering module). Unlink-then-delete fails the
right way: a crash leaves a session that still works.

**THE TRANSITION SET.** dd131 / dd132 / dd133 / dd244 — stated once, in
`revocation.ts ACCOUNT_TRANSITION_COMPONENTS`, and the gate fails if any other file
under `src/` spells all four out. dd1725 (profile), dd515 (developer) and dd170
(projects) deliberately do NOT fire it: they re-resolve per request through the caches
the same reaction drops, so ending sessions there would be a mass logout bought for no
revocation. `is_global_admin` is the ONE authority a session snapshots, which is why
dd244 is in the set (SEC-14).

- a dd128 record DELETE fires `revokeDeletedAccountAccess` at the delete doors (SEC-08).
- `getSession`'s two expiry branches unlink the marker they free, and — new since the
  reviewer round — **collection is now automatic**: `src/server.ts` starts an hourly
  `sweepExpiredSessions` (first run five minutes after boot) in the serving process
  only, never in a smoke boot or install mode, because the reconcile inside it unlinks
  every marker not backed by a live session and a smoke boot holds an empty throwaway
  store with the production `MEDIA_PATH`. Before that, a marker was collected only when
  the dead token was REPLAYED, or when a human opened the maintenance widget — so a
  session nobody touches again (a closed laptop; a STOLEN token whose thief stops using
  it) kept its marker forever.
- **THE ALREADY-ORPHANED MARKERS.** An installation running today carries one orphan per
  session that expired since the per-session credential shipped (2026-08-24). They are
  collected by the same scheduled sweep: `reconcileAuthMarkers(listActiveMediaKeys())`
  unlinks every marker that is not a live session's key, so the FIRST sweep after an
  upgrade clears the whole backlog in one pass. There is no migration to run and no
  operator step.
- `confirmPasswordReset` re-validates the account (exists + dd131 active) at confirm
  time, not only at request time (SEC-15).

**THE SELF-PASSWORD-CHANGE RULE.** The ACTING session survives its own account's
transition; every OTHER session of that account dies. Killing the session a curator is
using to change their own password is hostile and teaches people not to change
passwords; leaving the other sessions alive is precisely the compromise case, because
"someone else is logged in as me" is why the password is being changed. The acting
session is recognised by the request scope's own token hash and only when it belongs to
the account being revoked — so an ADMIN changing someone else's password keeps nothing,
and every session of the target dies. The hash is resolved at SCHEDULE time, while the
request scope is live, because the commit queue drains outside it.

**ONE SUPPRESSION EXISTS AND ONE MUST EVER EXIST.** The login-time password COST UPGRADE
(`auth.ts rehashStoredPassword`) rewrites dd133 with the SAME plaintext the user proved
they knew a millisecond earlier, on the login path, racing `createSession`. Unsuppressed
it would intermittently destroy the session the login is in the middle of issuing — a
correct password that sometimes does not log you in. It runs inside
`runWithoutAccountRevocation`, an AsyncLocalStorage scope (never a module flag, which
would leak into a concurrent genuine password change). Both halves are gated.

### What is already IN FLIGHT — stated, not left to be discovered

**A request already past the dispatch boundary completes with the authority it resolved
there, and that is ACCEPTED.** The principal and the session flags are read once per
request (`request_context.ts`) so one request cannot see two different answers to "who is
this" halfway through a save; re-checking mid-request would mean a transaction that
authorized a write at statement 3 and refused it at statement 7, leaving a half-written
record. The window is ONE REQUEST long: the next request presents a token whose row is
gone and is refused at the door, and its media cookie is already dead because the marker
was unlinked before the row.

**A LONG-RUNNING BACKGROUND JOB IS THE SAME ANSWER WITH A LONGER WINDOW, and it is the
honest residual.** A detached tool run (`tool_propagate_component_data`, the importers, a
diffusion job) carries the Principal it was launched with for its whole life; revoking
its owner mid-run does not stop it. What DOES stop it is the cooperative cancel every
`backgroundRunnable` action already honours (`ctx.signal`, aborted by
`dd_utils_api::stop_process` from the processes panel).

> **OPERATOR PROCEDURE for a compromised account — two steps, both required.**
> 1. Deactivate the account (dd131 = No) or change its password. This ends every live
>    session, unlinks every media marker and burns every pending recovery code, at the
>    moment the write commits.
> 2. **Open the processes panel and stop that account's running jobs.** A detached batch
>    already in flight keeps the authority it started with until it finishes or is
>    stopped. Step 1 does not reach it.
>
> Rotating ROOT's own password is now an in-engine action — see
> `WC-2026-08-28-root-self-service-write.md`.

## Reason

An operator's only non-destructive revocation must not be a no-op, and a heritage
institution's response to a compromised account ("deactivate it", "change its password")
must actually take the account's live credentials away — the session token AND the media
cookie that reads the whole digitised archive AND any recovery code in flight. Silent
loss of access control outranks convenience. It does NOT outrank a total login outage,
which is why the missing-datum half is decided by measurement rather than by parity.

## Gate reconciliation

No parity fixture covers the login POST outcome (the frozen store holds READ-path
responses; the write-path contracts are the TS-native `*_native` gates, DEC-14b), so
**no re-harvest is needed** — the WC-001 pattern does not apply because no fixture
asserts this door at all.

- `test/unit/account_revocation_native.test.ts` — the transitions × survivals matrix,
  TOTAL over `ACCOUNT_TRANSITION_COMPONENTS` by derivation; the three dd131 states; the
  two session-expiry branches; the self-vs-admin password rule; the two
  cost-upgrade-suppression proofs (including the concurrency one); **the LANE** (a real
  dd133 save inside a rolled-back transaction revokes nothing, and the same save
  committed does); **the ORDER** (the three BARE store functions — never through
  `session_media` — each leave no marker behind, so no caller is relied on); **the
  REACH** (`persistRecordKeys` itself revokes, and does not for a non-transition
  component); and **the automatic collection** (a marker with no session behind it is
  swept, a live editor's is not).
- `test/unit/permissions_audit_findings_native.test.ts` — its dd131 fixture used to
  stamp every scratch user Active unconditionally under a comment claiming the login
  path required it: prose asserting a rule the code did not have, plus a fixture that
  made its absence unobservable. dd131 is now a three-state fixture input and all three
  states are asserted, refusal included.
- `test/unit/root_user_hidden_tripwire.test.ts` — extended from the two scope FUNCTIONS
  to the three write DOORS (SEC-05), with the audit's precondition built rather than
  assumed: a real global admin holding level 2 on `(dd128, dd133)`. Also carries the ONE
  exception (`WC-2026-08-28-root-self-service-write.md`): root rotates its own password
  through the real save door, while dd244, dd132, duplicate and delete of -1 stay refused
  for every caller including root.
- `test/unit/dd128_write_census_tripwire.test.ts` — the door census for the own-record
  LEVEL rule (SEC-03); the REACH census (every record-write door reaches the revocation
  seam or carries an enumerated, shrink-only row); the assertion that the transition set
  is stated once; and a **BEHAVIOURAL leg** (GATE-24, `engineering/TRIPWIRES.md:72`):
  the gate builds a real principal whose profile grants level 2 on `(dd128, dd1725)` —
  the audit's precondition — and DRIVES `tool_propagate_component_data` at that
  principal's OWN user record, asserting the batch reports the refusal and the record is
  byte-unchanged. Before P1-2 that exact call succeeded.
