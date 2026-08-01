# WC-040 — activity log: the full 16-code WHAT map is emitted, and `relation.dd550` (PROJECTS) is not written

- **PHP:** `logger_backend_activity` defines 16 WHAT codes (dd42) and its
  `log_message_defer` writes SIX columns per row: `relation` (dd543 WHO +
  dd545 WHAT + **dd550 PROJECTS**), `string` (dd544 IP, dd546 WHERE), `date`
  (dd547 WHEN), `misc` (dd551 payload).
- **TS before this entry:** only 4 of the 16 codes had an emitter (SAVE,
  DELETE, LOAD EDIT, LOAD LIST) while the READ side
  (`area_maintenance/user_stats.ts` `WHAT_MAP`) already resolved all 16 — so
  every `user_activity` chart was structurally limited to those four.

### Emitters (now at parity with the v6 producer set)

Eight emitters added: LOG IN (1), LOG OUT (2), NEW (3), UPLOAD COMPLETE (11),
DELETE FILE (12), RECOVER SECTION (13), RECOVER COMPONENT (14), NEW VERSION
(16). Payload keys mirror the PHP call sites verbatim.

**Four codes are mapped but have NO emitter — in TS *or* PHP:**

| Code | Status |
|---|---|
| SEARCH 8, UPLOAD 9, STATS 15 | Defined in PHP's `$what` but never passed to `log_message()` anywhere in v6 or frozen v7. Never implemented. |
| DOWNLOAD 10 | A **v5-era** event ("download file by tool av / image / pdf") **lost in the v6 migration**. `matrix_activity` holds dd1080 rows from 2019-2020 and none after; the v5→v6 upgrade map still translates it. |

They stay in `WHAT_CODES` deliberately: the map mirrors dd42, the read side
needs the codes to interpret legacy rows, and reinstating DOWNLOAD is an OPEN
question rather than a closed one.

### Divergences (deliberate)

- **`relation.dd550` is NOT written.** PHP attaches the actor's project
  locators (`filter::get_user_projects`, re-stamped to
  `from_component_tipo: dd550`). The TS INSERT writes `relation/string/date/
  misc` only, so no TS-written row carries the projects dimension — including
  every row written since the cutover. Consumers that filter activity by
  project therefore see nothing from the TS era. Ledgered, not fixed: filling
  it needs the project-filter port, which is separate scope.
- **The success `LOG IN` payload omits `browser` and `DB-backup`.** PHP reads
  `$_SERVER['HTTP_USER_AGENT']`; the TS request path carries no user-agent at
  all, and inventing one would be worse than omitting it.
- **Two failure causes have no PHP twin** — `Too many failed attempts
  (throttled)` and `Server under maintenance` — because neither mechanism
  exists in v6. Both are logged: a lockout is precisely the event an operator
  auditing the trail wants to see.
- **Login failures record the actor as `-666`** (`ANONYMOUS_USER_ID`), PHP's
  own sentinel — nobody is authenticated yet, so the attempted username lives
  in the payload instead.

### Gate

`test/unit/activity_log_native.test.ts` (DEC-14b twin) — SAVE + DELETE were
already pinned; NEW and the LOG IN allow/deny pair are added here.
