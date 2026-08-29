# Dédalo for curators — a 30-minute talk

A presentation for **curators, archivists, directors and collection teams**, not
for developers: one idea per slide, drawings rather than paragraphs, and a full
speaker script.

| File | What it is |
|---|---|
| `dedalo_for_curators.pptx` | 28 slides, 16:9, with the speaker notes embedded (Presenter View) |
| `speaker_script.md` | The same notes, printable — 4,264 words, ~33 minutes of speaking |
| `build_deck.py` | The generator both files come from |

## Presenting it

Open the `.pptx` in Keynote, PowerPoint or LibreOffice. The notes are attached to
each slide, so Presenter View shows the script while the audience sees the slide.

Roughly 30 minutes with pauses. The three part-dividers are quick; the time
belongs to slides 7 (*the shape of your catalogue is data*), 10 (*links, not
copies*), 18 (*publishing is a decision*) and 24 (*sensitive material*). If you
are short, 25 and 26 can be dropped without breaking the argument.

## The shape of the talk

1–4 the hook and what Dédalo is · 5–14 how a catalogue is built · 15–19 where it
lives and what reaches the public · 20–24 the AI layer, and its limits · 25–28
what it means for the institution, and how to start.

Slide 2 opens a question (an archive that cannot be asked what it knows) and
slide 21 answers it. Do not cut one without the other.

## Changing it

Everything is drawn with native PowerPoint shapes — no images — so every slide
stays editable. For small tweaks, edit the `.pptx` directly. For anything
structural, edit `build_deck.py` and re-run it, so the slides and the script
cannot drift apart:

```bash
python3 -m venv .venv && .venv/bin/pip install python-pptx
.venv/bin/python presentation/curators_30min/build_deck.py
```

To check the layout after a change, render it and look at every page — text that
fits in the geometry can still overflow in a real renderer:

```bash
soffice --headless --convert-to pdf --outdir /tmp \
        presentation/curators_30min/dedalo_for_curators.pptx
```

Fonts are Helvetica Neue with the usual fallbacks; on a machine without it the
deck degrades to Helvetica or Arial without reflowing badly.

---

This directory is self-contained and independent of `presentation/build_deck.py`,
which is a different deck maintained separately.
