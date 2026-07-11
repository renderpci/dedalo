# component_password

## Overview

```json
{
    "could_be_translatable" : false,
    "is_literal": true,
    "is_related": false,
    "is_media": false,
    "modes": ["edit","list","tm","search"],
    "default_tools" : [
        "tool_propagate_component_data",
        "tool_time_machine"
    ],
    "render_views" :[
        {
            "view"    : "default | line",
            "mode"    : "edit"
        },
        {
            "view"    : "mini | print",
            "mode"    : "edit"
        },
        {
            "view"    : "default | text | mini",
            "mode"    : "list"
        }
    ],
    "data": "object",
    "sample_data": {
        "lg-nolan": ["$argon2id$v=19$m=65536,t=4,p=1$..."]
    },
    "value": "array of strings",
    "sample_value": ["****************"]
}
```

!!! warning "Real values are never transmitted — PHP only; TS does not mask yet"
    `sample_value` above is intentionally the fake mask, and that is still the
    PHP contract: `component_password` is a write-only credential field, and
    every PHP read path (API datum, grid/list, export, diffusion) returns the
    `fake_value` mask `****************` instead of the real hash.

    **The TS server does not implement this masking yet.** No module under
    `src/` substitutes a mask for the stored value on read — `readComponentItems`
    (`src/core/resolve/component_data.ts`) returns the stored item array
    verbatim for every model, and there is no `component_password`-specific
    override. Until this is ported, a section/get_data read of a
    `component_password` node on the TS server returns the **real Argon2id hash**
    to any caller with read permission, not the mask. Treat this as an
    open security gap (see `rewrite/STATUS.md`), not as documented behaviour to
    rely on.

## Definition

`component_password` is a literal-direct component that stores a single user
credential securely. Descriptor-wise it is unremarkable — the TS server has no
class hierarchy, and `src/core/components/component_password/descriptor.ts`
stores its data in the same `string` matrix column as
[component_input_text](component_input_text.md), read/written by the same
generic engines. What makes it security-critical in PHP is three behaviours
layered on top of that plain string storage:

1. **One-way hashing on write.** Plaintext entered by the user is hashed with
   Argon2id (`password_hash($plaintext, PASSWORD_ARGON2ID)`) in `set_data()` before
   it ever reaches the section/DB. The stored value is non-reversible.
2. **Masked on every read.** The component never emits its real stored value. The
   JSON controller, grid/list views, export atoms and diffusion all substitute the
   constant `fake_value` (`****************`).
3. **Verification, not equality.** Because Argon2id incorporates a random salt, two
   hashes of the same password differ. Comparison must go through
   `component_password::verify_password()` (constant-time), never a string equality
   check.

!!! danger "TS status: (1) and (3) exist in the auth path only, (2) is unported"
    The TS server's **auth flow** (`src/core/security/auth.ts`) independently
    re-implements (3) — it verifies with `Bun.password.verify()` (native
    Argon2id) — but nothing under `src/` implements (1) (hashing on write; see
    [Notes](#notes)) or (2) (read-time masking; see the warning under
    [Overview](#overview)) as a property of the `component_password` model
    itself. The safety net today is that the users section (`dd128`) cannot be
    read through the generic raw-view endpoint
    (`src/core/api/raw_view.ts` hard-denies it), not that the component masks
    itself.

**Why it exists.** Dédalo needs to authenticate users without ever holding a
recoverable copy of their password. In PHP this component is the single place
that owns the credential lifecycle (hash, store, verify, lazily upgrade legacy
values); in the TS server the verify step has moved into the dedicated auth
module (`src/core/security/auth.ts`), and the rest of the lifecycle (hash on
write, read-time masking, legacy upgrade) has not been ported onto the
component read/save path yet — see the gaps called out throughout this page.

**When to use it.** Only for actual secret credentials that must be verified but
never displayed — most prominently the user account password field
[dd133](https://dedalo.dev/ontology/dd133) (`DEDALO_USER_PASSWORD_TIPO`) inside the
users section. In a cultural-heritage install this is the back-office account
password for catalogers, archivists or external contributors logging into the
repository.

**When not to use it.** Never for data you need to read back. It is not a generic
"hidden" or "obfuscated" text field — once saved, the plaintext is gone forever.
For ordinary text use [component_input_text](component_input_text.md); for an API
token or external identifier you need to retrieve, use a normal literal component,
not this one.

## Data model

**Data:** `object` with language as property (always `lg-nolan` — see below).

**Value:** `array` of `strings`, or `null`. Each string is a stored *credential*
(an Argon2id hash for current data, or a legacy AES blob for not-yet-upgraded data).

**Storage:** Like every string component, the persisted unit inside the matrix
`data` column is an array of items `{id, value}`. `component_password` is forced
non-translatable: in `__construct` it sets `$this->lang = DEDALO_DATA_NOLAN` before
calling the parent, so the language is always `lg-nolan` and there are no per-lang
rows.

Stored shape (current Argon2id hash):

```json
{
    "lg-nolan" : ["$argon2id$v=19$m=65536,t=4,p=1$c29tZXNhbHQ$RdescudvJCsgt3ub+b+dWRWJTmaaJObG"]
}
```

Legacy reversible AES blob (base64), still readable during the migration window and
upgraded to Argon2id on the owner's next successful login:

```json
{
    "lg-nolan" : ["SzlpYmp6TXg5VEN4RDVRZnVPMU9yVStjZWJmYVV1M003aDM3bVAremVxcz0="]
}
```

!!! note "What the client/API actually receives — PHP behaviour, not yet TS"
    In PHP, on read the JSON controller keeps the real entry `id` but replaces
    the value with `fake_value`, so the datum `data` item delivered to the
    front end is always `{ "id": 7, "value": "****************" }`. **The TS
    server has no such substitution** — see the danger note above. The verified
    TS sample at `src/core/components/component_password/samples/data.json`
    is the flat item array `[{"id":7,"value":"<hash>"}]` with no `fake_value`
    step applied anywhere in the pipeline.

## Ontology instantiation

Define a `component_password` as an ontology node like any other literal component.
The minimal node JSON:

```json
{
    "tipo"         : "dd133",
    "model"        : "component_password",
    "parent"       : "dd119",
    "lg-eng"       : ["Password"],
    "lg-spa"       : ["Contraseña"]
}
```

- `model` must be `component_password`. On instantiation the factory derives the
  model from `ontology_node::get_model_by_tipo`; a mismatch is force-corrected.
- `translatable` is effectively ignored at runtime — the class hard-forces
  `lg-nolan`, so `could_be_translatable` is `false` and there is no `tool_lang`.
- Wire it into a section by giving it a `parent`/`section_tipo` that resolves to the
  owning section (for the canonical case, the users section
  `DEDALO_SECTION_USERS_TIPO`). `section_tipo` is mandatory on `get_instance`
  (auto-resolution was removed; empty returns `null`).

A realistic `properties` block for this component is typically empty — the sample
context ships `"properties": {}`:

```json
{
    "properties" : {},
    "css"        : null
}
```

The PHP snippet above (`component_common::get_instance('component_password', ...)`
inside `login::Login()`) has no TS equivalent to instantiate — there is no
per-component object to construct. The TS auth flow reads the stored hash
directly with a parameterized SQL query against `matrix_users` and verifies it
with `Bun.password`:

```ts
// src/core/security/auth.ts (findUserByUsername, abridged)
const rows = await sql.unsafe(
    `SELECT section_id, string FROM matrix_users
     WHERE section_tipo = $1 AND string->$2 @> $3::text::jsonb LIMIT 1`,
    [USERS_SECTION_TIPO, USERNAME_COMPONENT, JSON.stringify([{ value: username }])],
);
const passwordHash = rows[0]?.string?.[PASSWORD_COMPONENT]?.[0]?.value ?? null;
// ...
const verified = await Bun.password.verify(password, passwordHash);
```

`USERS_SECTION_TIPO` (`dd128`) and `PASSWORD_COMPONENT` (`dd133`) are the same
ontology tipos as `DEDALO_SECTION_USERS_TIPO` / `DEDALO_USER_PASSWORD_TIPO` in
PHP.

## Properties & options

`component_password` reads **no component-specific ontology properties**. The sample
context ships an empty `properties` object, and the class never calls
`get_properties()` to alter its behaviour. Standard `component_common` framing
properties (e.g. `css`, `request_config`) still apply through the common datum
`context`, but there are no password-only options to configure.

!!! note "Validation is client-side and not ontology-driven"
    Password format rules (length `[6, 32]`, at least one lowercase, one uppercase,
    one numeric, banned words/chars, sequential-character ban) live in the JS model
    method `validate_password_format(pw, options)` in `component_password.js`. They
    are applied before save in `handle_password_change()`. These are JS option
    defaults, **not** ontology properties; if you need different policy, verify in
    the JS model rather than the ontology node.

There are no deprecated component properties. The only deprecated API surface is the
PHP helper `encrypt_password()` (the legacy reversible AES path), kept solely so the
lazy-upgrade login flow can recompute legacy values for comparison — do not call it
from new code.

## Render views & modes

Modes (the same four `component_common` modes): `edit`, `list`, `tm`, `search`.
In the JS model both `list`, `tm` and `search` resolve to the list renderer, so all
non-edit modes render the masked read-only output.

| view | mode | renderer | output |
| --- | --- | --- | --- |
| `default` | edit | `view_default_edit_password` | `<input type="password">` pre-filled with the mask; `autocomplete="new-password"` |
| `line` | edit | `view_default_edit_password` (no label node) | same input, compact wrapper |
| `print` | edit | `view_default_edit_password` (forces `permissions=1`) | read-only masked `content_value` |
| `mini` | edit / list | `view_mini_password` | masked mini wrapper |
| `default` | list | `view_default_list_password` | masked list wrapper |
| `text` | list | `view_text_list_password` | masked `<span>` text node |

!!! note "Edit input behaviour"
    The edit input shows the mask `****************` as its initial value. On
    `change`, `handle_password_change()` validates the typed value, builds a frozen
    `changed_data_item` and calls `change_value(... refresh:false ...)` to save
    immediately. `click`/`mousedown` propagation is stopped so the input does not
    trigger row selection. Empty input is treated as a `remove` action.

The CSS surface is minimal (`component_password.less`): `view_default` content-data
hook and `view_line` set to `display: block`.

## Import / export model

!!! danger "Gap: none of this is masked or hash-aware in the TS server"
    Everything in this section is the **PHP** contract. TS export runs through
    the same generic `resolveCellValue()` / `tool_export.ts` path as any other
    string component — it has no `fake_value` substitution, so a
    `component_password` column exported through the TS server today would leak
    the real hash. TS import runs through the generic `conformImportData()`
    (`component_password` is a `VALUE_PROPERTY_MODELS` member in
    `src/core/tools/import_data.ts`) — it wraps a bare string into `{value}`
    **without hashing it**, so importing a plaintext password through TS would
    store the plaintext verbatim, not an Argon2id hash. Do not import/export
    real user credentials through the TS server until this is ported.

**Export (PHP).** `get_export_value()` overrides the common atoms contract to emit a
single scalar atom whose value is the `fake_value` mask — real password data is
**never** exported:

```json
{ "label": "Password", "value": "****************" }
```

**Diffusion (PHP).** `get_diffusion_value()` likewise returns the mask, so published
SQL/RDF/XML targets contain `****************`, not the hash.

**Import (PHP).** `component_password` does not override `conform_import_data`; it inherits
the standard string import. Because `set_data()` is conservative, the import path is
round-trip safe:

- If the imported value is a *plaintext* string, `set_data()` hashes it with
  Argon2id before storing.
- If the imported value is already a stored credential — detected by
  `is_stored_credential()` (modern `$argon2*` / `$2y$` / `$2a$` / `$2b$` prefixes,
  or a base64-decodable legacy AES blob ≥ 16 decoded bytes) — it is persisted
  **verbatim** and not re-hashed, so an export→import cycle preserves the existing
  hash and never double-hashes.

```json
{
    "lg-nolan" : ["$argon2id$v=19$m=65536,t=4,p=1$c29tZXNhbHQ$RdescudvJCsgt3ub+b+dWRWJTmaaJObG"]
}
```

See [importing data](../importing_data.md) and [exporting data](../exporting_data.md)
for the general model.

## Notes

**Hashing & verification (PHP API — not the TS server's write path).**

- `set_data(?array $data) : bool` — normalizes scalars to objects, drops empties,
  hashes plaintext with `hash_password()` (Argon2id), and passes credentials already
  in stored form through untouched.
- `hash_password(string $plaintext) : string` — `password_hash(..., PASSWORD_ARGON2ID)`.
- `verify_password(string $plaintext, string $stored) : array{bool $verified, bool $needs_rehash}`
  — modern path uses `password_verify()` + `password_needs_rehash()`; legacy path
  recomputes the AES blob and `hash_equals()` it, always flagging a rehash on success.
- `is_stored_credential(string) : bool` and `is_legacy_hash(string) : bool` —
  classification helpers used by `set_data()` and verification.
- `encrypt_password(string)` — **deprecated** legacy AES helper, kept only for
  legacy comparison.
- `get_v6_root_password_data() : ?string` — **provisional** v6→v7 transition helper
  that reads the legacy `matrix_users.datos` column for the root user; to be removed
  in versions > 7.0.0.

**Lazy migration — PHP only, TS denies loudly instead.** In PHP, legacy
AES-encrypted passwords are upgraded to Argon2id transparently on the user's
next successful login (`login::Login()`): when `verify_password()` returns
`needs_rehash = true`, login re-instantiates the component in `edit` mode,
`set_data([{value: $plaintext}])` (which re-hashes) and `Save()`s. **The TS
auth flow (`src/core/security/auth.ts`) does not do this.** It checks
`passwordHash.startsWith('$argon2')`; if the stored hash is a legacy
(pre-Argon2) value, TS logs an explicit server error and refuses the login
(same ambiguous client-facing message as any other failure) rather than
attempting a rehash — a documented, deliberate divergence (module header:
*"legacy pre-Argon2 hashes ... those accounts must log into the PHP server
once (lazy rehash) before the TS server accepts them"*). There is also no
`root` special-case in TS, because there is nothing to exclude from an upgrade
path that does not exist.

**Save through the section.** Like all components, `component_password` never touches
the DB directly; in the TS server it goes through the same generic
`src/core/section/record/save_component.ts` as any other string component — no
hashing applied. Saves are refused in `search`/`tm` modes.

**Default tools.** The shipped context exposes `tool_propagate_component_data` and
`tool_time_machine`. There is no `tool_lang` (non-translatable)
and no `tool_add_component_data`/`tool_replace_component_data` (single masked value).

**Gotchas.**

- Never compare stored values with `===`; always go through `verify_password()`.
- The datum value the front end receives is always the mask — do not treat it as the
  real credential, and do not "save" the mask back unchanged (the edit view only
  saves on a real `change`).
- `is_stored_credential()` is intentionally permissive on the legacy side to avoid
  double-hashing during import; a genuine plaintext password that happens to look
  like clean base64 ≥ 24 chars could in theory be misclassified — in practice real
  passwords contain punctuation that breaks the strict base64 match.

**Related components.** [component_input_text](component_input_text.md) (same
`string` column, but readable and translatable), [component_iri](component_iri.md)
and `component_security_access`. See the typology overview in
[index](index.md).
