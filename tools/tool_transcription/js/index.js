// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0


/**
* TOOL_TRANSCRIPTION — index.js
* Entry-point barrel for the tool_transcription ES module.
*
* Re-exports every named export from tool_transcription.js so that the
* instances.js loader can resolve the tool by its canonical model string
* ('tool_transcription') using a single, stable import path:
*
*   import { tool_transcription } from '.../tool_transcription/js/index.js'
*
* tool_transcription provides an integrated audio/video transcription workspace
* that surfaces as a floating tool window alongside an AV player. It supports two
* transcription paths:
*
*   1. Browser-local (client-side WASM):
*      A Web Worker running Transformers.js + Whisper ONNX models
*      ('browser_whisper/browser_whisper.js') decodes the audio channel via the
*      Web Audio API (AudioContext, sampleRate 16000 Hz), streams intermediate
*      tokens back through worker messages ('init' → 'on_chunk_start' →
*      'callback_function' → 'end'), and resolves with a Dédalo-formatted HTML
*      value ready for apply_value on the transcription component_text_area.
*      The active model is chosen by the user from the 'transcriber_quality'
*      ontology config; the last selection is persisted in local DB
*      ('transcriber_engine_select' / table 'status').
*
*   2. Server-side (online service):
*      An API call (dd_tools_api / tool_request → server method
*      'automatic_transcription') delegates transcription to a configured external
*      service (e.g. Babel). A second polling action
*      ('check_server_transcriber_status') is used for long-running jobs to track
*      progress by PID until completion.
*
* After transcription, a VTT subtitle file can be generated server-side via
* 'build_subtitles_file' and broadcast to the co-mounted component_av via the
* 'updated_subtitles_file_' + self.id event so the player reloads its captions.
*
* The transcription timecode tag format embedded in paragraph text is:
*   [TC_HH:MM:SS.mmm_TC]
* Every recognised segment becomes a <p> wrapping a text node with this tag
* (produced by parse_dedalo_format).
*
* The tool wires five role-based component instances from its ddo_map:
*   - media_component         — the AV source being transcribed
*   - transcription_component — component_text_area receiving the text output
*   - status_user_component   — user-visible status/notes field
*   - status_admin_component  — admin-only status field
*   - references_component    — optional bibliographic references field
*
* Tool init reads related sections for the transcription component via a
* 'related_search' API call (mode 'related_list') and stores the result in
* self.relation_list; this drives the top_section selector in the UI.
*
* Main exports (from tool_transcription.js):
*   - tool_transcription   — constructor + prototype chain for the tool instance
*   - get_current_lang_info — helper that formats a language entry as
*                             "Label | tld3 | tld2" (e.g. "Greek | lg-ell | el")
*
* Related modules in this directory:
*   - tool_transcription.js        — tool constructor, prototype assignments,
*                                    API actions and worker orchestration
*   - render_tool_transcription.js — DOM/view rendering (called via .edit),
*                                    player controls, tag insertion, status UI
*/


export * from './tool_transcription.js'


// @license-end
