# Transcription (`tool_transcription`)

> See also: [Tools user guide](index.md) · [Developer reference](../development/tools/reference/tool_transcription.md)

Turns media into editable text: automatic speech-to-text on audio and video, text extraction from PDFs, and subtitle (VTT) generation — right beside the media, inside the record.

## What it's for

Oral-history and audiovisual archives fill up with hours of recorded interviews and stacks of scanned documents that stay invisible to search and publication until someone produces a text transcript. Re-keying an hour of audio by hand is slow and demoralizing. This tool produces that text directly in the record: it runs a speech recognizer over the audio, or pulls the text out of a PDF, and writes the result into the record's transcription field, complete with `[TC_..._TC]` timecode marks that keep the text lined up with the recording.

Concrete scenario: an oral-history project holds a 90-minute interview in an audiovisual component, with an empty transcription text field beside it. You open the transcription tool on the interview, pick a recognition quality, and start the automatic transcription. Minutes later the text field holds a timecoded first draft you can correct, and from it you generate a subtitle track for the published video.

## When to use it

- You have an audio or video recording and need a text transcription of it.
- You have a PDF and need its text pulled out for search and publication.
- You have a corrected transcription and want to generate a `.vtt` subtitle file synced to the recording.
- **Not** for hand-editing subtitles line by line — use [Subtitles](using_subtitles.md).
- **Not** for shifting all the timecodes by a fixed amount — use [Time codes](using_tc.md).
- **Not** for producing a printable transcript — use [Print transcription](using_tr_print.md).

## Where to find it

The **Transcription** button attaches to media components — audiovisual, image and PDF elements. Depending on the section it shows both in the inspector panel and inline on the component itself. It is most useful on an audiovisual component that has an adjacent transcription text field configured. The tool opens in its own window, with the editable text on one side and the media player on the other.

## Using it, step by step

1. Open the record and press **Transcription** on the media component. The tool opens in a new window: the transcription text area on the left, the media player on the right.
2. To transcribe speech automatically, use the **Automatic transcription** block: choose a recognition **engine** and a **quality**, then start it. With the browser engine, the model runs in your own browser (it uses your GPU when available and falls back to a slower compatible mode otherwise) — leave the window open until it finishes. With a server engine, the job runs on the server and the tool reports progress until it is done.
3. When it completes, the recognized text lands in the text area as paragraphs with `[TC_..._TC]` timecode marks. Correct the wording as needed.
4. Use **Insert tag** to add a timecode mark at the current playhead while you work.
5. To create subtitles, set the **characters per line** value and press **Build subtitles**. The tool writes a `.vtt` file synced to the recording's duration and returns its address.
6. For a PDF, open the tool on the PDF component to extract its text (see the note below).

!!! info "PDF text extraction route"
    On this engine, PDF text extraction is handled by the dedicated PDF extractor tool rather than inside the transcription tool. If the transcription tool does not extract a PDF's text, reach for the PDF extractor instead. See the [developer reference](../development/tools/reference/tool_transcription.md) for the exact split.

## Options

| Option | What it does |
| --- | --- |
| Engine | Which recognizer runs the transcription. The shipped default runs in your browser; an administrator can configure a server-side engine for large jobs. |
| Quality | The recognition model size/accuracy (for example small / large / large turbo). Higher quality is slower. |
| Device | Whether the browser engine uses your GPU or a compatible fallback (shown when relevant). |
| Characters per line | The maximum line length used when building the `.vtt` subtitle file. |

## Tips and gotchas

!!! tip "Correct before you build subtitles"
    Generate the transcription, correct the text, and only then press **Build subtitles** — the subtitle file is cut from the current text and its timecodes.

!!! tip "Browser transcription needs the window open"
    When the browser engine is used, the recognizer runs inside your browser tab. Keep the tool window open until it finishes; closing it stops the job. A GPU-capable browser is much faster.

!!! warning "Automatic text is a draft, and it overwrites"
    Automatic transcription writes its result into the text field. Review it — recognizers make mistakes with names, places and overlapping speech. Because the write goes through the normal save path, earlier states remain in the [time machine](using_time_machine.md) if you need to revert.

## Related

- **[Subtitles](using_subtitles.md)** — hand-edit subtitles from the transcription in a rich editor.
- **[Time codes](using_tc.md)** — shift every timecode mark by a fixed offset.
- **[Print transcription](using_tr_print.md)** — produce a printable, formatted transcript.
- **[Indexation](using_indexation.md)** — link fragments of the transcript to thesaurus terms.
- **[Developer reference](../development/tools/reference/tool_transcription.md)** — actions, options and internals.
