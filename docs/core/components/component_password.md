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

!!! danger "Real values are not masked on read"
    `sample_value` above shows the *intended* mask `****************`, but that
    masking is **not implemented**. `component_password` is meant to be a
    write-only credential field, yet no module under `src/` substitutes a mask
    for the stored value on read — `readComponentItems`
    (`src/core/resolve/component_data.ts`) returns the stored item array
    verbatim for every model, and there is no `component_password`-specific
    override or `emitHook` in its descriptor. A section/get_data read of a
    `component_password` node today returns the **real Argon2id hash** to any
    caller with read permission, not a mask. Treat this as an open security
    gap, not as documented behaviour to rely on.

## Definition

`component_password` is a literal-direct component that stores a single user
credential securely. Descriptor-wise it is unremarkable —
`src/core/components/component_password/descriptor.ts` stores its data in the
same `string` matrix column as [component_input_text](component_input_text.md),
read/written by the same generic engines. What makes it security-critical is
three behaviours layered on top of that plain string storage:

1. **One-way hashing on write.** Plaintext entered by the user is hashed with
   Argon2id before it ever reaches the matrix write. The stored value is
   non-reversible.
2. **Masked on every read.** The component is meant to never emit its real
   stored value — the API datum, grid/list views, export and diffusion should
   all substitute a constant mask (`****************`) instead of the hash.
3. **Verification, not equality.** Because Argon2id incorporates a random salt, two
   hashes of the same password differ. Comparison must go through a
   constant-time verify call, never a string equality check.

!!! danger "Current status: (1) and (3) are implemented, (2) is not"
    Hashing on write (1) is a single chokepoint: `src/core/section/record/save_component.ts`
    detects `model === 'component_password'` and routes the change through
    `hashPasswordChanges` (`src/core/security/password_hash.ts`) before the
    value reaches the matrix write — every write door (client API, MCP tools,
    the agent change-plan, CSV import) funnels through `save_component.ts`, so
    this is the one gate a plaintext password must pass. Verification (3) is
    implemented in the **auth flow** (`src/core/security/auth.ts`), which
    verifies with `Bun.password.verify()` (native Argon2id). Read-time masking
    (2) is **not implemented** as a property of the `component_password` model
    (see the warning under [Overview](#overview)). The safety net today is that
    the users section (`dd128`) cannot be read through the generic raw-view
    endpoint (`src/core/api/raw_view.ts` hard-denies it), not that the
    component masks itself.

**Why it exists.** Dédalo needs to authenticate users without ever holding a
recoverable copy of their password. This component is the credential field:
hashing on write and verification on login are implemented; read-time masking
and the legacy-hash upgrade path are not — see the gaps called out throughout
this page.

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

**Data:** `object` with language as property (`lg-nolan` for the canonical
non-translatable instance — see below).

**Value:** `array` of `strings`, or `null`. Each string is a stored *credential*
(an Argon2id hash for current data, or a legacy AES blob for not-yet-upgraded data).

**Storage:** Like every string component, the persisted unit inside the matrix
`data` column is an array of items `{id, value}`. Its descriptor declares
`classSupportsTranslation: true` — the same class-level capability as
[component_input_text](component_input_text.md) — so translatability is driven by
the ontology node, not hard-coded by the model. The canonical instance
([dd133](https://dedalo.dev/ontology/dd133), the user account password) is
deployed with `translatable: false`, so its language is always `lg-nolan` and
there are no per-lang rows.

Stored shape (current Argon2id hash):

```json
{
    "lg-nolan" : ["$argon2id$v=19$m=65536,t=4,p=1$c29tZXNhbHQ$RdescudvJCsgt3ub+b+dWRWJTmaaJObG"]
}
```

Legacy reversible AES blob (base64), still readable during the migration window but
**not** transparently upgraded on login (see [Notes](#notes)):

```json
{
    "lg-nolan" : ["SzlpYmp6TXg5VEN4RDVRZnVPMU9yVStjZWJmYVV1M003aDM3bVAremVxcz0="]
}
```

!!! note "What the client/API actually receives"
    The intent is that, on read, the datum `data` item delivered to the front
    end keeps the real entry `id` but replaces the value with a mask, always
    `{ "id": 7, "value": "****************" }`. **No such substitution exists
    today** — see the danger note above. The verified sample at
    `src/core/components/component_password/samples/data.json` is the flat
    item array `[{"id":7,"value":"<hash>"}]` with no masking step applied
    anywhere in the pipeline.

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

- `model` must be `component_password`; the model is resolved from the tipo by
  `getModelByTipo()` (`src/core/ontology/resolver.ts`).
- `translatable` is honoured like any class-translatable component. The
  canonical `dd133` node ships `translatable: false`, so it is `lg-nolan` and
  has no `tool_lang`; a node could in principle be declared translatable, but
  that is not the deployed shape and is not a sensible one for a credential.
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

There is no per-component object to construct. The auth flow reads the
stored hash directly with a parameterized SQL query against `matrix_users` and
verifies it with `Bun.password`:

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

`USERS_SECTION_TIPO` resolves to `dd128` and `PASSWORD_COMPONENT` to `dd133` —
the users section and its password field.

## Properties & options

`component_password` reads **no component-specific ontology properties**. The sample
context ships an empty `properties` object, and nothing in its behaviour reads it.
Standard generic framing properties (e.g. `css`, `request_config`) still apply
through the common datum `context`, but there are no password-only options to
configure.

!!! note "Validation is client-side and not ontology-driven"
    Password format rules (length `[6, 32]`, at least one lowercase, one uppercase,
    one numeric, banned words/chars, sequential-character ban) live in the JS model
    method `validate_password_format(pw, options)` in `component_password.js`. They
    are applied before save in `handle_password_change()`. These are JS option
    defaults, **not** ontology properties; if you need different policy, verify in
    the JS model rather than the ontology node.

There are no deprecated component properties.

## Render views & modes

Modes (the same four standard component modes): `edit`, `list`, `tm`, `search`.
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

!!! danger "Gap: export is not hash-aware"
    Export runs through the generic export-atoms path
    (`src/diffusion/export/atoms.ts`, reached via `tools/tool_export/server/tool_export.ts`
    -> `src/diffusion/export/index.ts` `exportGridUnified()`) as any other string
    component — it has no mask substitution, so a `component_password` column
    exported today would leak the real Argon2id hash. Do not export real user
    credentials until this is fixed.

**Export.** A `component_password` column is exported as a plain scalar atom
carrying the stored value — the real hash, unmasked (see the gap above); it is
intended to instead emit a fixed mask:

```json
{ "label": "Password", "value": "****************" }
```

**Import.** Import runs through the generic write path: `conformImportData()`
(`src/core/tools/import_data.ts`, `component_password` is a
`VALUE_PROPERTY_MODELS` member) wraps a bare cell into a `{value}` item, and
the save itself goes through `saveComponentData()`
(`src/core/tools/import_execute.ts` -> `src/core/section/record/save_component.ts`)
— the same hashing gate described above. A plaintext string cell is hashed with
Argon2id before it lands in the matrix; a cell that is already an Argon2id hash
(`$argon2…`) passes through verbatim, so an export→import round-trip of a
current-format credential never double-hashes:

```json
{
    "lg-nolan" : ["$argon2id$v=19$m=65536,t=4,p=1$c29tZXNhbHQ$RdescudvJCsgt3ub+b+dWRWJTmaaJObG"]
}
```

!!! warning "Legacy AES cells are re-hashed, not preserved"
    The hashing gate (`hashPasswordForStorage`, `src/core/security/password_hash.ts`)
    only recognises an Argon2id hash as "already stored"; it has no separate
    legacy-ciphertext check wired into that decision. Importing a cell that
    holds a legacy AES-encrypted value (not an `$argon2…` string) is treated
    as plaintext and gets Argon2id-hashed — turning the ciphertext itself into
    a new hash, which silently invalidates that credential rather than
    preserving it. Do not round-trip legacy password columns through import.

See [importing data](../importing_data.md) and [exporting data](../exporting_data.md)
for the general model.

## Notes

**Hashing & verification API.**

- `hashPasswordForStorage(value)` (`src/core/security/password_hash.ts`) — the
  per-value rule: empty/null passes through untouched (the caller means "no
  change"); an already-Argon2id value (`$argon2…`) passes through verbatim;
  anything else is treated as plaintext and hashed with `Bun.password.hash(value,
  { algorithm: 'argon2id' })`. The per-password random salt is embedded in the
  hash string, so there is no separate global salt.
- `hashPasswordChanges(changes)` — applies `hashPasswordForStorage` across a
  save's changed-data entries (array or bare-string item shapes); this is what
  `save_component.ts` calls for `model === 'component_password'`.
- `isArgon2Hash(value)` — recognises any `$argon2…` PHC string.
- `isLegacyEncryptedPassword(value)` — recognises a legacy reversible-AES
  ciphertext (non-empty, not an Argon2 hash, not `$`-prefixed) but is **not**
  wired into `hashPasswordForStorage`'s decision — see the warning above about
  legacy cells being re-hashed on import rather than preserved.
- `Bun.password.verify()` (`src/core/security/auth.ts`) — constant-time
  Argon2id verification against the stored hash at login.

**Lazy migration on login is not implemented; login is refused instead.** A
legacy (pre-Argon2) password hash cannot be transparently upgraded on login
today. The auth flow checks whether the stored hash starts with `$argon2`; if
it does not, it logs a server-side error and refuses the login (the same
ambiguous client-facing message as any other failure) rather than attempting a
rehash. There is no `root`-user special case, because there is no upgrade path
for it to be excluded from.

The actual remediation is a one-time bulk migration, not a per-login rehash:
`scripts/migrate_v6_passwords.ts` (backed by `src/core/security/legacy_password.ts`)
decrypts the reversible legacy ciphertext, immediately re-hashes it with
Argon2id, and writes the hash back — the recovered plaintext is never logged,
returned, or persisted. It is meant to be run once against the database before
opening it to logins, not invoked automatically by the auth flow.

**Save through the section.** Like all components, `component_password` never
touches the DB directly; it goes through the same generic
`src/core/section/record/save_component.ts` as any other string component,
with the hashing gate described above applied first. Saves are refused in
`search`/`tm` modes.

**Default tools.** The shipped context exposes `tool_propagate_component_data` and
`tool_time_machine`. The canonical `dd133` instance has no `tool_lang` (it is
non-translatable) and no `tool_add_component_data`/`tool_replace_component_data`
(single masked value).

**Gotchas.**

- Never compare stored values with `===`; always go through `Bun.password.verify()`
  (`src/core/security/auth.ts`).
- Until read-time masking is implemented (see the danger note under
  [Overview](#overview)), the datum value a caller with read permission receives
  today is the **real Argon2id hash**, not a mask — do not build client behaviour
  that assumes masking, and do not treat that value as safe to display.
- `hashPasswordForStorage`'s "already hashed" check is a simple prefix test
  (`startsWith('$argon2')`). A plaintext password that happens to start with
  that literal string would be stored verbatim, unhashed, instead of being
  hashed — an edge case worth being aware of, however unlikely in practice.

**Related components.** [component_input_text](component_input_text.md) (same
`string` column, but readable and translatable), [component_iri](component_iri.md)
and `component_security_access`. See the typology overview in
[index](index.md).
