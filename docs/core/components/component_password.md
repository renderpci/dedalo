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

!!! warning "Real values are never transmitted"
    `sample_value` above is intentionally the fake mask. `component_password` is a
    write-only credential field: the stored value is a one-way Argon2id hash, and
    every read path (API datum, grid/list, export, diffusion) returns the
    `fake_value` mask `****************` instead of the real hash. The plaintext the
    user types is never stored and never returned.

## Definition

`component_password` is a literal-direct component that stores a single user
credential securely. It extends `component_common` and stores its data in the
`string` matrix column like [component_input_text](component_input_text.md), but it
diverges from a plain text field in three security-critical ways:

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

**Why it exists.** Dédalo needs to authenticate users without ever holding a
recoverable copy of their password. This component is the single place that owns the
credential lifecycle (hash, store, verify, lazily upgrade legacy values).

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

!!! note "What the client/API actually receives"
    On read, the JSON controller (`component_password_json.php`) keeps the real
    entry `id` but replaces the value with `fake_value`, so the datum `data` item
    delivered to the front end is always:

    ```json
    { "id": 7, "value": "****************" }
    ```

    The comment in the controller is explicit: *"this value will not be sent to the
    front end in any case."* The client edit input is likewise pre-filled with the
    same mask and only sends a `change` when the user types a new password.

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

Server-side instantiation, exactly as `login::Login()` does it (note `cache=false`
and `mode='list'` for a read-only verify pass):

```php
$component_password = component_common::get_instance(
    'component_password',          // model
    DEDALO_USER_PASSWORD_TIPO,     // tipo = 'dd133'
    $section_id,                   // user record id
    'list',                        // mode
    DEDALO_DATA_NOLAN,             // lang (forced anyway)
    DEDALO_SECTION_USERS_TIPO,     // section_tipo
    false                          // cache
);
$stored = $component_password->get_data()[0]->value ?? null;
```

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

**Export.** `get_export_value()` overrides the common atoms contract to emit a
single scalar atom whose value is the `fake_value` mask — real password data is
**never** exported:

```json
{ "label": "Password", "value": "****************" }
```

**Diffusion.** `get_diffusion_value()` likewise returns the mask, so published
SQL/RDF/XML targets contain `****************`, not the hash.

**Import.** `component_password` does not override `conform_import_data`; it inherits
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

**Hashing & verification (PHP API).**

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

**Lazy migration.** Legacy AES-encrypted passwords are upgraded to Argon2id
transparently on the user's next successful login (`login::Login()`): when
`verify_password()` returns `needs_rehash = true`, login re-instantiates the
component in `edit` mode, `set_data([{value: $plaintext}])` (which re-hashes) and
`Save()`s. The upgrade is best-effort and never blocks a successful login. The
`root` user is excluded from the lazy upgrade.

**Save through the section.** Like all components, `component_password` never touches
the DB directly; `save()` delegates to the owning section record. Saves are refused
in `search`/`tm` modes.

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
