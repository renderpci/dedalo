# WC-067 — `get_diffusion_info` node `connection_status` is `{result,msg}|null` (2026-07-29)

- **Date:** 2026-07-29 (tool_diffusion accordion showed an EMPTY "Connection
  status" value; root-caused the same day).
- **Decision:** restore the PHP OBJECT contract the client was always written
  against, and make the verdict a REAL target-database probe instead of a
  compile-time writer-registry lookup.
- **Shape before (PHP):** `dd_diffusion_api::get_diffusion_info` →
  `diffusion_utils::get_section_diffusion_nodes` (`class.diffusion_utils.php:245-289`)
  emitted **exactly** `{tipo, model, label, parents[], children[]}` — no `type`
  and no `connection_status`. The `connection_status` object itself existed on
  the SIBLING surface `get_diffusion_map` (`:945` →
  `get_connection_status :971`), where it was `{result:bool, msg:string}` for
  `type === 'sql'` and `null` for every other type (`default: // ignore`,
  `:1002`); PHP obtained the verdict by asking the (now retired) external Bun
  engine `check_database` (`database_exits :1013`). The retired external engine
  stamped readiness onto the info nodes, which is why the copied client reads
  it there.
- **Shape after (TS):** each `section_diffusion_nodes[]` entry carries the two
  ADDITIVE fields `type: string|null` (element `properties->diffusion->type`,
  resolved from the parents path) and
  `connection_status: {result: boolean, msg: string} | null`:
  - `null` whenever the element does not publish into a MariaDB database —
    the client's truthiness gate then omits the whole row (PHP's null rule);
  - otherwise a live `SELECT 1` against the resolved target database
    (`getDatabaseNameForElement`), with PHP's **verbatim** strings
    `"Database is ready."` / `"Database is NOT ready (missing or engine
    unreachable)."`.
  The probed name is the label put through `requireSqlIdentifier`, the SAME
  chokepoint the publish plan (`compile.ts:576`) and the delete map
  (`diffusion_map.ts:488`) use — `getDatabaseNameForElement` returns the raw
  institution-editable ontology label, and that helper NORMALIZES (lowercase,
  non-`[a-z0-9_]` → `_`). Probing the raw label would address a DIFFERENT
  database than the one written to (`Web MDCAT` publishes to `web_mdcat`) and
  report a healthy target as dead — the DIFF-A raw-vs-sanitized drift
  (`src/core/db/sql_identifier.ts:5-16`) on the read side. Pinned by the
  `probe addresses the SANITIZED database` test.
- **Deviations from the PHP strings/semantics (the only three):**
  1. **`socrata` also answers.** PHP answered for `'sql'` alone. Natively
     `socrata` publishes through the same MariaDB table target
     (`TABLE_FORMATS`, `src/diffusion/plan/formats.ts`), so the verdict is
     meaningful for it and suppressing it would be a lie by omission. Both
     formats come from ONE list, shared with the plan compiler's identifier
     chokepoint — never a fork.
  2. **An unresolvable target database name** — no `database`/`database_alias`
     node on the element path, OR a label that cannot sanitize to a valid
     identifier — yields the same `result:false` object plus a
     `console.warn`, where PHP would have asked the engine with an empty name.
     The compiler treats that state as a compile ERROR; an observability panel
     must render "not ready", not throw and blank the accordion.
  3. **The probe never evicts the writer's pool.** `probeTargetDatabase()`
     (the writer `open()` gate) closes and evicts the shared pool on failure;
     an admin opening a panel must not tear down a pool a live publication is
     using, so `getTargetDatabaseStatus()` is a separate non-evicting,
     non-throwing path with a 3s ceiling (Bun's default `connectionTimeout` is
     30s — a black-holed host would otherwise hang the request) and a 10s
     per-database memo so N panels cost ONE round-trip.
- **Interim TS defect this closes (never shipped to a fixture):** between the
  native-diffusion cutover and today, `src/diffusion/api/info.ts:47/:114`
  emitted the BARE STRING `'ok' | 'unavailable'` stamped from
  `WRITER_REGISTRY.has(type)` — a compile-time "do we have a writer" fact, not
  reachability. The client rendered the label (a string is truthy), a BLANK
  value (`'ok'.msg` is undefined) and css class `value fail`
  (`'ok' === true` is false) for every node including healthy ones.
- **Gate reconciliation:** **no re-harvest, and no parity gate moves.** The
  frozen fixture's only `connection_status` occurrences
  (`test/parity/fixtures/oracle_harvest/widgets_differential.json:11414/:11428/:11442`)
  belong to the `publication_api` widget's `value.diffusion_map` — the
  `get_diffusion_map` surface, NOT `get_diffusion_info` — and
  `test/parity/widgets_differential.test.ts:98-120` omits the `value` key from
  the byte compare for all widgets. No fixture is edited. The new contract is
  held mechanically by `test/unit/diffusion_connection_status.test.ts`
  (`{result,msg}|null`, never a bare string; null exactly for non-MariaDB
  formats; probe failure degrades instead of throwing; the format list is the
  compiler's; the client still reads `.result`/`.msg`) plus the compile-time
  type pin, and the memo is allowlisted with its lifecycle in
  `test/unit/module_state_tripwire.test.ts`.
