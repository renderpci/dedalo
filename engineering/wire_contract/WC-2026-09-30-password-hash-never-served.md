# WC-2026-09-30-password-hash-never-served — a component_password value is served as the mask `****************`

- **Date:** 2026-09-30 (component_password rebuild; the gap the manual had
  documented as open since the TS port).
- **Decision:** a descriptor facet, `secretValue: true`
  (`src/core/components/types.ts`), read by `resolveComponentValue`
  (`src/core/resolve/component_data.ts`) — the one resolver every display door
  reads through: section read / `get_data`, the save response, the Time Machine
  history, portal list values, datalists, identify, term resolution. Gate:
  `test/unit/password_hash_on_save.test.ts` ("a stored credential is NEVER
  served") — red without the facet.

## Shape before (PHP)

PHP intended a mask (`component_password` `sample_value` `****************`).
The TS port served the stored item verbatim: every reader of the users section
(`dd128`) received the Argon2id hash (or a legacy v6 AES blob) of every
account — an offline-cracking gift, and the whole store for a v6 blob.

## Shape after (TS)

Each non-empty stored value is emitted as `SECRET_MASK` (`****************`),
the item's `id` (and `lang`) kept, on `value` and on `fallback_value`. An empty
or null value stays as it is, so "no password" remains distinguishable from
"a password is set". The engine reads the real value only where it must —
`auth.ts` verification (direct SQL) and the write path — never through that
resolver. The mask sent back cannot become a credential: it breaks the
password policy (`WC-2026-09-30-password-policy-enforced`) and is refused.

## Reason

A credential field is write-only by definition; the client needs to know only
whether one is set (component_password's idle status line reads exactly that).

## Gate reconciliation

No frozen fixture carries a component_password value (dd128 was never
harvested). No parity gate changes, no re-harvest.
