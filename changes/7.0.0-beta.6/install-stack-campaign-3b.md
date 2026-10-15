---
title: Docker and trial installs: the local image build reports the release version, nginx always publishes its ports, and a resume re-checks the site.
type: fixed
audience: admin
date: 2026-10-14
---
- **A local image build at install time** now goes through `deploy/dedalo-image-build.sh`, the builder the image updater already used: a clean snapshot of the checkout's last commit, so uncommitted and untracked files never reach the image, `/health` reports the release version (never `X.Y.Z.dev`), and the image carries its own version and commit labels instead of the Bun base image's. The Review shows that command.
- **nginx is recreated on every start of the stack** and must publish every port it declares. After a start that failed because another program held port 80 or 443, a `--resume` used to reuse a container that came up with no port and report the install complete; it now recreates it, or names the port it cannot publish.
- **A `--resume` probes `/health` again** (on the engine's socket and through the published address), even when an earlier run recorded the probe done, so a stack started again is never reported complete without a check.
- **An institution certificate whose chain this machine does not trust** is listed on the Review under *TO DO*, before you type `yes`, instead of being refused only after every answer was given.
- **Removing an install:** a served `--abort` names the images it keeps and points to the route's own removal section — the new [Removing the stack](./install/docker.md#removing-the-stack) on the Docker route — and both removal sections now say how to reclaim the images, the build cache and the installer's Bun caches. The build-time estimate is one figure everywhere (about 2 to 6 minutes on 2 CPUs).
