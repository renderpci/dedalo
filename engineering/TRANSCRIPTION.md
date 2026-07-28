# TRANSCRIPTION — local speech recognition

What the engine guarantees about turning recorded speech into text, and the two
contracts a consumer needs: the **local AI model store** and the **on-premise ASR
sidecar**. Companion of the tool's own docs (`docs/tools/using_transcription.md`
for archivists, `docs/development/tools/reference/tool_transcription.md` for the
tool surface); this file is the permanent definition of the parts that live
outside the tool.

## The law

**Recorded interviews are personal data. Recognition happens on hardware the
institution controls, and the recording is never published to run it.**

Two engines satisfy that, and nothing else may be added without satisfying it:

| Engine | Where inference runs | How the audio travels |
|---|---|---|
| `local` (default) | the archivist's own browser | it does not travel — the audio is decoded in the tab |
| `local_whisper` | a machine on the institution's network | POSTed as bytes to that machine |

The pre-existing `babel_transcriber` engine submits a public URL to an external
service. It stays supported for installations that already use it, and it is the
only engine that publishes anything — do not make it the default anywhere.

## The model store

In-browser inference needs model weights. They come from the install, never from
a public hub.

- **Location**: `DEDALO_AI_MODEL_STORE`, default `<private>/ai_models`. Outside
  the checkout: a large speech model is ~1.5 GB, it is data rather than code, and
  this repo has scars from large files in its history.
- **URL**: `/dedalo/ai_models/<model-id>/<file>`, read-only, served by
  `src/core/ai/model_store.ts`. Fail-closed like the client-lib route: an
  extension allowlist (`.onnx`, `.onnx_data`, `.json`, `.bin`, `.data`, `.txt`,
  `.model`, `.wasm`), realpath confinement, plain 404 for everything else.
  Immutable cache headers — a model id *is* its version.
- **Seeding**: `bun run scripts/fetch_ai_models.ts --list | <model-id> | --all`
  where there is a network; an rsync of the directory where there is not.
- **Escape hatch**: `DEDALO_AI_MODEL_ALLOW_HUB=true` lets the browser fall back to
  a public hub. Off by default, and wrong for any collection holding personal
  data.
- The runtime itself (`@huggingface/transformers`, `onnxruntime-web`) is a pinned
  dependency served through the client-lib registry, NOT a CDN. The
  `no_remote_code_tripwire` gate keeps it that way.

## The on-premise ASR sidecar (`local_whisper`)

A small HTTP service the institution runs — faster-whisper, WhisperX,
whisper.cpp, or anything else behind this contract. Configured like any other
transcriber: a `transcriber_config` entry in the tool config carrying `uri` and
`key`.

```
GET  <uri>/models        → { "models": [ { "name": "large-v3", "label": "…",
                                          "languages": "99", "notes": "…" } ] }

POST <uri>/jobs          multipart: audio (the 16 kHz mono WAV), language (ISO 639-1),
                                    model, entity_name, user_id
                         → { "id": "job-42" }

GET  <uri>/jobs/<id>     → { "state": "queued" | "running" | "done" | "error",
                             "segments": [ { "start": 0, "end": 4.2,
                                             "text": "…", "speaker": "SPK_1" } ],
                             "error": "…" }
```

`Authorization: Bearer <key>` is sent when a key is configured.

Notes that are not optional:

- **Segments carry `end` and, when the engine diarizes, `speaker`.** Both are
  what the paragraph grouper breaks on; an engine that returns only `start` will
  produce a readable transcript with worse paragraphs.
- Job states map onto the shared completion poll as `queued`/`running` → keep
  waiting, `done` → save, anything else → terminal. The write-back, the
  overwrite guard and the time-machine-audited save are shared with the other
  engines rather than reimplemented.
- The **audio is deleted** by the completion poll when the job ends, whichever
  way it ends.

### The private-address exemption

The outbound SSRF guard refuses loopback and private ranges, because an external
service must never be able to make the engine reach inside the network. A sidecar
on the LAN is the legitimate opposite case, so it is allowed **only** with:

```bash
DEDALO_TRANSCRIBER_ALLOW_PRIVATE_HOSTS=true
```

It applies to `local_whisper` alone; `babel_transcriber` keeps the strict guard
regardless, and the cloud metadata address (169.254.169.254) is refused either
way. `test/unit/transcription_local_asr.test.ts` asserts both directions.

## Transcript shape

Recognisers emit subtitle-sized segments. What is stored is an interview
transcript: segments grouped into paragraphs at pauses, speaker changes and
sentence ends, capped so a monologue still breaks up.

- One implementation, `tools/tool_transcription/transcribers/lib/paragraphs.js`,
  plain ESM, imported by BOTH the browser worker and the server write-back
  (`segmentsToTcText`). A second implementation would drift the first time either
  was tuned.
- Timecode density is the archivist's choice: `paragraph_anchors` (default — one
  mark per paragraph plus inline anchors), `paragraph`, or `segment` (the
  historical cue list). Anchors exist because `buildSubtitlesText` interpolates
  cue times *between* marks: paragraph-only marks read beautifully and drift the
  `.vtt`.
- `parse_transcript` reads stored text back into segments, so an existing
  transcript can be re-paragraphed without re-recognising a word.

## Why the transcripts used to repeat words

Recorded for the next person who touches this. Five causes, all fixed 2026-07-28:

1. a 4-bit (`q4`) decoder was forced for every large model — and `large` was the
   default. Quantising Whisper's decoder that far is the best-known trigger of
   repetition loops. Quantisation is now per-model in the catalog, encoder and
   decoder chosen separately (`q4f16`, not `q4`);
2. no anti-loop decoding at all: greedy, no repetition penalty, no
   no-repeat-ngram, no temperature fallback, and conditioning on the previous
   window so one loop poisoned the next;
3. blind 30-second windows with a 5-second overlap — the overlap was transcribed
   twice;
4. no voice-activity detection, so silence and room tone were fed to the model;
5. nothing checked the output.

Now: VAD plans windows at real pauses (`transcribers/lib/vad.js`), each window is
decoded independently with beam search + anti-loop parameters, a window that still
looks degenerate is retried up a temperature ladder, and
`transcribers/lib/transcript_postprocess.js` collapses whatever survives. The
audio itself is high-passed and loudness-normalised on extraction, because quiet
and rumbling input is what makes a recogniser hallucinate in the first place.

## Gates

| Gate | What it holds |
|---|---|
| `test/unit/no_remote_code_tripwire.test.ts` | no client/tool code loads from a third-party host (tripwire index) |
| `test/unit/ai_model_store.test.ts` | the store serves models and is fail-closed everywhere else |
| `test/unit/transcription_local_asr.test.ts` | the private-address exemption, both directions; audio travels as bytes |
| `test/unit/transcript_postprocess.test.ts` | decoder repetition dies, real speech survives |
| `test/unit/transcript_paragraphs.test.ts` | paragraph grouping, the three timecode modes, and that the `.vtt` still tracks |
| `test/unit/transcript_vad.test.ts` | where the cuts land; no window exceeds the model context; unreadable audio still transcribes |
| `test/unit/tool_transcription.test.ts` | the tool surface, incl. the real-ffmpeg audio build |
