# WC-2026-09-30-password-policy-enforced — a component_password save that breaks the password policy answers `validation.password_policy`

- **Date:** 2026-09-30 (component_password rebuilt: live policy checklist,
  confirm field, explicit save; the policy moved from client-only advice to
  engine enforcement).
- **Decision:** ONE password policy, one evaluator:
  `client/dedalo/core/component_password/js/password_policy.js`, a pure module
  run by the browser AND by the server (`src/core/security/password_policy.ts`
  re-exports it). Gates: `test/unit/password_policy_native.test.ts`,
  `test/unit/password_hash_on_save.test.ts`, the client suite
  `test_component_password` (EDITOR block).

## Shape before (PHP)

`component_password::Save` hashed whatever arrived; the policy lived only in
the client (`validate_password_format`, 6–32 chars) and any API/MCP/import write
bypassed it. The recovery flow (`password_reset.weak_password`) and the
installer root step each carried their own `length < 8` check, so the three
doors disagreed on the minimum (6 vs 8). The TS port reproduced all of it.

## Shape after (TS)

`save` of a `component_password` whose changed_data carries a NEW plaintext
(not an Argon2 hash, not empty) that breaks a rule answers
`ok:false`, HTTP 400, `error.code: 'validation.password_policy'`,
`error.details: {rule}` — `rule` the FIRST broken rule id, in policy order:
`length` (8–64 code points), `lower`, `upper`, `digit` (Unicode classes),
`banned_chars` (`&`), `banned_words`, `sequence` (a run of 4 consecutive
letters/digits). Nothing is written. A replayed hash (import round-trip) and
the v6 re-hash migration are not judged.

`password_reset.weak_password` (code unchanged) and the installer root step
(`install.invalid_input`) now refuse by the same rules; the reset's log-only
coordinate is `{rule}` instead of `{min_length}`.

Client policy: `validation.password_policy` is `silent` in `CORE_POLICY` —
component_password renders the refusal in its own status line next to the
checklist.

## Reason

A policy the server does not enforce is not a policy, and a checklist the user
sees ticked green must be exactly what the engine accepts — one evaluator makes
the two identical by construction.

## Gate reconciliation

No parity gate replays a component_password save (the frozen store has no
password write). No fixture changes, no re-harvest. The TS-native gates above
carry the contract.
