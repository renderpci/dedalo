# WC-2026-09-30-transcription-record-tipo — tool_transcription's record doors go through the write door

- **Date:** 2026-09-30 (closure Step 3, TOOLS-3 + widening).
- **Decision:** owner decisions 2026-09-30. Code: `tools/tool_transcription/server/index.ts`
  (`gateRecord` → `write_door.authorizeRecordAccess`; `backgroundTranscriberPoll`'s save
  re-gate).
- **Doors:** `create_transcribable_audio_file`, `delete_transcribable_audio_file`,
  `automatic_transcription` (+ its background completion save),
  `check_server_transcriber_status`, `build_subtitles_file`.
- **Shape before:** the lifted gate was the `record` kind — section level + scope; the
  media component in the ddo was never asked. `check_server_transcriber_status` gated
  only when `media_ddo.section_tipo` was present; `build_subtitles_file` only when both
  tipos were present, and never gated the related AV whose media folder it writes the VTT
  into; `automatic_transcription` never required the write target's `component_tipo`; the
  background save re-checked nothing. Refusals surfaced as `request.invalid_options`
  (missing fields) or `perm.denied` (out of scope included).
- **Shape after:** every record door gates FIRST, unconditionally — before validation, any
  config lookup, any ASR call, any file: write level 2 on what it AUTHORS (the transcript),
  read level 1 on the audiovisual SOURCE on EVERY path — the browser-ASR WAV
  (`create_/delete_transcribable_audio_file`), the local engine's identical WAV and the
  remote engine's `audio` quality (`automatic_transcription`), the AV duration and VTT
  folder (`build_subtitles_file`) are all derivatives of it, never a change to it (round
  6: create/delete and the subtitles AV leg asked write 2 while the local engine built the
  same WAV behind read 1 — one effect, two levels; a transcriber profile at AV 1 /
  transcript 2 was refused on the browser flow and served on the server flow); section
  floor 1 — except the shared WAV's lifecycle, `create_` / `delete_transcribable_audio_file`,
  which asks the SECTION at WRITE 2 (HEAD's level, review r8): the WAV is ONE file per
  record, so its delete is an effect on every other user of the recording, which a read-only
  viewer may not have, and its create asks the same so that whoever builds a copy of the
  interview may also remove it; the (section, component) pair; the scope. A ddo without `component_tipo` or `section_tipo`, or a
  missing `section_id`, is `request.invalid` (was `request.invalid_options` / served);
  out of scope is `perm.out_of_scope` (was `perm.denied`); `build_subtitles_file` also
  asks read on the related AV (a profile at 0 on the AV writes no VTT into its folder); the background save resolves the principal afresh — and
  only for a LIVE account (`security/live_principal.ts resolveLivePrincipal`: dd131 = No or
  a deleted dd128 record is `perm.denied` even while the profile still grants the pair) —
  and re-runs the door immediately before writing (a revoked grant or a deactivated account
  writes nothing; the job records the refusal).
- **The status poll reaches only the caller's own job (review r7):**
  `automatic_transcription`'s `pid` is no longer the transcriber's job id but an OPAQUE
  poll handle (`tools/tool_transcription/server/poll_handle.ts`): the job id, the engine it
  was submitted to, the submitting user and the media GRANT, sealed with an HMAC-SHA256
  under a key drawn once per process. `check_server_transcriber_status` accepts ONLY that
  handle as `pid`: the job id and the engine it polls are the handle's (the payload's
  `transcriber_engine` is no longer read or required — `Missing required parameters: pid`
  now lists only `media_ddo` / `pid`), and the media context is built from its own read
  grant. A handle that does not verify, or whose user or record differs from this poll's
  (a raw or guessed job id, another user's handle, a handle from before a restart) answers
  `{status: 1}` — the protocol's "no process matching this pid" — with nothing looked up
  or polled. A matched poll answers `{status, msg?}` ONLY: `transcription_data` (the
  finished transcript) never rides the client poll; the background save writes it.
  **Shape before:** the caller's raw `pid` (and engine) went to the transcriber verbatim
  and the provider's answer came back verbatim — a user with read on ANY one AV record
  could walk the on-premise sidecar's sequential job ids and read other people's finished
  transcripts. **Client:** unchanged — it stores and echoes `pid` and reads only `status`
  (status 1 drops a stale handle; a restart retires every handle with the in-process job
  that could have saved its result).
- **Reason:** a recording's component grant is what decides who may hand its audio to a
  recogniser or have derivatives built beside it; ONE level per relation (read on the
  source, write on the transcript) so the answer never depends on which engine is chosen.
- **Owner review:** the browser flow's WAV create / delete ask the section at 2, as HEAD
  did, plus the AV read (a profile at 0 on the AV builds nothing); the local engine's WAV,
  built and self-deleted inside `automatic_transcription`, asks section floor 1 + the
  transcript write + the AV read. RESIDUAL, level-independent and present at HEAD: the WAV is one
  shared file per record, so two users who BOTH may delete it race on it — a delete breaks
  the other's browser-ASR fetch, or a local-engine submit between building the file and
  reading its bytes (the submit reads them into the request; the running job never re-reads
  the file), and the local job's end-of-job cleanup unlinks the same file. A per-job
  derivative (its own path) would remove the race; it changes the media path grammar
  (`src/core/media`), outside this step.
- **Gate reconciliation:** no parity fixture covers these doors; no re-harvest. Gates:
  `test/unit/tool_transcription_gate_native.test.ts` (incl. the TOOLS-06 source legs — the
  transcript writable, ONLY the AV denied / ONLY the media record out of scope — and the
  background save measured on STORED state, the revocation made INSIDE the poll — the
  granted, live CONTROL starts it and the injected status provider reassigns its profile /
  deactivates its account on its first call, before answering `status 3`, so only a check at
  SAVE time can refuse it — served twin; the READ_ONLY viewer (section 1, AV 1) is refused
  the WAV's create AND delete on the SECTION half; the TRANSCRIBER leg — AV 1 / transcript 2 served past the gate by every AV-deriving
  door, the AV-0 twin refused ON the AV by every one; the READ_COMPONENT leg — AV 1 and the
  transcript READ 1: `build_subtitles_file` / `automatic_transcription` refused ON the
  transcript at required 2, no VTT written; the poll-handle legs — a raw job id, another
  user's handle, the caller's handle on another record, an altered handle each answer
  `{status: 1}` with zero config / provider / media calls, and the served twin polls the
  BOUND job id and returns the status without the transcript),
  `test/unit/tool_transcription.test.ts`, `test/unit/transcription_client_poll_av_url_native.test.ts`,
  `test/unit/authz_door_matrix_native.test.ts` (the NO_SOURCE, TRANSCRIBER,
  READ_COMPONENT and READ_ONLY columns).
