---
title: The in-browser AI runtime is updated to transformers.js 4.3.0, running on the exact ONNX Runtime build it was made for.
type: changed
audience: admin
date: 2026-10-05
breaking: false
---
Browser-side transcription, translation and background removal run on transformers.js,
which is now 4.3.0 (WebGPU on Safari 26 and later, plus fixes to Whisper's progress
reporting). Its ONNX Runtime is now exactly the build that release was made and tested
with (`onnxruntime-web` 1.31.0-dev.20260914). Before, the installed ONNX Runtime was a
different version from the one the bundle was built against. That combination worked,
but nobody had tested it. The two versions are now checked against each other on every
build and always update together. Nothing to do on update. Models you already
downloaded keep working.
