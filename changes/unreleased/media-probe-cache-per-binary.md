---
title: The audio encoder for video and audio derivatives is chosen from what the configured ffmpeg can actually encode, and a failed encode names its error.
type: fixed
audience: admin
date: 2026-10-02
breaking: false
---
The AAC encoder used for video and audio derivatives (`libfdk_aac`, then `aac`) is now
read from the configured ffmpeg's own encoder list (`ffmpeg -encoders`) instead of its
build flags, which could name an encoder the binary does not have. The answer is
remembered per ffmpeg binary, so a different ffmpeg resolved by the same server is asked
again rather than handed the first one's answer — and the same holds for ImageMagick's
"can this format be written" check. A probe that cannot run is no longer remembered for
the life of the server. A failing second encoding pass or audio extraction now reports
ffmpeg's error line instead of the tail of its banner and progress output; the encoded
files are byte-identical. See [the media engine](./core/system/media_engine.md).
