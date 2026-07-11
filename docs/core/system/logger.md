# logger

> See also: [Architecture overview](../architecture_overview.md) · [Sections](../sections/index.md) · [section_record](../sections/section_record.md)

In the PHP server, `logger` was a static facade over a numeric severity scale and
a registry of pluggable backends, sitting underneath both the `debug_log()`
error-log stream and the persisted user-activity audit trail. The TS rewrite keeps
**only the activity audit trail** — as a plain engine module,
`src/core/resolve/activity_log.ts` — and drops the facade, the severity scale, the
backend registry and the `debug_log()` diagnostic stream.

This page documents what the TS server actually does for logging, and is honest
about what is gone.

## Role

There is no `logger` facade and no `logger_backend_*` family in the TS server.
Logging splits into two independent pieces, exactly as in PHP — but only the audit
piece is a real subsystem:

| consumer | PHP | TS | notes |
| --- | --- | --- | --- |
| **diagnostic / developer stream** | `debug_log()` (~1,700 call sites) gated by `LOGGER_LEVEL` | plain `console.error` / `console.log` | no severity scale, no `LOGGER_LEVEL` threshold, no per-user gate. See the gap note. |
| **user-activity audit trail** | `logger::$obj['activity']->log_message(...)` → `matrix_activity` | `logActivity(entry)` (`src/core/resolve/activity_log.ts`) → `matrix_activity` | ported: the audit rows still persist through the normal matrix machinery. |

The activity path persists through the normal matrix write: `activity_log.ts`
builds the typed-column payload directly and `INSERT`s it into `matrix_activity`
(section tipo `dd542`), so an activity record is an ordinary matrix record — a
client of [sections](../sections/index.md), not a parallel storage path.

!!! note "The facade and severity scale are gone"
    There is no static `logger` class, no `logger::DEBUG..CRITICAL` constants, no
    `LOGGER_LEVEL`, no `register()`/`get_instance()` backend registry, and no
    abstract `logger_backend` contract. The concept that survives is "append a
    structured audit row per state-changing action"; the mechanism is a single
    function, not a factory.

## Responsibilities (of the ported activity path)

- **Audit write** — `logActivity(entry)` appends one row to `matrix_activity`
  (section `dd542`) for a state-changing API action.
- **WHAT mapping** — map the action name to its `dd42` event code (the ported
  subset: `LOGIN=1`, `DELETE=4`, `SAVE=5`, `LOAD=7`); an **unmapped** action is
  skipped, never guessed.
- **Fail-open on the action** — the write is wrapped in `try/catch` and swallows
  its own errors (logging to `console.error`): an audit write must never break the
  user action (the PHP posture, preserved).

The activity path deliberately does **not** decide diagnostic verbosity or provide
a general logging API — there is none.

## Key concepts

### The activity audit model

`logActivity()` records each user action as a record in `matrix_activity`, built
directly as the typed-column payload. The six-column model is preserved
conceptually:

| field | component tipo | matrix column | source |
| --- | --- | --- | --- |
| IP / host | `dd544` | `string` | the resolved client host (`::1`/`127.0.0.1` → `localhost`) |
| WHO | `dd543` | `relation` | a locator into the Users section (`dd128`) for the acting `userId` |
| WHAT | `dd545` | `relation` | a locator into `dd42` — the event code from the WHAT map |
| WHERE | `dd546` | `string` | the `tipo` being acted on |
| WHEN | `dd547` | `date` | the virtual-calendar instant (`virtualDateNow`) |
| DATA | `dd551` | `misc` | the `datos` payload (`[{lang:'lg-nolan', value: …}]`) |

The `section_id` is allocated by the `matrix_activity_section_id_seq` Postgres
sequence — the insert omits `section_id` (the `dd542` matrix counter deliberately
is not the allocator here).

!!! note "Only mapped actions are logged"
    The TS WHAT map covers `LOGIN` / `DELETE` / `SAVE` / `LOAD` (the codes observed
    live). PHP carried a larger `$what` table (`UPLOAD`, `DOWNLOAD`, `SEARCH`,
    `RECOVER …`, `STATS`, …); those are **not yet mapped** in the TS activity
    logger (see the gap note). An action with no code is skipped, not written with
    a wrong code.

### No deferral / batching

PHP's `log_message()` queued entries and flushed them at request shutdown (a
`register_shutdown_function`, with a `MAX_QUEUE_SIZE` early-flush). The TS
`logActivity()` writes **inline** within the request (still best-effort: it
swallows write errors). There is no shutdown-flush queue and no
`register_shutdown_function` in the single Bun process. The `enable_log` global
switch and the `$excluded_section_tipos` / self-log loop-guard from the PHP backend
are likewise not reproduced — the TS logger only fires from the specific dispatch
sites below, so the self-logging loop cannot occur.

## Files & structure

```text
src/core/resolve/
└── activity_log.ts   # logActivity(entry) → matrix_activity (section dd542)
```

Related:

- `src/core/api/dispatch.ts` — calls `logActivity({what:'SAVE'|'DELETE'|…})` after
  the corresponding state-changing action.
- `src/core/security/auth.ts` — the login path (the `LOGIN` audit).
- `src/core/resolve/diffusion_delete.ts` — its own diffusion activity log (dd1758),
  separate from the core activity trail.
- `src/core/db/postgres.ts` — the `sql` handle the insert runs through.

## Public API

### `activity_log.ts`

| symbol | purpose |
| --- | --- |
| `logActivity(entry, now?)` | Append one `matrix_activity` row for a state-changing action. Returns early (no write) when `entry.what` has no mapped `dd42` code. Never throws. |
| `ActivityEntry` | The input shape: `{ what, tipo, userId, host, datos }`. |

`ActivityEntry` fields:

| field | purpose |
| --- | --- |
| `what` | the action name; mapped to a `dd42` code (`LOGIN`/`DELETE`/`SAVE`/`LOAD`). |
| `tipo` | the WHERE tipo (component tipo for saves, section tipo for deletes). |
| `userId` | the acting user (WHO locator into `dd128`). |
| `host` | the resolved client host string. |
| `datos` | the `dd551` payload (`msg` + action-specific fields). |

There is **no** `logger` facade, no `level_to_string()`, no `register()` /
`get_instance()`, no `logger_backend` base, and no global `debug_log()`.

## Gaps vs PHP `logger`

Documented honestly (see [STATUS.md](../../../rewrite/STATUS.md)):

- **Severity facade + `debug_log()`** — not ported. Diagnostic logging is plain
  `console.error` / `console.log` with no numeric level, no `LOGGER_LEVEL`
  threshold and no per-user (`SHOW_DEBUG`/`SHOW_DEVELOPER`) gate. A future
  structured logger would add this back if needed.
- **Pluggable backends** — not ported. There is one hardcoded audit sink
  (`matrix_activity`); the connection-string → `logger_backend_<scheme>` factory
  has no analogue.
- **Full WHAT vocabulary** — only `LOGIN`/`DELETE`/`SAVE`/`LOAD` are mapped; the
  upload/download/search/recover/stats event codes are not yet wired.
- **Deferred flush + loop-guard + enable switch** — the shutdown-queue batching,
  the self-log exclusion map and the `enable_log` toggle are not reproduced (the TS
  logger writes inline from fixed sites).

## How it fits with the rest of Dédalo

- **[Sections](../sections/index.md) / [section_record](../sections/section_record.md)** —
  the activity write is an ordinary `matrix_activity` insert of section `dd542`,
  built with the same typed-column model as any record. The
  [db layer](db.md)'s `sql` handle runs it.
- **API layer** — `core/api/dispatch.ts` emits `SAVE`/`DELETE` audit after the
  corresponding action, and `security/auth.ts` emits `LOGIN`.
- **Diffusion** — `resolve/diffusion_delete.ts` writes its own diffusion activity
  log (dd1758), the analogue of PHP's `diffusion/class.diffusion_activity_logger.php`;
  it is not part of the core activity trail.

## Examples

### Writing a user-activity record (a save)

```ts
import { logActivity } from '../resolve/activity_log.ts';

await logActivity({
    what: 'SAVE',                 // mapped to dd42 code 5
    tipo: source.tipo,            // the WHERE tipo
    userId: principal.userId,     // the WHO locator into dd128
    host,                         // resolved client host ('localhost' for ::1)
    datos: {                      // the dd551 payload
        msg: 'Saved component data',
        lang: source.lang ?? 'lg-nolan',
        tipo: source.tipo,
    },
});
```

### Diagnostic logging (no facade)

```ts
// There is no debug_log()/logger::DEBUG. Diagnostics are plain console output:
console.error('activity log write failed (swallowed):', error);
```

## Related

- [Architecture overview](../architecture_overview.md) — where the work-system
  server sits relative to data and diffusion.
- [Sections](../sections/index.md) · [section_record](../sections/section_record.md)
  — the matrix storage the activity write uses.
- [db](db.md) — the `sql` handle and matrix write path the audit row runs through.
- [Locator](../locator.md) — the pointer type stored in the WHO / WHAT columns of
  an activity record.
