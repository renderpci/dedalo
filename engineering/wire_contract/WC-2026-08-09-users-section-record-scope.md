# WC-2026-08-09-users-section-record-scope — the Users section (dd128) ACL is one restrictive rule at BOTH doors

- **Date:** 2026-08-09 (audits/2026-08_oh1_beta REPORT §5.4, finding 3: *"the
  Users section has no per-record visibility rule — any non-admin with a read
  grant enumerates every user record"*). WS-P1 "Permissions".
- **Decision:** DEC-15 (deliberate divergence), DEC-12 (tripwire in the same
  change).

## What was wrong

`dd128` carries **no `component_filter` child**. The TS projects filter is keyed
entirely on that child (`getComponentFilterTipo(sectionTipo)`), so for the Users
section `buildProjectsFilter` returned `''` and the assembler emitted

```sql
WHERE (dd128.section_tipo = $1::text) AND dd128.section_id > 0
```

— nothing else. Any authenticated non-admin holding a `dd128` read grant listed,
searched, counted and paginated **every user account in the install**: usernames,
project membership, profile assignment, creation metadata.

PHP does not have this hole, because PHP does not derive the Users rule from a
`component_filter` child at all: `build_sql_projects_filter` gives `dd128` its
own `switch` arm (`core/search/trait.where.php:775-836`).

## Shape before (PHP) — two layers that contradict each other

**Layer 1, the LIST (restrictive).** `trait.where.php:775-836`:

```
(alias.section_id > 0 AND (
      alias.<datos> @> {"created_by_userID": <me>}
   OR alias.<datos>#>'{relations}' @> [<my project locator, WITH type>]   -- once per project
))
```

**Layer 2, the PER-RECORD helper (permissive).**
`security::user_can_access_record` (`core/security/class.security.php:1035-1058`)
short-circuits `dd128` **only for the caller's own record** and then falls
through to the generic `component_filter` lookup:

```php
if ($section_tipo === DEDALO_SECTION_USERS_TIPO) {
    if ((int)$section_id === (int)$user_id) return true;
    // fall through to default check
}
…
$component_filter_tipo = $ar_component_filter[0] ?? null;
if (empty($component_filter_tipo)) return true;   // ← dd128 lands HERE
```

`dd128` has no `component_filter`, so PHP returns **true for every user record**.
The oracle therefore hides a record from the list and then grants it to anyone
who addresses it directly — a textbook IDOR against its own filter.

## Shape after (TS) — one predicate, inherited by every door

`src/core/search/sql_assembler.ts` `buildUsersProjectsFilter` states the rule
once, inside the assembler:

```sql
(alias.section_id > 0 AND (
      alias.section_id = <me>                            -- the own-record arm
   OR alias.data @> {"created_by_user_id": <me>}         -- number and string form
   OR alias.relation @> {"dd170":[{"section_id":"<p>"}]} -- once per project, both forms
))
```

`src/core/security/record_scope.ts` `isRecordInScope` runs the REAL assembler
with the principal attached, so `principalCanAccessRecord`, `filterLocatorsInScope`,
`scopeRecordHits`, the write handlers, `get_data`, the resolve-chip path and the
MCP tools all inherit exactly this predicate. `record_scope.ts` now contains **no
section tipo comparison at all**: there is no second, hand-written copy of the
dd128 rule anywhere, and the per-record answer is the list answer by
construction.

## The five divergences, precisely

**1. The per-record helper is RESTRICTIVE (the headline).** PHP layer 2 returns
`true` for every `dd128` record; TS returns layer 1's answer. Consequence: a
non-global-admin user administrator holding a `dd128` level-2 grant can no longer
open, save, duplicate or delete a user who is neither in their projects nor
created by them. That user was **already invisible to them in PHP's own list**,
so the capability being removed is reach-by-guessed-id, not a workflow. The
alternative — porting PHP's permissive layer 2 — would mean shipping an ACL whose
list and record doors disagree, which is the shape the audit finding is about.
Global admins and the superuser stay unscoped at both doors.

**2. The `created_by` key is `created_by_user_id`, not `created_by_userID`.**
PHP's filter literal (`trait.where.php:791`) spells it `created_by_userID`;
PHP's own metadata writer stamps `created_by_user_id`
(`core/section_record/class.section_record.php:1688`), as do its installer seeder
and its Time Machine notes reader. Verified against live data: on the oral-history
archive, `jsonb_object_keys(data)` over `matrix_users` yields `created_by_user_id`
on every row and `created_by_userID` on none. **PHP's clause is dead** — it matches
no row in any install, so the oracle's "created by me" arm never fired. TS reads
the key that exists, which makes the arm LIVE: a user administrator keeps seeing
the accounts they provisioned even when no project is shared. This is the one
divergence that is more permissive than the fossil, and it is the intent of PHP's
own code.

**3. The project match ignores the locator `type`.** PHP's users arm builds the
search locator with `section_tipo` + `section_id` + `type` and matches by `@>`,
so `type` participates. TS matches on `section_id` under the `dd170` key.
Evidence for dropping it, not preference: on the live archive the SAME `dd170`
project component stores **two different types** — `dd675` (52 locators) and
`dd151` (2). A type-strict predicate denies a real user their real project the
moment the two spellings meet. PHP's own DEFAULT branch (`trait.where.php:895`)
matches `(item->>'section_id')::int IN (…)` — no `section_tipo`, no `type` — so
type-strictness is an outlier within PHP, not its rule. The `dd170` key already
does the disambiguation `section_tipo` would.

**4. A projects-less caller gets a one-row list, not a 500.** PHP throws
`Exception("Error Processing Request. Invalid filter master data")`
(`trait.where.php:812`) when the caller's `dd170` is empty, which makes the Users
list a hard error for such a user — even though the code two lines below it
(`if (!empty($ar_query))`) plainly intends the empty case to degrade. TS degrades
to the own-record/`created_by` clauses, so the caller sees themselves and the
accounts they created.

**5. The own-record allowance is in the FILTER, not only per-record.** PHP states
it once, in layer 2 (`user_can_access_record:1038-1041`), and never in layer 1 —
so under PHP's list rule a user with no projects whose account was created by
somebody else does not appear in their own Users list. That is harmless in PHP
only because layer 2 lets everything through anyway. With layer 2 made
restrictive (divergence 1), inheriting PHP's omission would lock that user out of
their OWN record: every read door in TS answers through a principal-scoped
search, so "not in the list" becomes "cannot open the self-service profile
editor" (`permissions.ts resolveOwnUserRecordPermission` stamps the
name/email/password components, but it never gets a record to stamp). The arm
leaks nothing — the caller knows their own user id by definition — and it is what
makes the two doors reducible to ONE predicate with no per-section exception left
in `record_scope.ts`.

## Related, NOT divergences

- `section_id > 0` (the root/system rows) is PHP's, applied for admins too; it
  was already in the assembler as a main-section guard and is now repeated inside
  the users predicate so the multi-section UNION branches carry it as well.
- The `PROFILES` (`dd234`) and `PROJECTS` (`DEDALO_FILTER_SECTION_TIPO_DEFAULT`)
  arms of PHP's switch — no filter for anyone — are now written explicitly in
  `buildProjectsFilter`. Today they are implied (neither section has a
  `component_filter` child); stating them keeps a future ontology edit from
  silently gating the profile record that grants a user everything.
- The SQL shape is TS's GIN-indexable `@>` containment rather than PHP's
  `#>'{relations}'` path, for the same reason as WC-011 and the generic filter:
  the `relation` column is keyed by component tipo in v7.

## Gate reconciliation

`test/unit/oh1_permissions_native.test.ts`, `describe` blocks "Users section
(dd128) LIST/SEARCH enumeration" and "Users section (dd128) per-record
visibility". Every rule is asserted from BOTH sides — an over-tightening turns
the file red exactly as fast as a re-opened hole:

| assertion | side |
|---|---|
| a non-admin's `dd128` list contains their own row, a project-sharing user, a user they created, and a user sharing the project under a DIFFERENT locator `type` | authorised |
| that list excludes another project's user and the root record `-1` | refused |
| a client-pinned `filter_by_locators` for an out-of-scope user returns nothing (the pin ANDs with the filter, it does not replace it) | refused |
| a global admin's list still contains every user (but never `-1`) | authorised |
| a projects-less caller's list is EXACTLY `[their own row]` — no throw, no lockout — and `isRecordInScope` / `principalCanAccessRecord` agree | both |
| `dd234` / `dd153` emit no projects predicate for a non-admin, and the scratch profile is listable by the user it grants | authorised |
| `isRecordInScope` equals list membership for every fixture user — the anti-drift gate for "one rule, two doors" | both |

RED before the change (4 of 17 cases: the list returned every user, the pinned
locator resolved, the projects-less list returned every user, and the two doors
disagreed).

**No re-harvest.** The frozen oracle store carries no `dd128` list harvested as a
non-admin — the harvest ran as the superuser, whose row set is unchanged by this
entry. The PHP shapes above are recorded from the frozen source as fossils.
