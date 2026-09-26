# Dédalo v7 — THE CI IMAGE (ghcr.io/renderpci/dedalo-ci; local tag dedalo-ci:local).
#
# ONE TOOLCHAIN, EVERYWHERE THE GATES RUN. Until this image, a hosted job was
# `ubuntu-latest` plus whatever `apt-get` handed it at run time, and a local run was
# native macOS — two different machines judging the same commit. Measured on the
# unit tier: 25 red files on the runner against 3 on a developer box, the difference
# being ffmpeg / ImageMagick / poppler / mariadb the runner simply did not have.
# The workflows (`container:`) and `bun run ci:local -- --docker` both run INSIDE
# this image, so a verdict is a property of the commit, not of the machine.
#
# WHAT IS IN IT, AND WHY (every package is here because a gate or tier needs it):
#   bun (exactly .bun-version) — read from the file in the build context, never
#             re-typed here, and checked against the release's SHASUMS256. The pin
#             is load-bearing (Bun.sql jsonb-inference drift is a data-corruption
#             class); scripts/ci/env_guard.sh re-checks it at run time.
#   postgresql-client-18 (PGDG) — pg_dump/pg_restore/psql refuse a NEWER server
#             than the client, and the service is pgvector:pg18. Resolved through
#             DEDALO_PG_BIN_PATH=/usr/lib/postgresql/18/bin (scripts/ci/hosted_env.sh).
#   ffmpeg (ships ffprobe + qt-faststart), imagemagick (7: `magick`), poppler-utils
#             (pdfinfo/pdftotext/pdftohtml/pdftoppm), ghostscript (the engine-owned
#             PDF rasterizer — explicit, --no-install-recommends drops it),
#             librsvg2-bin (rsvg-convert, the only SVG rasterizer), file — the media
#             toolchain the media gates probe with existsSync and otherwise SKIP.
#             Same distro and packages as the product image (../Dockerfile), so a
#             media gate measures what ships.
#   mariadb-server + mariadb-client — the diffusion tier's MariaDB target.
#   chromium — the browser the client suite (scripts/client_test_runner.ts) drives.
#             NOT google-chrome: Google publishes no linux/arm64 build, and this
#             image is multi-arch so an Apple-Silicon Mac runs it natively. One
#             distro package on BOTH arches means one browser version everywhere,
#             instead of Chrome on the runner and something else on the Mac. The
#             runner prefers PUPPETEER_EXECUTABLE_PATH over `channel: 'chrome'`,
#             so the ENV below is the whole wiring; PUPPETEER_SKIP_DOWNLOAD stops
#             `bun install` fetching a second one.
#   git, rsync, unzip, zip, xz, curl, procps — the tier scripts, the code-update
#             drills (git clone + zip release) and the backup gates.
#
# BASE: debian:trixie-slim, DIGEST-pinned — the distro of the product image
# (oven/bun:<v>-debian is trixie), so CI and production share a package set.
# Dependabot's docker ecosystem (.github/dependabot.yml) proposes new digests: the
# same "exactness with an updater" rule as .bun-version and the SHA-pinned actions.
# Distro packages are not individually version-pinned: the IMAGE DIGEST the
# workflows pin is the exactness; the weekly rebuild (.github/workflows/ci-image.yml)
# is the updater. /etc/dedalo-ci-versions records what a given build resolved.
#
# THE FINGERPRINT — sha256 of (ci/Dockerfile bytes ++ .bun-version bytes). Written to
# /etc/dedalo-ci-image and to the label org.dedalo.ci.fingerprint (same value), so a
# job can prove it runs in the image built from THIS commit's definition, and a local
# runner can tell a stale dedalo-ci:local from a current one without rebuilding.
# The build REFUSES unless the value passed in equals the one computed from the
# context, so the label can never describe a different Dockerfile than the layers:
#
#   FP="$(cat ci/Dockerfile .bun-version | shasum -a 256 | cut -d' ' -f1)"
#   docker buildx build -f ci/Dockerfile --build-arg DEDALO_CI_FINGERPRINT="$FP" \
#     -t dedalo-ci:local --load .
#
# BUILD CONTEXT = the repo root, but ci/Dockerfile.dockerignore admits exactly two
# files (this one and .bun-version): the image carries a TOOLCHAIN, never the tree —
# the checkout is mounted at run time. (So the ImageMagick policy is not baked in:
# the engine points its own spawns at the shipped policy via MAGICK_CONFIGURE_PATH.)
#
# LAYER ORDER = rate of change, slowest first: OS packages, PGDG, media, browser,
# then bun (moves with .bun-version), then the fingerprint (moves with every edit of
# this file — last, so an edited comment rebuilds one tiny layer, not the toolchain).
#
# Operator notes: ci/README.md.

# debian:trixie-slim — multi-arch INDEX digest (amd64 + arm64 resolve through it).
FROM debian:trixie-slim@sha256:a99cfc517144bc59b1978475ec53b46ecabec7e43635402ee5b77cc54cd1b20a

ENV DEBIAN_FRONTEND=noninteractive \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8

# --- base + PostgreSQL 18 client (PGDG) ---------------------------------------
# Debian's own postgresql-client is older than the pg18 service; an older client
# refuses a newer server.
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
      ca-certificates curl gnupg bash coreutils procps tzdata \
      git rsync unzip zip xz-utils gzip file jq openssl; \
    install -d /usr/share/postgresql-common/pgdg; \
    curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
      https://www.postgresql.org/media/keys/ACCC4CF8.asc; \
    echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(. /etc/os-release && echo "$VERSION_CODENAME")-pgdg main" \
      > /etc/apt/sources.list.d/pgdg.list; \
    apt-get update; \
    apt-get install -y --no-install-recommends postgresql-client-18; \
    rm -rf /var/lib/apt/lists/*

# --- media toolchain ------------------------------------------------------------
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
      ffmpeg imagemagick poppler-utils ghostscript librsvg2-bin; \
    rm -rf /var/lib/apt/lists/*

# --- MariaDB (diffusion target) -------------------------------------------------
# The package's postinst may try to start the server and fail without an init system;
# that is harmless here — a tier that needs it starts mariadbd itself.
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends mariadb-server mariadb-client; \
    rm -rf /var/lib/apt/lists/*

# --- browser (client suite) -----------------------------------------------------
# Fonts explicitly: --no-install-recommends drops them, and a font-less Chromium
# lays text out with nothing — a layout-sensitive suite would measure a different page.
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends chromium fonts-liberation fonts-dejavu-core; \
    rm -rf /var/lib/apt/lists/*
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PUPPETEER_SKIP_DOWNLOAD=1

# The checkout is bind-mounted (ci:local) or created by actions/checkout under a uid
# that is not this container's root; git's safe.directory check would then refuse
# every `git` call the tiers and the update drills make.
RUN git config --system --add safe.directory '*'

# --- bun, exactly .bun-version --------------------------------------------------
# TARGETARCH is set by BuildKit per platform of a multi-arch build.
ARG TARGETARCH
COPY .bun-version /tmp/.bun-version
RUN set -eux; \
    version="$(tr -d '[:space:]' < /tmp/.bun-version)"; \
    case "$TARGETARCH" in \
      amd64) asset="bun-linux-x64" ;; \
      arm64) asset="bun-linux-aarch64" ;; \
      *) echo "ci/Dockerfile: no bun build for TARGETARCH='$TARGETARCH'" >&2; exit 1 ;; \
    esac; \
    base="https://github.com/oven-sh/bun/releases/download/bun-v${version}"; \
    cd /tmp; \
    curl -fsSLO "$base/$asset.zip"; \
    curl -fsSLO "$base/SHASUMS256.txt"; \
    grep " $asset.zip\$" SHASUMS256.txt | sha256sum -c -; \
    unzip -q "$asset.zip"; \
    install -m 0755 "$asset/bun" /usr/local/bin/bun; \
    ln -s /usr/local/bin/bun /usr/local/bin/bunx; \
    rm -rf "$asset" "$asset.zip" SHASUMS256.txt /tmp/.bun-version; \
    test "$(bun --version)" = "$version"

# --- fingerprint + version record (LAST — see header) ---------------------------
ARG DEDALO_CI_FINGERPRINT
COPY ci/Dockerfile .bun-version /usr/local/share/dedalo-ci/
RUN set -eu; \
    computed="$(cat /usr/local/share/dedalo-ci/Dockerfile /usr/local/share/dedalo-ci/.bun-version | sha256sum | cut -d' ' -f1)"; \
    if [ "${DEDALO_CI_FINGERPRINT:-}" != "$computed" ]; then \
      echo "ci/Dockerfile: --build-arg DEDALO_CI_FINGERPRINT='${DEDALO_CI_FINGERPRINT:-}' but the context computes '$computed'." >&2; \
      echo "  Pass: --build-arg DEDALO_CI_FINGERPRINT=\"\$(cat ci/Dockerfile .bun-version | shasum -a 256 | cut -d' ' -f1)\"" >&2; \
      exit 1; \
    fi; \
    printf '%s\n' "$computed" > /etc/dedalo-ci-image; \
    { \
      echo "bun $(bun --version)"; \
      echo "$(pg_dump --version)"; \
      echo "$(chromium --version)"; \
      echo "$(ffmpeg -version | head -n1)"; \
      echo "$(magick -version | head -n1)"; \
      echo "$(pdftoppm -v 2>&1 | head -n1)"; \
      echo "gs $(gs --version)"; \
      echo "$(mariadb --version)"; \
      echo "$(git --version)"; \
    } > /etc/dedalo-ci-versions; \
    cat /etc/dedalo-ci-versions
LABEL org.dedalo.ci.fingerprint="${DEDALO_CI_FINGERPRINT}" \
      org.opencontainers.image.source="https://github.com/renderpci/dedalo" \
      org.opencontainers.image.description="Dédalo v7 CI toolchain: bun (.bun-version), pg18 client, media tools, MariaDB, Chromium"
ENV DEDALO_CI_IMAGE=1

CMD ["bash"]
