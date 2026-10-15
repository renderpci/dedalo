---
title: Each release is published as a signed multi-architecture image, with the same digest on every Dédalo registry.
type: added
audience: developer
date: 2026-10-09
---
A release tag `vX.Y.Z` now also produces the engine image `X.Y.Z`, for `linux/amd64` and `linux/arm64`. It is built once from the same `git archive` as the code server's release zip, signed keylessly with Sigstore by the release workflow, and copied with its signature to every registry that `engineering/image_registries.json` lists as provisioned. Each copy is checked to carry the same digest. A published release tag is never rebuilt or overwritten. Developer images (`X.Y.Z-dev`) are built only on demand, from master. There is no `latest` tag. To check that an image is genuine, verify it against the release workflow's identity, as shown in [checking the signature](./install/docker.md#checking-the-signature). A registry that is not provisioned, or whose credentials are missing, is skipped by name, never silently.
