# WC-2026-09-05-preauth-intake-bounds — an unbounded request is refused, and an audit row is a note about an action

- **Date:** 2026-09-05, adopted with the change that closes audit row P2-9
  (findings SEC-21 CONFIRMED-by-measurement, SEC-20, PUB-14).
- **Decision:** DEC-12 (the invariants land with their gates:
  `test/unit/rqo_scalar_bound_tripwire.test.ts`,
  `test/unit/store_retention_tripwire.test.ts`,
  `test/unit/activity_row_bound_native.test.ts`).

## Shape before (PHP)

PHP's `dd_manager::sanitize_client_rqo` bounded nothing by length: the RQO's
scalars were whatever arrived, and the options bag was an untyped array. The TS
port copied that faithfully — `rqoSchema` declared 54 bare `z.string()` fields
and `options: z.record(z.string(), z.unknown())`.

The login activity row was PHP's too, and it carried the attempted username
TWICE: once inside the sentence

    "Denied login attempted by: <username>. <cause>"

and once as the payload's own `username` field.

Neither engine ever pruned `matrix_activity`, and the TS-only dd1758 publication
ledger inherited the same silence.

## Shape after (TS)

1. **Every request scalar declares a maximum** (`src/core/concepts/scalar_bounds.ts`,
   applied across `rqo.ts` / `sqo.ts` / `ddo.ts`), and the untyped `options` bag
   carries a key-count and a serialized-byte ceiling (512 KiB — deliberately 2×
   the error-report intake's own 256 KiB payload cap, which travels through this
   very bag). Record CONTENT is unaffected: it travels in `rqo.data`, which stays
   unbounded because a heritage record legitimately is large.

   **A door's bound is never tighter than the behaviour the engine ships.** The
   bag ceiling applies to the UNDECLARED remainder of `options`; a key whose
   owning handler declares its own, larger, measured cap is charged against a
   per-key budget instead (`OPTIONS_KEY_BUDGETS`). Today that is
   `options.images` (assistant/MCP attachments: `dd_mcp_api` accepts 8 images,
   7,000,000 base64 chars each, 21,000,000 in total — a single ~750 KB
   photograph would otherwise have been refused at the parse door and image
   based assistant chat and object identification by photo would simply have
   been dead), `options.image` — SINGULAR, `dd_identify_api`'s only inbound
   photograph for identification by image, capped there at 8 MiB decoded
   (`MAX_IMAGE_BASE64_CHARS` ~11,185,432 on the wire) — and `options.history`
   (64 entries, 262,144 bytes of text). The `image` budget was MISSED in the
   first round and every realistic photograph was `request.invalid_rqo` until it
   was added; the gate's per-key leg is therefore a TOTAL census over the handler
   tree — every exported cap above the remainder ceiling must have a key the
   handler reads whose budget is `>=` it — so the next door with its own cap
   cannot regress the same way, and raising a handler cap without raising the
   budget is RED rather than a silent 400 in production. Widening is therefore per key and reasoned, never a hole
   in the bag: the same bytes under an undeclared key are still refused.

   A request that exceeds a bound is **REFUSED**, not truncated: one uniform
   `request.invalid_rqo` at the single parse door (`server.ts`), for every caller,
   authenticated or not, before any handler, any log line and any INSERT. Storing
   a silently shortened version of what a caller sent is a lie in an audit trail.

2. **The login activity payload keeps the untrusted string once.** `msg` is now
   `"Denied login. <cause>"`; the username lives in the `username` field, which
   is what it means. The success sentence is unchanged.

3. **An activity row is bounded at the store** (`activity_log.ts`
   `boundActivityData`): every string in a dd551 payload is truncated to 512
   characters WITH A MARKER naming the original length, and a payload still over
   8 KiB is replaced by a note listing its keys. The row's other caller-
   influenced strings — dd544 (the client host, which arrives from a proxy
   header hop) and dd546 (the tipo) — carry the same ceiling: a stored string a
   caller can influence at all is a stored string with a bound. Here truncation is right where
   refusal was right above: an audit row that fails to write is an action nobody
   can see afterwards.

4. **Every append-only store states a retention rule** it can execute
   (`src/core/retention/`): `matrix_activity` and the dd1758 ledger gain a
   configurable window with a real prune (`DEDALO_ACTIVITY_RETENTION_DAYS`,
   `DEDALO_DIFFUSION_LEDGER_RETENTION_DAYS`, both defaulting to 0 = keep
   everything), the error-report store gains a ROW CEILING beside its age window
   (`DEDALO_ERROR_REPORT_MAX_ROWS`, evicting oldest-first), and the stores kept
   permanently say why. dd1758 rows still owing an unpublish are never pruned.

5. **A source-global login bucket** (`LOGIN_SOURCE_MAX_ATTEMPTS`, an operator
   config key with the same shape as its two siblings — the address behind a
   large institution's NAT is exactly the case that must be able to raise it)
   joins the (username, ip) and (username) ones, and the shipped nginx configs
   declare a `limit_req` rate ceiling on the API location.

6. **A client-supplied `ddo_map` is bounded in entries and in log lines.** It
   was `z.array(z.unknown())` with no ceiling and one `console.warn` per DROPPED
   entry, so one in-bounds body amplified into unbounded log output — the same
   defect class in the log instead of the database. It now declares its element
   type (a union of `ddoSchema` and a described-unusable branch, so the ddo
   bounds are REACHABLE from the parse-door schema tree and therefore covered by
   the census), carries `SCALAR_BOUNDS.ddoMapEntries` (2048), and shows the
   first `ddoMapWarnings` (5) drops plus one summary line. The per-entry
   resilience — drop the unusable entry, never the request — is unchanged.

## Reason

Measured in-process on the suite database: a login POST with a 32 MiB username
stored **67,109,061 bytes** in `matrix_activity` in 3.16 s — 2.05× the wire size,
because the string was kept twice — and did so on every denial path INCLUDING the
throttled one, so the throttle refused the login and paid the storage anyway. The
old throttle keys both start from the username, so a caller rotating usernames
minted a fresh bucket on both dimensions at every request. At the body ceiling
that is ~512 MB of permanent database per unauthenticated request, inside the
database `pg_dump` copies on every backup: an availability defect that becomes a
recovery defect.

The same amplification had a second, durable path that is not `matrix_activity`:
the throttle key is built by concatenation and INSERTed into
`login_attempts.attempt_key` (plus its index) on every denial. BOTH of its
untrusted components are now projected through one bounded, stable, distinct
identity function at the construction site — the username AND the source, which
under a trusted-hop count >= 2 is a caller-written X-Forwarded-For hop, so the
caller owns its length up to Bun's header cap. Throttle semantics are unchanged
(`login|acct|bob` is still `login|acct|bob`); only an absurd component becomes a
digest.

The dd1758 half is the same shape by drift rather than by attack: one row per
record per publish run, forever, measured at 293 MB for a single 500k-record run
— while the engine prunes its own job rows at 7 days and justifies doing so by
naming this ledger as "the durable audit trail".

## Consumer impact

- A client that sent a scalar longer than its bound now gets
  `request.invalid_rqo` where it used to get a result. No shipped client does:
  the bounds are sized from the vocabulary (a tipo is `<tld><digits>`, a lang is
  `lg-xxx`), and the one legitimately large payload that travels in `options` —
  a 256 KiB error report with its inline screenshot — is explicitly under the
  bag ceiling and covered by a gate leg.
- An assistant/MCP `agent_chat` caller is unaffected: the handler's own caps
  (media type, per-image length, attachment count, history entries) still run and
  are still the tighter, semantic check.
- The stored and served dd551 payload of a DENIED login changes text. It is read
  by the activity list and the `user_activity` widget, both of which render the
  payload as data; nothing parses the sentence.

## Gate reconciliation

No parity gate replays a login denial payload or an RQO length: the frozen
fixture store holds successful reads, so **no re-harvest is needed** (the WC-001
pattern does not even have to be invoked — no fixture carries the affected
shape). The TS-native twin that DID pin the old sentence,
`test/unit/activity_log_native.test.ts`, is updated in the same commit and now
asserts the once-only shape.

New gates: `rqo_scalar_bound_tripwire` (TOTAL census over the string leaves of
the parsed RQO schema tree — walking BOTH sides of a `z.pipe`, which is what
makes the ddo contract visible at all — plus the parse-door outcome, the
a TOTAL per-key budget census over the handler tree (every exported cap above
the remainder ceiling must have a key that can carry it),
the ddo_map entry and log-line ceilings, the pre-auth door set
derived from `NO_LOGIN_ACTIONS`, and the shipped nginx rate ceiling),
`store_retention_tripwire` (TOTAL census over every `INSERT INTO` site under
`src/`, each classified by a registry entry or a reasoned exemption), and
`activity_row_bound_native` (behavioural, suite database: one bounded row per
oversize denial, the throttled path included, and the prunes deleting planted
aged rows while the pending publication debt survives).
