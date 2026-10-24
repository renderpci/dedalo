# WC-2026-10-21-tool-permissions-description — `tool_description` on the dd1067 datalist items (TS-only)

- **Date:** 2026-10-21.
- **Shape:** the dd1067 security-tools datalist enrichment (`getDatalist`,
  `src/core/relations/datalist.ts`) stamps a third key next to `tool_name` /
  `always_active`: `tool_description` — the tool registry record's `dd612`
  description resolved in the datalist lang through the fallback chain
  (`getActiveToolMetaBySectionId(lang)`, `src/core/tools/registry.ts`), raw stored
  HTML, `null` when the tool has none or is unregistered. Every other datalist
  stays without it. PHP `tool_common::hydrate_tools_info` has NO twin.
- **Why:** the profile tool-permissions panel (`view_tools_edit_check_box.js`)
  listed tools by name only; an admin granting a tool could not tell what it
  does. The description is already in the registry row the enrichment reads —
  no extra query.
- **Client effect:** a row with a non-empty description shows an info toggle;
  the description renders folded under the row as plain text (tags stripped,
  escaped — never trusted HTML).
- **Gates:** `test/unit/datalist_build_native.test.ts` (key present on dd1067,
  null for unregistered options, absent elsewhere; a registered tool's
  description equals its `register.json` value per lang).
