# dd_date — the `date` data object

> See also: [Sections — typed-column storage](../sections/index.md#storage-detail-the-data-column-is-split-into-typed-jsonb-columns) · [component_date](../components/component_date.md) · [Components index](../components/index.md)

This page documents the **DATE data type** itself — the value object that Dédalo
stores in the matrix `date` column — not the component that edits it. For the
editing component (views, properties, import/export, search UI) see
[component_date](../components/component_date.md).

---

## 1. What it is and why it exists

The DATE value in Dédalo is modelled by **`dd_date`**
(`core/common/class.dd_date.php`), a **locale-aware, timestamp-free value
object**. It is the normalized representation of every calendar value the system
stores.

It exists because PHP's native `DateTime` and Unix timestamps **cannot**
represent the dates a cultural-heritage / archaeological database routinely needs:

- **BCE dates** — a Unix timestamp has no notion of "44 BCE".
- **Very large CE years** — beyond the representable integer range.
- **Partial dates** — a bare year (`1930`), or year + month (`2022-04`), with no
  day, hour or finer field.

Instead of an absolute epoch offset, `dd_date` stores **each calendar field as a
plain nullable integer** and supplies its **own arithmetic** for sorting and
serialization. Any field may be `null` (unspecified); nothing forces a complete
date.

!!! info "One data object, six date modes"
    `dd_date` itself has **no** calendar/era field and **no** type/period field.
    Whether a value is a single date, a range, a period (duration) or a clock
    time is decided entirely by **which container key wraps the object**
    (`start` / `end` / `period`) and by the producing component's `date_mode`
    property — never by a flag on `dd_date`. See
    [§4 Components that produce it](#4-components-that-produce-it).

---

## 2. Canonical JSON shape

`dd_date` implements `JsonSerializable`. `jsonSerialize()` calls
`get_object_vars()`, **unsets `errors`**, then `array_filter`s out every `null`
field. The result is a **sparse map of only the non-null fields**:

```php
public function jsonSerialize() : mixed {
    $vars = get_object_vars($this);
    unset($vars['errors']);              // internal validation artifact, never serialized
    return array_filter($vars, fn($val) => $val !== null);
}
```

So a year-only date serializes to exactly `{"year":1930}` — absent fields simply
do not appear.

### All fields

These are the fields a `dd_date` can carry. **Public** fields serialize as
plain keys; **private** fields are reached through getters/setters and only
appear in JSON when they were set.

| Key | Visibility | Type | Range | Notes |
| --- | --- | --- | --- | --- |
| `day` | public | `?int` | 1–31 | validated against month length / leap year by `check_day()` |
| `month` | public | `?int` | 1–12 | |
| `year` | public | `?int` | any integer | **negative = BCE** (e.g. `-44` = 44 BCE); no range constraint |
| `hour` | public | `?int` | 0–23 | |
| `minute` | public | `?int` | 0–59 | |
| `second` | public | `?int` | 0–59 | |
| `time` | public | `?int` | — | **monotonic sort value in seconds**, *not* a Unix timestamp (see [§ The `time` sort value](#the-time-sort-value)) |
| `ms` | private | `?int` | 0–999 | milliseconds; serialized as the key `ms` when set (the component docs label this field "millisecond") |
| `op` | private | `?string` | `>` `<` `>=` `<=` `=` | comparison operator, used **only during search**; absent on stored values |
| `timestamp` | private | `?string` | — | raw round-trip string preserved verbatim (`set_timestamp()`); not derived |
| `errors` | private | `array` | — | validation errors — **always stripped** from serialization |

!!! warning "`time` is server-authoritative, never author it by hand"
    `time` is the absolute-seconds ordinal produced by
    `dd_date::convert_date_to_seconds()`. On every `component_date::save()` it is
    recomputed and injected into each container (`add_time()` /
    `build_dd_date_with_time()`); an incoming `time` that diverges from the
    recalculated one is logged as a WARNING and the **calculated** value wins.
    Supply only year/month/day/hour/minute/second.

### Static configuration

`dd_date` carries class-level constants used by the formatters and the
sort-seconds arithmetic (they are not part of any value):

| Static | Value | Purpose |
| --- | --- | --- |
| `$separator` | `'/'` | date-component separator for formatted output |
| `$time_separator` | `':'` | clock-component separator |
| `$virtual_year_days` | `372` (= 31 × 12) | days per *virtual* year in the sort-seconds model |
| `$virtual_month_days` | `31` | days per *virtual* month in the sort-seconds model |

---

## 3. Database column and keying

The DATE data object lives in the matrix **`date` typed JSONB column**.

As described in [Sections — typed-column storage](../sections/index.md#storage-detail-the-data-column-is-split-into-typed-jsonb-columns),
the single conceptual record `data` payload is physically split across typed
JSONB columns so PostgreSQL can index each shape. `section_record_data::$column_map`
routes the `component_date` model to the `date` column.

Inside that column, the value is **keyed by the component's ontology `tipo`**,
and `component_date` is non-translatable, so the language key is always
`lg-nolan`:

```json
{
  "rsc85": {
    "lg-nolan": [
      { "start": { "year": 1999, "month": 1, "day": 1, "time": 64249459200 } }
    ]
  }
}
```

- `rsc85` — the component tipo (the "column" within the section).
- `lg-nolan` — the fixed language slot (dates are language-independent).
- the value is an **array** of *record items*; each item holds one or more
  containers (`start` / `end` / `period`) whose values are `dd_date` shapes.

Ordering uses the `time` ordinal: `component_date::get_order_path()` sorts by the
JSONB `start->time` path. The **only** exception is the Time Machine timestamp
component (tipo `dd559`, `DEDALO_TIME_MACHINE_COLUMN_TIMESTAMP`), which is special
-cased to order by the literal `timestamp` SQL column instead of a JSONB path.

---

## 4. Components that produce it

The DATE data object is produced and consumed exclusively by
**[component_date](../components/component_date.md)** (`core/component_date/class.component_date.php`),
a literal-direct, non-translatable component.

`component_date` does **not** store a `dd_date` as the unit of data. It stores an
**array of plain record objects**; the `start` / `end` / `period` values inside
those records are what become `dd_date` instances (re-hydrated with
`new dd_date($container)` wherever the component needs to format, sort or search).

The ontology property **`date_mode`** (default `'date'`) selects which containers
and fields a record uses:

| `date_mode` | Containers | Fields used |
| --- | --- | --- |
| `date` *(default)* | `start` | year → day |
| `range` | `start`, `end` | year → day |
| `period` | `period` | year / month / day reinterpreted as a **duration count** |
| `time` | `start` | hour / minute / second only |
| `time_range` | `start`, `end` | clock fields only |
| `date_time` | `start` | full year → second |

Key integration points on `component_date`:

- `save()` → `add_time()` injects/recomputes `time` per container (client `time`
  is never trusted).
- `data_item_to_value()`, `get_list_value()`, `get_export_value()` render a
  record to text per `date_mode`.
- `get_diffusion_value()` emits a MySQL-style `Y-m-d H:i:s` string.
- `conform_import_data()` parses CSV/JSON into the array form (handling
  `ymd`/`dmy`/`mdy` order, `<>` ranges, `|` multi-value and BCE signs).
- `get_order_path()` orders by `start->time` (or the literal `timestamp` column
  for `dd559`).

---

## 5. Server class

`dd_date` is the server class (`core/common/class.dd_date.php`) — a concrete,
final value object (nothing extends it) that implements `JsonSerializable`.

Construction hydrates from a plain object, dispatching each key to its
`set_<key>()` method (the `format` key is skipped):

```php
$dd_date = new dd_date( (object)[ 'year' => -44, 'month' => 3, 'day' => 15 ] );
echo json_encode($dd_date);          // {"day":15,"month":3,"year":-44}
echo $dd_date->get_dd_timestamp();   // -0044-03-15 00:00:00
```

### Validation

Setters log a **WARNING** on out-of-range values but still store them. With
`$constrain = true` (strict parse mode) they instead push to `errors` and return
`false`. After hydration the constructor runs `check_day()`, which validates the
day against the month — including leap-year logic (`year % 4 / 100 / 400`), so
`day = 30` in February or `day = 31` in April is rejected. Inspect
`get_errors()` to learn whether an instance is valid.

### The `time` sort value

`convert_date_to_seconds()` builds an **ordinal** (in seconds) using *virtual*
units — a year is 372 days (31 × 12), a month is 31 days — and decrements
month/day by 1 so the epoch (year 0, month 1, day 1) maps to `0`. This makes
"January 1 of year N" and "year N alone" sort **identically**, so partial dates
order correctly beside full ones. It handles negative (BCE) years.

!!! danger "`time` is not reversible"
    `time` is an ordinal *position*, **not** an absolute wall-clock time. It must
    **never** be fed to PHP's `date()` / `DateTime`. For genuine in-range
    interop, `get_unix_timestamp()` / `get_dd_date_from_unix_timestamp()` exist —
    but those carry all the usual Unix-epoch limitations and break for BCE / very
    large years. Use `convert_date_to_seconds()` for cross-era arithmetic.

### BCE and partial-date formatting

`get_dd_timestamp()` is Dédalo's own formatter: it performs a **plain string
substitution** over the `Y m d H i s u` placeholders rather than calling PHP's
`date()`, so negative years and out-of-Unix-range years format correctly. Bare
years can be emitted unpadded (`get_dd_timestamp('Y', $padding=false)`).

### Search range expansion

`component_date::get_final_search_range_seconds()` widens a partial-date query
into an inclusive upper bound: it advances the least-significant set field by one
and subtracts 1 second (searching `2000` matches everything up to
`start-of-2001 − 1s`); for clock time it fills finer fields to their maxima
(`:59`, `:59:59`). The `op` field on `dd_date` carries the comparison operator
during this search use. See the [search subsystem](../components/component_date.md#import-export-model).

---

## 6. Client-side model

In the JSON API the value reaches the browser inside the component datum's
`data.value` layer (see [Components → data](../components/index.md#data)). Because
the component is non-translatable, the data slot is keyed by `lg-nolan`:

```json
{
  "tipo": "rsc85",
  "lang": "lg-nolan",
  "value": [
    { "start": { "year": 2012, "month": 11, "day": 7, "time": 64638475292 } }
  ]
}
```

The client model (`core/component_date/js/component_date.js`) treats a `dd_date`
as a plain object carrying any subset of
`{ year, month, day, hour, minute, second, millisecond, time }`, wrapped by the
container that matches `date_mode`:

```javascript
// shapes the client builds / consumes, per date_mode
date / date_time   →  { start: dd_date }
range              →  { start: dd_date, end: dd_date }
time / time_range  →  { start: dd_date [, end: dd_date] }
period             →  { period: { year, month, day } }
```

The client **never** authors `time` (it is recomputed server-side on save) and
reads the display order (`dmy` / `ymd` / `mdy`) from the global
`page_globals.dedalo_date_order`, not from a per-component property. Parsing,
formatting and the flatpickr editor all live in the JS model; mismatched fields
are flagged rather than silently coerced.

---

## 7. Examples

A record item is one entry of the value array. The shapes below are exactly as
stored in the `date` column.

**Single full datetime (range):**

```json
[
  {
    "start": { "year":2012, "month":11, "day":7, "time":64638475292, "hour":17, "minute":33, "second":49 },
    "end":   { "year":2012, "month":12, "day":8, "time":64641254135, "hour":22, "minute":15, "second":35 }
  }
]
```

**Partial date (year + month only)** — `time` is server-computed on save, so a
partial item simply omits the finer fields:

```json
[ { "start": { "month":4, "year":2022 } } ]
```

**BCE year-only date** — for a year-only value the `time` ordinal reduces to
`year × 372 × 86400` (here `-205 × 372 × 86400 = -6588864000`):

```json
[ { "start": { "year":-205, "time":-6588864000 } } ]
```

**Period (duration) — *3 years 2 months 15 days*** (year/month/day are duration
counts, not an absolute date):

```json
[ { "period": { "year":3, "month":2, "day":15 } } ]
```

**Clock time only (`time` mode):**

```json
[ { "start": { "hour":17, "minute":33, "second":49 } } ]
```

**Multi-value (several record items in one component):**

```json
[
  { "start": { "year":1852, "month":12, "day":22 } },
  { "start": { "year":1853, "month":2,  "day":18 } }
]
```

How these resolve to text (`data_item_to_value()`), per mode:

```text
range        →  "2012/11/07 <> 2012/12/08"
year+month   →  "2022/04"                    (Y/m, zero-padded)
BCE year     →  "-205"                        (bare year, padding disabled)
period       →  "3 years 2 months 15 days"   (localized labels)
time         →  "17:33:49"
```

!!! note "Graceful degradation of partial dates"
    Rendering follows the fields that are present: `Y/m/d` → `Y/m` → `Y`
    (padding disabled for bare years). A range is rendered `start <> end`; a
    period as *"N years N months N days"* via localized labels.

---

## 8. v7 consolidation / evolution

- **Single source of truth for the type.** `dd_date` is the one normalized
  representation of every calendar value; `component_date` builds on it rather
  than re-implementing date logic, and other subsystems (search, export,
  diffusion, Time Machine) reuse the same object.
- **`JsonSerializable` sparse output.** Emitting only non-null fields keeps the
  `date` column compact and makes partial dates first-class — there is no "empty
  day = 0" noise to interpret on read.
- **Server-authoritative `time`.** `time` is recomputed on every save and never
  trusted from the client, so the range-search index stays consistent regardless
  of what a client sent. Treat `time` as derived, not as input.
- **Timestamp-free by design.** The deliberate break from PHP `DateTime` /
  Unix timestamps is what lets Dédalo store BCE, far-future and partial dates
  uniformly; the Unix-interop helpers remain only for in-range convenience and
  carry explicit limitations.

---

## See also

- [component_date](../components/component_date.md) — the component that edits, validates, imports/exports and searches this value.
- [Sections — typed-column storage](../sections/index.md#storage-detail-the-data-column-is-split-into-typed-jsonb-columns) — where the `date` column sits among the typed JSONB columns.
- [Components index](../components/index.md) — the component typology and the datum `context` / `data` layers.
