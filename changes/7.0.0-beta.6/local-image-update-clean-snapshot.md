---
title: A Docker installation that builds its image here now updates from a clean snapshot of the release, like the install
type: fixed
audience: admin
date: 2026-10-14
---
On an installation whose image is built on the host (`DEDALO_IMAGE_MODE=build`), `deploy/dedalo-image-update.sh` used to build the new image straight from the checkout. Every untracked file in it went into the image, and the engine then reported its version as `X.Y.Z.dev` even though the image was tagged `X.Y.Z`. An update now builds the way the installer does, with the same builder (`deploy/dedalo-image-build.sh`). It takes a snapshot of the release commit with `git archive`, builds the image from that snapshot, then deletes the snapshot. The image holds only committed files and reports the release version and its commit date. Changes to tracked files are still refused before the update starts. A tree without git is now refused with a sentence that says why, instead of failing halfway through. If you build an image by hand, use `./deploy/dedalo-image-build.sh "$PWD" localhost/dedalo:<version>`. See [a local build](./install/docker.md#a-local-build).
