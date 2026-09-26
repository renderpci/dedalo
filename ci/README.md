# ci/ — the CI image

One toolchain for every place the gates run: the GitHub tiers (`container:`, pinned by
digest) and the local pre-push gate (`bun run ci:local -- --docker`). The rationale for
each package, the base choice and the layer order live in the header of
[`Dockerfile`](Dockerfile); the pipeline map is `engineering/CI.md`.

| | |
|---|---|
| Local tag | `dedalo-ci:local` |
| Registry | `ghcr.io/renderpci/dedalo-ci` (published by `.github/workflows/ci-image.yml`) |
| Arches | `linux/amd64`, `linux/arm64` (native builds; Apple Silicon runs it without emulation) |
| Base | `debian:trixie-slim` by digest — the product image's distro |
| Contents | bun = `.bun-version`, `postgresql-client-18`, ffmpeg (+ffprobe, qt-faststart), ImageMagick 7, poppler-utils, ghostscript, librsvg2-bin, MariaDB server+client, Chromium, git, rsync, unzip/zip |

## The contract consumers code against

- `ENV DEDALO_CI_IMAGE=1`.
- `/etc/dedalo-ci-image` holds the **fingerprint**: `sha256(ci/Dockerfile ++ .bun-version)`.
  The label `org.dedalo.ci.fingerprint` holds the same value, and the build refuses a
  mismatch between the value passed in and the one computed from the context.
- `/etc/dedalo-ci-versions` records the tool versions one build resolved.
- `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium` — the client suite launches it (it runs
  as root, so the runner's `--no-sandbox` is required, which it already passes).
- Registry tags: `fp-<fingerprint>` (the image for a given definition), `<YYYYMMDD>`,
  `latest`. Pin the **digest**, never a tag.

## Build locally

```sh
FP="$(cat ci/Dockerfile .bun-version | shasum -a 256 | cut -d' ' -f1)"
docker buildx build -f ci/Dockerfile --build-arg DEDALO_CI_FINGERPRINT="$FP" \
  -t dedalo-ci:local --load .
```

The context is the repo root, but `Dockerfile.dockerignore` admits only `ci/Dockerfile`
and `.bun-version`: the image is a toolchain, the checkout is mounted at run time.

A local image is current when `docker image inspect dedalo-ci:local --format
'{{ index .Config.Labels "org.dedalo.ci.fingerprint" }}'` equals `$FP`.

## Updates

- **Base digest**: Dependabot (`docker`, directory `/ci`).
- **Distro packages**: the weekly no-cache rebuild in `ci-image.yml`.
- **bun**: edit `.bun-version`. The fingerprint moves, so the image is rebuilt and
  republished; the workflow pins then move to the new digest.
