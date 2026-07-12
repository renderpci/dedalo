# Activity log

> See also: [Architecture overview](../architecture_overview.md) ·
> [Sections](../sections/index.md) ·
> [section_record](../sections/section_record.md) · [db](db.md)

The **user-activity audit trail**: one structured row per state-changing action,
appended to `matrix_activity`. It is what answers "who changed what, and when".

`src/core/api/handlers/activity_log.ts` is the whole subsystem — one function, one
sink. There is no logging facade, no severity scale and no pluggable-backend
registry: diagnostic output is plain `console` logging, and the audit trail is a
matrix write.

## Role

An activity record is an **ordinary matrix record**, not a parallel storage path.
`logActivity(entry)` builds the typed-column payload and inserts it into
`matrix_activity` (section tipo `dd542`), through the same
[db layer](db.md) as any other write.

## Responsibilities

- **Audit write** — append one row to `matrix_activity` for a state-changing API
  action.
- **WHAT mapping** — map the action name to its `dd42` event code. An **unmapped**
  action is skipped, never guessed with a wrong code.
- **Never break the action** — the write is wrapped in `try`/`catch` and swallows
  its own errors to `console.error`. An audit write must never fail the user's
  save.

## The audit model

Each action is recorded as six typed columns:

| field | component tipo | matrix column | source |
| --- | --- | --- | --- |
| IP / host | `dd544` | `string` | the resolved client host (`::1` / `127.0.0.1` → `localhost`) |
| WHO | `dd543` | `relation` | a locator into the Users section (`dd128`) for the acting user |
| WHAT | `dd545` | `relation` | a locator into `dd42` — the event code |
| WHERE | `dd546` | `string` | the `tipo` being acted on |
| WHEN | `dd547` | `date` | the virtual-calendar instant |
| DATA | `dd551` | `misc` | the action payload (`[{lang:'lg-nolan', value: …}]`) |

The event codes are `LOGIN = 1`, `DELETE = 4`, `SAVE = 5`, `LOAD = 7`.

!!! warning "The section_id comes from the sequence, not the counter"
    The insert **omits** `section_id` and lets the
    `matrix_activity_section_id_seq` Postgres sequence allocate it. The `dd542`
    matrix counter is deliberately *not* the allocator here — do not "fix" this by
    routing the insert through the counter.

## Where it fires

The audit is written from the API dispatch path, inline within the request. There
is no deferred queue and no shutdown flush.

| action | emitted from |
| --- | --- |
| `SAVE` | `src/core/api/handlers/dd_core_api.ts` — after a component save |
| `DELETE` | `src/core/api/handlers/dd_core_api.ts` — after a record delete, per deleted record |

Diffusion keeps a **separate** trail: `src/core/diffusion_bridge/diffusion_delete.ts`
logs unpublish outcomes to the diffusion activity log (`dd1758`). It is not part of
the core audit trail.

Because the logger fires only from these fixed sites, an audit write can never
trigger another audit write — the self-logging loop is impossible by construction
rather than guarded against.

## The surface

`src/core/api/handlers/activity_log.ts`:

| symbol | purpose |
| --- | --- |
| `logActivity(entry, now?)` | Append one `matrix_activity` row. Returns early — no write — when `entry.what` has no mapped `dd42` code. **Never throws.** |
| `ActivityEntry` | The input shape: `{ what, tipo, userId, host, datos }`. |

`ActivityEntry` fields:

| field | purpose |
| --- | --- |
| `what` | The action name, mapped to a `dd42` code. |
| `tipo` | The WHERE tipo — the component tipo for a save, the section tipo for a delete. |
| `userId` | The acting user (the WHO locator into `dd128`). |
| `host` | The resolved client host string. |
| `datos` | The `dd551` payload: a message plus action-specific fields. |

## What the audit feeds

The activity rows are read back by two consumers:

- the **area dashboard** — `metricActivity` (`src/core/area/dashboard.ts`) queries
  `matrix_activity` directly with JSONB operators to build the per-day,
  per-section, per-user activity chart. See
  [area → the dashboard payload](../areas/area.md#the-dashboard-payload).
- **user statistics** — `src/core/area_maintenance/user_stats.ts` aggregates the
  rows into per-user, per-day totals for the maintenance area.

## Diagnostics

Diagnostic output is plain `console` logging. There is no severity scale, no
verbosity threshold and no per-user debug gate.

```ts
console.error('activity log write failed (swallowed):', error);
```

## Example

```ts
import { logActivity } from './activity_log.ts';

await logActivity({
    what: 'SAVE',                 // → dd42 code 5
    tipo: source.tipo,            // the WHERE tipo
    userId: principal.userId,     // the WHO locator into dd128
    host,                         // resolved client host ('localhost' for ::1)
    datos: {
        msg: 'Saved component data',
        lang: source.lang ?? 'lg-nolan',
        tipo: source.tipo,
    },
});
```

## Related

- [Architecture overview](../architecture_overview.md) — where the work-system
  server sits relative to data and diffusion.
- [Sections](../sections/index.md) · [section_record](../sections/section_record.md)
  — the matrix storage the activity write uses.
- [db](db.md) — the `sql` handle the audit row runs through.
- [Locator](../locator.md) — the pointer type stored in the WHO and WHAT columns.
- [area](../areas/area.md) — the dashboard that charts the activity rows.
