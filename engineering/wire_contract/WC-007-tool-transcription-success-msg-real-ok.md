# WC-007 — `tool_transcription` success `msg` is a real "OK." (PHP leaves the error msg on success)

- **Date:** 2026-07-07 (tools production-readiness pass).
- **Shape before (PHP):** `automatic_transcription` (class.tool_transcription.php:402)
  and `check_server_transcriber_status` (:775) never reset the initial
  `msg = 'Error. Request failed [<fn>]'` on their SUCCESS branch — a latent PHP
  bug — so a successful call returns `{result:<babel result>, msg:'Error. …',
  errors:[]}`.
- **Shape after (TS):** the success branch returns the truthful
  `msg:'OK. Transcription job submitted'` (automatic_transcription) /
  `msg:'OK. Request done [check_server_transcriber_status]'`. `result` and
  `errors` are unchanged; only the human-readable `msg` differs, and only on
  success. Deliberate: replicating a "success reported as error" string in a
  production server would poison operator logs and any client that surfaces
  `msg`.
- **Gate reconciliation:** the byte-identical client contract is preserved — the
  client reads only `response.result` here (the `test_tool_transcription`
  client gate is green), so the `msg` text is not part of the wire the client
  depends on. Cited at both return sites in
  `tools/tool_transcription/server/index.ts`.
