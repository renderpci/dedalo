# WC-2026-08-24-install-ip-gate-fail-closed — the install-window allowlist defaults to loopback

- **Date:** 2026-08-24 (security audit finding P2-6).
- **Decision:** none new; follows the premise (a heritage installation must be
  safe by default, not conveniently insecure) and DEC-12 (tripwire or delete).
- **Supersedes:** the allowlist half of
  `WC-004-ts-native-install-surface-pre-auth.md`, whose "IP-gated by
  `DEDALO_INSTALL_ALLOWED_IPS` (unset = open, dev)" describes the shape this
  entry replaces. WC-004 is left untouched: it is the record of what was
  adopted on 2026-07-09, and history is not rewritten. Everything else it
  states — pre-auth while unsealed, 404 once sealed, the synthetic installer
  element, the session re-check on record-writing steps — still stands.

## Shape before (PHP, and TS until today)

PHP guarded the pre-auth installer with `DEDALO_INSTALL_STATUS` plus an
install-window IP allowlist whose UNSET state was open; the TS port copied that
default verbatim (`installIpAllowed` returned `true` for an unset or empty
`DEDALO_INSTALL_ALLOWED_IPS`). Entries were compared as exact strings, with one
token, `loopback`.

## Shape after (TS)

`src/core/install/gate.ts`:

- `installAllowPolicy(): { entries, source: 'default' | 'env' }` is the one
  reader. Unset, empty, or nothing-but-separators all collapse to
  `DEFAULT_INSTALL_ALLOW_ENTRIES = ['loopback']` with `source: 'default'` — an
  abandoned `DEDALO_INSTALL_ALLOWED_IPS=` line from a template can no longer
  read as a decision to expose the installer.
- Entry grammar: `loopback` (the exact spellings in `LOOPBACK_SPELLINGS`), a
  literal address (v4 or v6, IPv4-mapped forms folded), a CIDR block, and `any`
  — the ONE spelling that admits every address, never a default.
- `ipInCidr(ip, cidr)` is pure and total: it compares the first N bits of the
  packed address, and returns `false` for a malformed address, a malformed or
  absent prefix, a prefix wider than the family, or a cross-family pair. It
  never throws — an exception inside a pre-auth predicate is itself the
  vulnerability.
- `describeInstallAllowPolicy()` renders the effective policy for the boot log,
  next to the INSTALL MODE banner, so an operator locked out of their own wizard
  reads WHY instead of guessing at an env key.
- `src/core/error_report/gate.ts` now imports `LOOPBACK_SPELLINGS` and
  `ipInCidr` from this module, so there is ONE definition of "this machine" and
  one of a CIDR block. Its DEFAULT deliberately stays open: that receiver is off
  unless `DEDALO_ERROR_REPORT_RECEIVER=true`, is invisible when off, is
  throttled and token-checked, and exists precisely to accept reports from
  remote installations whose addresses cannot be enumerated in advance.

**The wire shape does not change.** The refusal is the already-registered
`install.ip_denied` (403, `perm` category), unchanged, and it carries **no
`details`**. That is a deliberate choice, not an omission: the caller is
unauthenticated, and echoing back either the address the engine resolved for
them (does a proxy sit in front? which hop is trusted?) or the policy source
(has the operator configured this key at all?) hands a prober two facts they
cannot otherwise obtain, in exchange for a diagnostic the legitimate operator
already has — on their own console, from the boot banner, where it discloses
nothing to anyone. `details_keys` in `src/core/errors/registry.ts` is therefore
untouched, and with it `master.json` and the `catalog/lg-*.json` translations.

## Reason

`persist_config` rewrites `../private/.env` and exits so the supervisor restarts
the engine into that configuration; `test_db_connection` spawns psql. Both are
reachable with no session while the instance is unsealed. A default that opens
that to every address is only ever right on a laptop, and it was silently wrong
on exactly the deployments where the browser wizard is the reasonable path: a
container stack, a VM, a hosted box. The convenience it bought — "the wizard
just works from another machine" — is precisely the property an attacker needs.

The cost is real and accepted: **a browser install from another machine now
requires the operator to name their address first.** Docker is the paradigm
case (the peer is the browsing machine, never loopback), so `docker-compose.yml`
itself passes `DEDALO_INSTALL_ALLOWED_IPS: ${DEDALO_INSTALL_ALLOWED_IPS:-}`
through with the explanation next to it — a documented requirement that the
shipped artifact cannot honour is not a fix.

## Honest limit (stated, not hidden)

`clientIp` is what `server.ts::clientIpFromRequest` resolved: the trusted-hop
entry of `X-Forwarded-For`, or the sentinel `'local'` when the request carried
no such header. `'local'` is a loopback spelling, so on a bare `SERVER_TCP_PORT`
listener with NO proxy in front, a remote peer is still admitted by the default
— the engine is not told who it is. This gate is a real lock behind the reverse
proxy the production guide prescribes, and the firewall remains the first lock
on a bare listener (`docs/install/production.md` 8.4.1 already says so). Closing
it properly means falling back to the real socket peer address instead of
`'local'`, which is a change in `src/server.ts` and is deliberately NOT bundled
into this one.

## Gate reconciliation

No parity gate diffs these actions, and the fixture store is untouched — no
re-harvest (the WC-001 pattern does not even apply; nothing on the wire moved).

- `test/unit/install_ip_gate_tripwire.test.ts` (NEW, registered in
  `engineering/TRIPWIRES.md` + `scripts/verify.ts`): the unset default denies
  every non-loopback address and admits each loopback spelling; `any` is the
  only open spelling and appears in no default; CIDR in-range allows,
  out-of-range denies, malformed denies without throwing; plus a PROSE SCAN over
  `docs/install/**`, `engineering/PRODUCTION.md`,
  `docs/development/ts_install_internals.md`, the generated config artifacts and
  the catalog source, so the documentation cannot drift back to "unset = open".
  The scan carries a positive control, so it cannot pass having matched nothing.
- `test/unit/tier1_install_native.test.ts` — the two cases that asserted the
  open default are INVERTED in the same change, not deleted.
- `test/unit/install_gate.test.ts` — unchanged and still green: its anonymous
  context is `'local'`, which the new default admits.
