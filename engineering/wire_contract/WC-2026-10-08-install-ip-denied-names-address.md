# WC-2026-10-08-install-ip-denied-names-address — the install-window refusal names the address it refused

- **Date:** 2026-10-08 (container install review: the browser wizard was unreachable
  on every container install, and the refusal gave the operator nothing to act on).
- **Decision:** none new; amends the refusal shape of
  `WC-2026-08-24-install-ip-gate-fail-closed.md` (the fail-closed default stands).

## Shape before (TS)

`install.ip_denied` (403) carried no `details`. The label read "The installer is not
allowed from this address" — without saying WHICH address. Behind a container proxy the
address the engine sees is never the one an operator would guess: Docker Desktop's
`192.168.65.1`, a Linux bridge gateway (`172.x.0.1`), or the workstation's real LAN
address, depending on host and network mode (measured 2026-10-08). The boot banner names
the allowlist in force; nothing named the address to add to it. The engine's own log
line for the refusal carried no coordinates either.

## Shape after (TS)

- Registry row `install.ip_denied` declares `details_keys: ['client_address']`.
- The gate (`src/core/api/dispatch.ts` `runInstallGate`) throws it with
  `details: { client_address }` — the trusted-hop address the dispatcher resolved — and the
  same value as a log coordinate, so the access-log refusal line names it too.
- Label `error_install_ip_denied`: "The installer is not allowed from this address
  (`${client_address}`). Add it to DEDALO_INSTALL_ALLOWED_IPS and restart Dédalo."

Envelope otherwise unchanged: same code, category, status (403), `retryable: false`.

## Reason

An operator locked out of their own wizard must be able to unlock it from what the
refusal says. Telling a caller its own address discloses nothing it does not already
hold.

## Gate reconciliation

`error_registry_native` + `labels_tripwire` hold the `details_keys` ↔ `${param}`
agreement. No parity fixture carries this code (the install surface is TS-native,
WC-004), so no fixture changes and no re-harvest question arises.
