# WC-2026-08-24-proxy-trust-and-password-cost — the client address stops being caller-declarable, and password cost stops being inherited

- **Date:** 2026-08-24.
- **Wire status:** NO response shape changes. Both items are recorded here because
  they change what an OPERATOR must configure and what a stored credential
  contains — the two things a wire-invisible change can still break on an
  installation.

## P2-4 — X-Forwarded-For is believed only on a transport that has a proxy

`clientIpFromRequest` resolved the address from the trusted hop of
`X-Forwarded-For` and never the spoofable left-most entry. The arithmetic was
right; it ran on **every listener**. On the direct TCP listener — the one a
browser reaches with no web server in front — the header is written by whoever
connected, so a client simply chose the value:

- a fresh **login-throttle bucket per request** (`buildThrottleKey` is keyed on
  this address), which is precisely the brute-force evasion the hop arithmetic
  exists to stop;
- attacker-chosen addresses recorded as fact in `dd544` activity rows;
- and since `install/gate.ts` matches the literal `127.0.0.1`, a **forgeable
  claim to be loopback**. The function's own comment read "this is never an
  authorization input"; that was not true.

A second bug in the same expression: `Math.max(0, len - hops)` clamped a SHORT
header to index 0 and returned its LEFT-MOST entry — the attacker's own value —
whenever fewer entries arrived than the operator declared hops.

**After.** `RequestContext` carries the transport's own `peerIp`
(`server.requestIP`) and whether a proxy is in front (`proxyTrusted`). The header
is read only on the declared transport; otherwise the peer address is used. A
short header is treated as forged (peer address, else the `proxy-malformed`
sentinel, which satisfies no loopback check). `createRequestContext` defaults
`proxyTrusted` to **false**, so no future caller inherits the spoofable path by
omission.

**New key `TRUSTED_PROXY_TRANSPORT`** (`socket` | `tcp` | `none`, default
`socket`). Operators of the documented topology need do nothing. An operator who
really does put a proxy in front of `SERVER_TCP_PORT` must set `tcp`, or their
requests are attributed to the proxy's address — degraded (one throttle bucket
per account, since the login key carries the username), not broken. The exception
worth naming: the password-reset VERIFY throttle is keyed by reset id, not
username, so a wrong hop count shares one bucket there.

Gate: `test/unit/proxy_trust_tripwire.test.ts`, mutation-verified against both
original bugs.

## P2-7 — Argon2 cost is stated, not inherited, and old hashes catch up

Every hashing site passed `{ algorithm: 'argon2id' }`. Two consequences:

- the cost of an institution's password hashes was a property of whichever Bun
  version was installed the day each account was created — silently different
  after a runtime upgrade, in either direction, with nothing in the repo
  recording what was actually used;
- and there was **no path back**. `isArgon2Hash` passes any `$argon2…` string
  through untouched (by design — it is what makes export→import round-trips and
  the v6 password migration work), so a hash made under weak parameters stayed
  weak forever: no login, no password change and no migration revisited it.

**After.** `src/core/security/argon2_params.ts` states `m=65536, t=3, p=1` once
(~90 ms on the pinned runtime; above the OWASP interactive floor on the memory
axis, one iteration above the runtime's own default). All six hashing sites
import it, the AUTHZ-03 decoy included — that one must stay cost-matched, because
`Bun.password.verify` costs what the STORED hash declares.

A successful verify is the one moment the plaintext exists, so that is where the
upgrade happens: `needsPasswordRehash` → `saveComponentData` (the one write door,
with its row lock, hashing gate and TM audit row), started inside the request so
the ALS context is captured, not awaited, and never able to fail a login.

**UPGRADE-ONLY.** A stored hash that is already stronger is never rewritten:
PHP's `password_hash(PASSWORD_ARGON2ID)` used `m=65536, t=4`, and those are
exactly the hashes an install carries from before the rewrite. A routine login
downgrading them would be a silent security regression.

**Operator-visible:** the first login wave after this lands rewrites `dd133` for
every account whose hash is below target — one transaction, one TM audit row and
one observer propagation each, spread over whenever people actually log in. A
password-change audit row per user is expected, not anomalous.

**KNOWN, BOUNDED, SELF-CLOSING WINDOW.** Raising `t=2 → t=3` means an account
that has not logged in since the upgrade verifies ~25 ms below the cost-matched
decoy — a weak residual signal that such an account exists. It is far below the
~70 ms-vs-0 ms gap AUTHZ-03 closed, bounded by the same two-dimension throttle,
and it closes per account at that account's next login. Pinning the decoy to the
old cost instead would simply invert the sign of the same signal for every
already-upgraded account. Recorded rather than papered over.

Gate: `test/unit/password_cost_tripwire.test.ts`, mutation-verified.
