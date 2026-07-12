# Dédalo v7 — container image.
#
# Operator guide: docs/install/docker.md
#
# The runtime is PINNED (.bun-version / package.json engines.bun). Keep this tag
# and that pin in lockstep — the engine is coupled to version-specific runtime
# behaviour, and a silent drift is a data-corruption class, not a performance
# regression.
FROM oven/bun:1.3.9-debian

# --- OS packages -------------------------------------------------------------
# The image MUST ship a `psql` that is NOT OLDER than the PostgreSQL server it
# talks to (18 in docker-compose.yml): the installer, the seed restore, the
# hierarchy import and the backup widget all shell out to it, and an older client
# refuses to connect to a newer server. Debian's own postgresql-client is too
# old, so the PostgreSQL project's repository (PGDG) is added.
#
# The media toolchain is not optional either: without it, uploads produce no
# derivatives and no thumbnails.
#   ffmpeg  → transcoding, posterframes, probing (also ships qt-faststart)
#   imagemagick (v6: convert/identify — the engine falls back automatically)
#   poppler-utils → pdftotext / pdftohtml / pdfinfo
#   ocrmypdf → optional automatic OCR
#   git, unzip, gzip, file → used by the code-update subsystem and MIME sniffing
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl gnupg \
 && install -d /usr/share/postgresql-common/pgdg \
 && curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
      https://www.postgresql.org/media/keys/ACCC4CF8.asc \
 && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(. /etc/os-release && echo "$VERSION_CODENAME")-pgdg main" \
      > /etc/apt/sources.list.d/pgdg.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends \
      postgresql-client-18 \
      ffmpeg imagemagick poppler-utils ocrmypdf \
      git unzip gzip file \
 && rm -rf /var/lib/apt/lists/*

# --- Application -------------------------------------------------------------
WORKDIR /opt/dedalo/master_dedalo

# Dependencies first, so a source change does not re-resolve the whole tree.
# --frozen-lockfile refuses to silently resolve a different tree than the one
# that was tested. --production drops the dev dependencies (test harness,
# linters); the browser libraries the client loads are runtime dependencies, so
# they stay.
COPY package.json bun.lock* bun.lockb* ./
RUN bun install --frozen-lockfile --production

COPY . .

# --- Writable trees ----------------------------------------------------------
# THE CONTAINER PROBLEM: `../private/` is a SIBLING of the repo, and in an image
# there is no writable parent to create it in. DEDALO_PRIVATE_DIR relocates the
# whole private tree — .env, the session store, the state file, the backups — and
# BOTH the configuration read side and the installer write side honour it.
# Mount a named volume here or the secrets die with the container.
ENV DEDALO_PRIVATE_DIR=/private

# Created here, owned by `bun`, so an EMPTY named volume mounted over them
# inherits that ownership (Docker copies the image path's ownership into a fresh
# named volume — it does NOT do this for bind mounts).
RUN mkdir -p /private /srv/dedalo/media /run/dedalo \
 && chown -R bun:bun /private /srv/dedalo/media /run/dedalo

USER bun

EXPOSE 3600

# umask 0000 so the unix socket is created world-writable inside the private
# socket volume. Connecting to a unix socket requires WRITE permission on it, and
# the proxy container runs as a different user — with the default umask every
# request is a 502. The volume is shared with the proxy only; nothing else can
# see it.
ENTRYPOINT ["/bin/sh", "-c", "umask 0000; exec \"$@\"", "--"]
CMD ["bun", "run", "src/server.ts"]
