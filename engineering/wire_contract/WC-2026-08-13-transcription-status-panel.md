# WC-2026-08-13-transcription-status-panel — two TS-ONLY client modules inside the twinned `tool_transcription` package

- **Date:** 2026-08-13.
- **Shape before (PHP):** the frozen oracle's `get_dedalo_files` census (harvested
  2026-07-11) lists the `tool_transcription` client package as it stood then —
  `tool_transcription.js`, `render_tool_transcription.js` and the rest. The tool
  reported its failures through `alert()` and a one-line, clipped status string;
  there was no report contract and no status panel, so neither module can appear
  in that census.
- **Shape after (TS):** the same census gains exactly two urls, both under the
  existing tool:
  - `/dedalo/tools/tool_transcription/js/transcription_report.js` — the DOM-free
    failure classifier (a raw worker/browser error → a typed report the panel and
    the tests can both read);
  - `/dedalo/tools/tool_transcription/js/render_transcription_status.js` — the one
    status panel every user-facing failure now flows through.
  Nothing else about the tool's wire changes: no new action, no envelope change.
- **Reason:** a transcription failure used to reach the user as a modal dialog or
  as a truncated line that vanished on the next state change, so the operator's
  only real diagnostic was the browser console. Routing every failure through one
  panel needs the classifier and the renderer as their own modules — the classifier
  is deliberately DOM-free so it is gated as a unit
  (`test/unit/transcription_report.test.ts`). The PHP engine is frozen and can
  never grow either file, so the census divergence is structural.
- **Gate reconciliation:** `test/parity/dedalo_files_differential.test.ts` —
  `isTranscriptionStatusAdditionEntry`, filtered from BOTH sides of the set
  compare, following the
  `WC-2026-08-03-service-dropzone-folded-into-service-upload` ADDITIVE pattern:
  **EXACT urls, never a `startsWith` prefix**. `tool_transcription` HAS a PHP
  twin, so a prefix over the package would stop comparing every file that does
  have one — the same trap the service_upload fold documented. The predicate is
  paired with the positive assertions that the TS census contains exactly these
  two entries and the PHP census contains neither, so deleting a module (or never
  shipping it) fails as loudly as adding an unregistered one. The
  every-TS-url-resolves test still proves both files serve.
- **Fixture interaction (DEC-14b):** NO re-harvest. The gate transforms both
  sides before diffing (the WC-001 pattern), so the frozen PHP-side fixture is
  unchanged.
