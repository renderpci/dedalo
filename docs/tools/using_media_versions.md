# Media versions (`tool_media_versions`)

> See also: [Tools user guide](index.md) · [Developer reference](../development/tools/reference/tool_media_versions.md)

Media versions is the panel where you manage the actual files behind a media component — inspect each quality, rebuild or delete one, rotate an image, fix an audiovisual file's headers, and re-sync the record with what is really on disk.

## What it's for

A media component in Dédalo — an image, an audio or video clip, a PDF, a 3D model or an SVG — never stores just one file. It keeps a preserved master plus a set of generated **qualities**: a web-sized `default`, a small `404` preview, a `thumb`, an `audio` track, and so on. Each is a real file on disk, and the record keeps an index of which qualities exist. Most of the time this set is built for you when a file is uploaded, and you never think about it. Media versions is where you look when something in that set goes wrong.

Concrete scenario: a museum archivist uploads a high-resolution TIFF master of an object. The web previews are generated automatically, but one comes out sideways, and later a colleague deletes a couple of derived files directly on the server. The record now warns that its file information is out of sync. The archivist opens **Media versions**, sees the mismatch between what the record expects and what is on disk, rotates the affected quality, and regenerates the missing files so the record and the disk agree again.

## When to use it

- A derived quality is missing, broken, rotated, or won't play/seek in the browser.
- The record shows that its file information is out of sync with the disk.
- You need to rebuild the web qualities from the preserved master, or delete a specific quality or file.
- An audiovisual file plays but won't scrub — you need to conform (rewrite) its headers.

Do **not** use it to bring a new master file into a component — that is the upload flow ([Upload](using_upload.md)) or a batch ingest ([File import](using_import_files.md)). Media versions works on the files of a media component that already exists.

## Where to find it

Media versions surfaces as a button on the media components themselves — `component_image`, `component_av`, `component_pdf`, `component_3d` and `component_svg` — in the record's edit view (in the component's inline controls and/or the inspector). It opens in a modal over the record. Some actions appear only on the model they apply to: the **rotate** action shows on images, and **conform headers** shows on audiovisual components.

## Using it, step by step

1. Open the record and find the media component whose files you want to manage. Click its **Media versions** button.
2. The modal opens with three areas: a read-only preview of the media at the top, a sync/regenerate area in the middle, and a grid of the individual qualities below.
3. Read the sync area. It compares the qualities the record expects with the qualities actually on disk. If they differ, it tells you the file information is out of sync.
4. In the versions grid, each row is one quality, showing its file name, size and whether it exists. Use the per-quality buttons to open, rebuild, rotate, delete, or (for audiovisual) conform the headers of that quality.
5. To rebuild the whole set from the master, use the regenerate control in the sync area. Optionally tick **Delete normalized files** first so stale derivatives are cleared before rebuilding. Press **Regenerate**.
6. Long operations (rebuilds, transcodes) can take minutes. The tool waits and confirms before running the destructive ones.

## Options

| Control | What it does |
| --- | --- |
| Show data | Reveals the comparison between the qualities recorded in the database and those found on disk, so you can see exactly what is missing or extra. |
| Rebuild (per quality) | Regenerates one quality from the preserved master. |
| Rotate (images only) | Rotates the files of the selected image quality. |
| Conform headers (audiovisual only) | Rewrites an audiovisual file's headers so it seeks/plays correctly in the browser. |
| Delete quality / Delete version | Removes a whole quality, or one specific file of a quality. |
| Delete normalized files | When ticked before regenerating, clears the existing derived files first. |
| Regenerate | Rebuilds the quality set and writes correct file information back to the record. |

## Tips and gotchas

!!! tip
    When a record warns that its media is out of sync, open **Show data** first to see what actually differs before regenerating — a single missing thumbnail needs far less than a full rebuild.

!!! warning
    Deleting a quality or a version removes a real file from disk, and rebuilds and audiovisual transcodes can take several minutes and write across the quality set. These actions ask you to confirm first. The preserved master (the `original` quality) is never overwritten by rotate or rebuild, so you can always regenerate the derivatives from it.

## Related

- **[Posterframe](using_posterframe.md)** — capture a still frame from an audio/video file as its thumbnail or an identifying image.
- **[Image rotation](using_image_rotation.md)** — the full interactive rotate-and-crop editor for images; Media versions offers rotation inline per quality.
- **[Upload](using_upload.md)** · **[File import](using_import_files.md)** — get the master file into the component; Media versions then manages its derived qualities.
- **[Developer reference](../development/tools/reference/tool_media_versions.md)** — the API actions, permission gates and internals. See also the [media pipeline](../development/media_pipeline.md) overview.
