# WC-2026-10-14-diffusion-info-node-database — `get_diffusion_info` nodes carry `database`

- **Date:** 2026-10-14 (tool_diffusion panel: name the target database).
- **Decision:** none (native addition; no DEC).
- **Shape before (PHP):** `section_diffusion_nodes[]` had no database name. The
  panel showed a connection verdict ("Database is ready.") without saying which
  database it was about.
- **Shape after (TS):** every node carries `database: string | null`:

  ```json
  { "tipo": "zzd3", "type": "sql", "connection_status": { "ok": true, "message": "Database is ready." }, "database": "zzd_probe_db" }
  { "tipo": "zzd10", "type": "rdf", "connection_status": null, "database": null }
  ```

  A string ONLY for an `sql` element: `socrata` shares the table target, not
  the concept, so it gets `null`, like every other type. The value is the
  SANITIZED identifier (`requireSqlIdentifier`, the same chokepoint as the
  publish plan and the `connection_status` probe), never the raw ontology
  label: `Web MDCAT` → `web_mdcat`, the database actually written to. If the
  label can't be resolved or is invalid → `null`, never a throw.
- **Reason:** the admin must see WHICH database a panel publishes into and
  which one the verdict is about. The client (`render_tool_diffusion.js`)
  renders a `Database` row for sql and relabels `Name` → `Table name`.
- **Gate reconciliation:** no parity gate replays `get_diffusion_info`, and no
  re-harvest is needed. Gate: `test/unit/diffusion_connection_status.test.ts`
  (`sqlTargetDatabase` unit leg + the real-payload legs: sql panels carry the
  fixture's database, rdf/xml panels carry `null`).
- Server: `src/diffusion/api/info.ts` (`sqlTargetDatabase`, `SectionDiffusionNode.database`).
