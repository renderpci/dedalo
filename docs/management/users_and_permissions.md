# Users, profiles and permissions

## Introduction

Access control in Dédalo answers two separate questions for every request:
*"who are you?"* (**authentication**) and *"what may you do?"*
(**authorization**). The two are handled by two different classes and this guide
ties them together into the everyday administration workflow: how to create a
user, how a profile turns into a per-element permission map, and how those
permissions are computed and enforced on every read and save.

This is a **workflow** page. The exact mechanics live in the reference docs and
are not repeated here at length — read them alongside this guide:

- [security](../core/system/security.md) — the authorization core (resolves and enforces the 0–3 levels).
- [login](../core/system/login.md) — authentication: credentials, session, the users section.
- [component_security_access](../core/components/component_security_access.md) — the stored per-profile permission matrix.
- [API gate](../core/system/api.md) — where the login check, CSRF and permission gates run at the request boundary.

!!! note "The Dédalo way: no bespoke tables"
    There is no `users` table and no `permissions` table. Users are ordinary
    records in the **Users** section, profiles are ordinary records in the
    **Profiles** section, and a profile's permission map is an ordinary
    component datum. Everything is versioned in Time Machine, importable and
    propagable like any other data.

## The four permission levels

A permission is a single integer; a higher level always includes the lower ones.

| value | level | meaning |
| --- | --- | --- |
| `0` | no access | the element is not returned and may not be read |
| `1` | read only | read, but every write is refused |
| `2` | read / write | read and save |
| `3` | admin | full control (structure edits, debug) |

The absence of a stored row means level `0`. Rows whose value is `0` are **never
persisted** — the editor builds a full tree for the UI but strips every
`value <= 0` on save, so "no access" is simply the absence of a grant.

See [Components — Permissions](../core/components/index.md#permissions) for the
levels from a component's point of view.

## Where users and profiles live

| concept | section | tipo | notes |
| --- | --- | --- | --- |
| User | **Users** | `dd128` (`DEDALO_SECTION_USERS_TIPO`) | login name, password, active flag, profile, projects |
| Profile | **Profiles** | `dd234` (`DEDALO_SECTION_PROFILES_TIPO`) | carries the `component_security_access` matrix (`dd774`) |

A user record links to a profile through its `DEDALO_USER_PROFILE_TIPO`
(`dd1725`) component, and to one or more projects through its
`component_filter_master`. The profile, in turn, owns the **permissions matrix**
(`component_security_access`, tipo `dd774`). When the user logs in, that matrix
is flattened into the fast lookup table that gates the rest of the session.

```mermaid
flowchart LR
    U["User record<br/>(Users section dd128)"] -->|"DEDALO_USER_PROFILE_TIPO (dd1725)"| P["Profile record<br/>(Profiles section dd234)"]
    P -->|"component_security_access (dd774)"| M["permission matrix<br/>per-element 0–3"]
    U -->|"component_filter_master"| PR["projects<br/>(per-record scope, layer 2)"]
```

The super-user **root** (`section_id = -1`) is outside this model: it is always a
global admin, bypasses the profile/projects checks, and cannot be managed from
the web interface (see [root user](index.md#root-user) and
[changing the root password](changing_root_password.md)).

### Two roles above the profile

Two flags promote a user beyond their profile's grants. They are stored on the
user record and read back from the session for the current user:

- **Global admin** (`DEDALO_SECURITY_ADMINISTRATOR_TIPO`, `dd244`) —
  `security::is_global_admin()` resolves the level to `3` everywhere and bypasses
  the per-record project scope. This is the "general admin" account described in
  the [management index](index.md#general-admin).
- **Developer** (`DEDALO_USER_DEVELOPER_TIPO`, `dd515`) —
  `security::is_developer()`; grants access to development/structure surfaces.

Both, plus a profile that grants the maintenance area, are required to use the
[Maintenance panel](index.md#maintenance-panel).

## Workflow: create a profile

1. Go to the **Profiles** section (under System administration).
2. Create a new record and name it (e.g. *Cataloguer*, *Read-only reviewer*).
3. Open the **Permissions** component (`component_security_access`). It renders
   the whole ontology as an expandable tree — areas → sections → elements — with
   four radio buttons per node for the levels 0–3.
4. Set the level on each node you want to grant. Areas and sections **derive**
   their level from their children (a parent shows a level only when all its
   children share it), so you normally set leaf elements (components, buttons)
   and let the parents follow. Selecting a value propagates up the parent chain.
5. Save. Only non-zero rows are written; absent rows mean no access.

See [component_security_access](../core/components/component_security_access.md)
for the tree shape, the structural exclusions (the Admin area and its children
are never shown for permissioning), and the per-profile data format.

## Workflow: create a user

1. Go to the **Users** section.
2. Create a new record and fill the login name (`dd132`) and password (`dd133` —
   hashed with Argon2id on save by `component_password`; min length 8).
3. Set **Active account** (`dd131`) to *Yes* — an inactive account is refused at
   login.
4. Assign a **profile** (`DEDALO_USER_PROFILE_TIPO`). A user with no profile is
   refused at login (*User without profile*).
5. Assign at least one **project** (`component_filter_master`). A user with no
   project is refused at login (*User without projects*) and, at runtime, sees
   only the records inside their projects (layer-2 scope, below).
6. Optionally promote to global admin and/or developer (above).

!!! note "Who can create whom"
    Per the [management index](index.md), root creates the first general admin;
    general admins can then create other admins, developers and ordinary users
    and assign their profiles/projects — but an account cannot edit its own
    admin/developer configuration.

## How permissions are computed and enforced

All authorization is resolved and enforced **server-side**, never trusting the
client. There are two independent tiers, both living in `security`:

1. **Type / schema permission (layer 1).** *"What may this profile do with this
   section or component type?"* — resolved from the flattened permission table by
   `security::get_security_permissions()`, reached through the recommended entry
   point `common::get_permissions($parent_tipo, $tipo)` (which adds the
   not-logged `0` clamp and Time-Machine clamps). `0` when not logged.
2. **Per-record / project scope (layer 2).** *"Is this specific record inside the
   user's project scope?"* — `security::user_can_access_record()` intersects the
   record's `component_filter` with the user's projects. This mirrors the
   `filter_by_projects` WHERE clause that `search` applies to every list/search.

The level is resolved in one place but **checked at several chokepoints**:

- **Read** — `dd_core_api` resolves a read permission per response row; rows that
  resolve below `1` are dropped.
- **Create / save** — the create and save paths refuse when
  `common::get_permissions(section_tipo, section_tipo) < 2`, and the component
  itself refuses to persist below write in `component_common::save()`.
- **API gates** — tool and service methods add explicit `assert_*` gates
  (`assert_section_permission`, `assert_record_in_user_scope`, …) at their entry.
  A failed gate throws `permission_exception`, which `dd_manager` converts into a
  uniform `{result:false, errors:['permissions_denied']}` response.

The full enforcement diagram and method list are in
[security](../core/system/security.md#how-permissions-are-enforced).

!!! warning "Invalidate the cache after editing permissions"
    The permission table is cached three deep (per-process static → per-user disk
    file → the component itself). After editing a profile's permissions, the next
    request must see the new matrix. Saving the component triggers a recompute;
    if you change permissions programmatically, call
    `security::reset_permissions_table()`. Under a persistent worker these
    per-user caches MUST be reset between requests so one user's matrix never
    leaks to the next.

### The no-login allowlist

Authentication is enforced at the [API gate](../core/system/api.md) for every
action **except** a small allowlist of bootstrap/installer actions that must run
before a session exists. In `dd_manager` (`$no_login_needed_actions`):

`start`, `change_lang`, `login`, `get_login_context`, `install`,
`get_install_context`, `get_environment`, `get_ontology_update_info`,
`get_code_update_info`, `get_server_ready_status`.

Everything else requires `login::is_logged() === true`. The match is a strict
string comparison (SEC-018) so a non-string `action` from a hostile body cannot
slip through PHP's loose type juggling.

!!! danger "Server-only read grant"
    `security::$read_only_scope` is a server-only flag that grants a fixed read
    (`1`) to *target* sections (for label/autocomplete resolution), excluding the
    Users and Profiles sections. It MUST be set only by trusted server code and
    reset in a `finally` block — never derived from client input. See
    [security › read_only_scope](../core/system/security.md#read_only_scope--the-server-only-read-grant).

## Worked example: a read-only profile for one section

Goal: a profile that can **read** the *Archaeological objects* section (say
`rsc197`) and its fields, but cannot edit anything, and has no access to the rest.

1. **Create the profile.** Profiles section → new record → name it
   *Objects reader*.
2. **Open Permissions** (`component_security_access`) and expand the tree to the
   *Archaeological objects* section.
3. **Set the section to level `1` (read only).** Set the section node — and its
   description fields — to `1`. Because parents derive from children, set the
   leaf components to `1` and the section node follows. Leave everything outside
   that section untouched (absent = `0` = no access).
4. *(Optional)* grant `1` on linked **Thesaurus** sections so the reader can see
   the controlled terms referenced by the records, but not edit the vocabulary.
5. **Do not grant the `button_new`** of the section — without write (`2`) on the
   section the create gate refuses new records anyway, and
   `security::get_section_new_permissions()` gates the create button explicitly.
6. **Save.** Only the non-zero rows persist, e.g.:

    ```json
    [
        {"id": 1, "tipo": "rsc197", "section_tipo": "rsc197", "value": 1},
        {"id": 2, "tipo": "rsc85",  "section_tipo": "rsc197", "value": 1}
    ]
    ```

7. **Assign the profile** to a user (Users section → user → profile = *Objects
   reader*), with a project so layer-2 scope is satisfied.
8. **Verify.** Log in as that user: the *Archaeological objects* records appear
   read-only, save buttons are refused (`< 2`), and other sections do not appear
   at all (`0`). The user only sees records inside their assigned projects.

!!! note "Programmatic grant (dev)"
    To grant a profile read+write over a list of sections *and all their
    children* in code — e.g. when generating hierarchies — use
    `component_security_access::set_section_permissions()` (default level `2`,
    accepts `0`), which merges into the existing matrix and resets the
    permissions table. See
    [install new hierarchies](install_new_hierarchies.md) for the surrounding
    workflow.

## Related

- [security](../core/system/security.md) — authorization core, the 0–3 levels, the enforcement gates and caching.
- [login](../core/system/login.md) — authentication, the session `auth` block, the users section as credential store.
- [component_security_access](../core/components/component_security_access.md) — the stored per-profile permission matrix and its editor.
- [API gate](../core/system/api.md) — the request-boundary gates (login, CSRF, permission).
- [Management index](index.md) — root vs general admin, the maintenance panel, the access policy in prose.
- [Installing new hierarchies](install_new_hierarchies.md) — setting permissions on freshly created sections.
