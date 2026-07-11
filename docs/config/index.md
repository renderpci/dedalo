# Configuration

> See also: [Installation](../install/index.md) · [Management and maintenance](../management/index.md)

Dédalo v7 keeps **all** of its configuration in one file, **`../private/.env`** —
one level above the install, outside the web root:

```bash
# ../private/.env
ENTITY=my_museum
DB_NAME=dedalo
DB_HOST=localhost
DB_USER=dedalo
DB_PASSWORD=…
```

Change a value, restart the server, done. There is **no `config.php`** and nothing
to edit inside the served tree — if you are looking for the four PHP config files
of v6, see [what changed in v7](whats_changed_v7.md).

A fresh install needs none of this by hand: the [install
wizard](../install/index.md) writes the file for you.

---

## Configuration pages

| Page | What it covers |
|---|---|
| [How configuration works](administration.md) | Where values live, how they resolve, secrets, required keys, troubleshooting. **Start here.** |
| [Settings reference](config.md) | Every setting, what it means, and its default. |
| [What changed in v7](whats_changed_v7.md) | The v6 → v7 map: renamed, reshaped and removed settings. |
| [Migrating your config from v6](migrating_from_v6.md) | The tool that converts an old PHP config into a v7 `.env`. |
| [Database connection](config_db.md) | PostgreSQL (the work database) and MariaDB (diffusion). |
| [Areas](config_areas.md) | Allowing and denying areas. |
| [Media protection](media_protection.md) | Web-server-enforced access control for media files. |
| [Search](search.md) | The search trust boundary and its limits. |
| [Thesaurus dependencies](thesaurus_dependeces.md) | Which ontology TLDs need which hierarchies. |

---

## The essentials

**The file.** `../private/.env`, mode `0600`, outside the web root. One
`KEY=value` per line. Lists and maps are JSON; booleans are `true`/`false`.

**Precedence.** The process environment beats the file; the file beats the
engine's built-in default.

**It is append-only.** Add and change lines; do not delete other people's. A key
you remove silently falls back to a default.

**Restart to apply.** Configuration is read once, at boot.

**`../private/sample.env`** documents every key with its default — copy the lines
you need out of it.

---

## Required settings

A configured install must have `ENTITY`, `DB_NAME`, `DB_HOST`, `DB_USER` and the
language block (`DEDALO_APPLICATION_LANGS`, `DEDALO_APPLICATION_LANGS_DEFAULT`,
`DEDALO_DATA_LANG_DEFAULT`, `PROJECTS_DEFAULT_LANGS`), or the server refuses to
boot — loudly, naming the missing key. See
[§5 Required settings](administration.md#5-required-settings).

## Runtime state is not configuration

Maintenance mode, install status and area overrides live in
`../private/ts_state.json`, written by the application itself. Do not hand-edit it.
