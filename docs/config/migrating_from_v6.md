# Migrating your config from v6

> See also: [What changed in v7](whats_changed_v7.md) · [How configuration works](administration.md) · [Settings reference](config.md)

A v6 install keeps its settings in PHP, as ~200 `define()` statements in
`<dedalo>/config/`. v7 reads one file, `../private/.env`. This page turns the
first into the second.

The tool does not guess. It reads your v6 config, tells you exactly what it will
write, what it will drop and why, and what it cannot migrate — and it writes
nothing until you say so.

---

## 1. Run it in dry-run first

```bash
bun run dedalo:migrate-config --config-dir=/path/to/dedalo_v6/config
```

That is the whole first step. It prints a plan and **writes nothing**.

`--config-dir` is the v6 `config/` directory — the one holding `config.php`,
`config_db.php`, `config_areas.php` and `config_core.php`.

!!! warning "If your defines live somewhere else"
    Some installs keep the payload in an included file (e.g.
    `../private/config.inc`) and leave `config.php` as a stub. The tool reads the
    config **directory only** and never follows an include out of it — but it says
    so, loudly, and refuses to proceed. If you see

    ```
    !! CONFIG INCLUDED FROM OUTSIDE THE CONFIG DIRECTORY — and NOT read.
    ```

    point `--config-dir` at the directory that really holds the `define()`s.

---

## 2. Read the report

The report groups every constant it found.

| Section | What it means | What you do |
|---|---|---|
| `SAME` | v7 reads this key under the same name | nothing |
| `ALIAS` | v7 has its own name for it; the value carries over | nothing |
| `RENAMED` | the name changed **and the old one is retired** | nothing — the tool writes the new name |
| `RESHAPED` | the name and/or the value shape changed | nothing — the tool converts it |
| `DROPPED` | v7 has no such setting, with the reason | nothing. See [what changed](whats_changed_v7.md#settings-that-are-gone) |
| `COMMENTED OUT` | you had deliberately left it at the default | nothing |
| **`NOT MIGRATABLE`** | **the v6 value is computed at runtime** | **set it by hand — see below** |
| **`UNKNOWN`** | the tool has never heard of this constant | **tell us** — it is a gap in the map |

Values are never printed, so the report is safe to paste into a ticket. Passwords
and salts stay in your files.

### The one section you must act on

v6 computed some settings instead of stating them — `DEDALO_HOST` from
`$_SERVER`, `MEDIA_PATH` and the backup paths from `dirname()`, the interface
language from a function call. A static reader cannot know what those evaluate
to on your server, and **guessing would be worse than stopping**: it would write a
plausible wrong path and look like it had worked.

So they are listed, and you set them by hand:

```
!! NOT MIGRATABLE — the v6 value is computed at runtime
   DEDALO_HOST → DEDALO_HOST
   MEDIA_PATH  → MEDIA_PATH
   …
```

`MEDIA_PATH` is the one that matters most: get it wrong and no media resolves.

---

## 3. Write a candidate, and try it

Do not migrate straight into your live `.env`. Write a candidate somewhere safe
and boot against it:

```bash
bun run dedalo:migrate-config --config-dir=/path/to/dedalo_v6/config \
  --out=/tmp/candidate.env
```

Open it, add the hand-set keys from step 2, then point a server at it:

```bash
mkdir -p /tmp/try/private && cp /tmp/candidate.env /tmp/try/private/.env
DEDALO_PRIVATE_DIR=/tmp/try/private bun run dev
```

A good migration boots, answers `/health`, and shows a configured install in
**maintenance → check config**. A bad one usually fails loudly at boot, naming
the key.

---

## 4. Apply it

When the candidate is right:

```bash
bun run dedalo:migrate-config --config-dir=/path/to/dedalo_v6/config --execute
```

This **merges** into `../private/.env`:

- keys already present are left exactly as they are — your file is never rewritten
  or reordered
- new keys are appended under a dated comment block
- the previous file is backed up to `.env.bak.<timestamp>`
- the write is atomic, and the file stays `0600`

It refuses to run if anything is still `UNKNOWN`, or if a **boot-critical** key
(`ENTITY`, the `DB_*` set, and the language block) is unresolved — a configured
install without those crash-loops, and it is better to find out now.

---

## Passwords: run the second migration

!!! danger "Without this, your users cannot log in"
    v6 did not *hash* passwords, it **AES-encrypted** them (keyed by
    `DEDALO_INFORMATION`). v7 accepts **only Argon2id**. Any user whose stored value
    does not start with `$argon2` is locked out — and the PHP "upgrade on next
    login" path that used to fix this died with the PHP engine.

    Count them:

    ```sql
    SELECT COUNT(*) FROM matrix_users
     WHERE "string"->'dd133'->0->>'value' NOT LIKE '$argon2%';
    ```

**Nobody has to choose a new password.** Because the old storage is reversible, a
second tool decrypts each legacy value once and re-hashes it with Argon2id. Users
log in afterwards with the passwords they already have, and are never told
anything happened.

```bash
# dry-run: reports who is recoverable; writes nothing, prints no passwords
bun run dedalo:migrate-passwords --config-dir=/path/to/dedalo_v6/config

# apply
bun run dedalo:migrate-passwords --config-dir=/path/to/dedalo_v6/config --execute
```

It needs the v6 **`DEDALO_INFORMATION`** and **`DEDALO_INFO_KEY`** — the encryption
key and IV. If your install keeps its defines in an included file, name it:

```bash
bun run dedalo:migrate-passwords --config-file=/path/to/private/config.inc
```

…or pass them directly with `--information='…' --info-key='…'`.

!!! warning "Use the config that was in use when the passwords were last set"
    Those two constants are marked *"don't change it after install"* for exactly
    this reason: change them and every stored password becomes undecryptable. If the
    dry-run says **NOT RECOVERABLE** for everyone, the key material is wrong — it
    does not mean the passwords are lost. Find the right config before doing
    anything else. A wrong key is always reported, never silently applied.

Users it genuinely cannot recover must have their password reset by an admin.

!!! info "This is a security upgrade, not just a compatibility fix"
    `DEDALO_INFORMATION` defaults to the published string `Dédalo install version`
    and the IV seed is the entity name — so on a default v6 install, **anyone with a
    copy of the database can decrypt every password**. Argon2id ends that. It is
    also why the config migration deliberately does *not* carry those two keys into
    the v7 `.env`.

## What is *not* migrated, on purpose

- **Secrets are not invented.** `DEDALO_SALT_STRING` is dropped: in v6 it seeded a
  *session* token, never a password salt. v7 manages its own session secrets.
- **The password keys are dropped deliberately.** `DEDALO_INFORMATION` /
  `DEDALO_INFO_KEY` were the AES key and IV for v6 passwords. Carrying them into v7
  would only preserve the ability to *decrypt* old passwords — which is exactly what
  you do not want. v7 stores Argon2id hashes, whose salt is embedded per password.
- **`config_areas.php`** holds no `define()`s — it is PHP code appending to
  `$areas_deny`. If you denied areas, set `AREAS_DENY` in the `.env` yourself (a
  JSON array of tipos), or use the maintenance area.
- **Runtime state** (maintenance mode, install status) is not config in v7 — it
  lives in `../private/ts_state.json` and is written by the app.

---

## If something goes wrong

The migration never destroys anything: the previous `.env` is at
`.env.bak.<timestamp>`. Restore it and re-run the dry-run.

If the tool reported an `UNKNOWN` constant, that is a bug in our map, not in your
config — please report it with the constant's name.
