# WC-2026-09-30-mcp-search-section-grant — the MCP search / count tools ask the SECTION read grant first

- **Date:** 2026-09-30 (closure Step 3, SEC-1 MCP half).
- **Decision:** owner decisions 2026-09-30. Code: `src/ai/mcp/tools/search.ts`
  (`buildGatedSqo` → `authorizeComponentRead`; the `GatedSqo` brand on
  `runLocatorPage` / `runGatedCount`), `src/ai/mcp/tools/records_read.ts`
  (`searchSectionRecords`).
- **Doors:** MCP `dedalo_search_section`, `dedalo_search_records`,
  `dedalo_count_records`, and `dedalo_find_or_create` (which searches through them).
- **Shape before:** the tools ran the assembler with the principal attached — the
  PROJECTS filter (a record key) and nothing else. A profile holding no grant on the
  section, or only on some of its components, listed, counted and value-probed its
  records; the human read's Gate B refuses exactly that section.
- **Shape after:** `perm.denied` before the SQO is built (before the ontology is walked
  for labels) unless the principal holds the section read grant. The three
  `READ_DOOR_POSTURE` rows move from `record_identity` to `component`.
- **Reason:** the agent reads with the user's authority, never more.
- **Gate reconciliation:** no parity fixture covers MCP tools; no re-harvest. Gates:
  `test/unit/read_door_acl_native.test.ts` (READER and MEDIA-ONLY refused on test2, the
  CONTROL served), `test/unit/authz_door_matrix_native.test.ts`.
