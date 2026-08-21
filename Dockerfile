# Dédalo v7 — container image.
#
# Operator guide: docs/install/docker.md
#
# The runtime is PINNED (.bun-version / package.json engines.bun). Keep this tag
# and that pin in lockstep — the engine is coupled to version-specific runtime
# behaviour, and a silent drift is a data-corruption class, not a performance
# regression.
#
# THREE STAGES, one lineage — see "Build targets" at the foot of this file:
#   runtime     the image, production dependencies only
#   dev         runtime + the devDependencies (client test harness, less, linters)
#   production  the DEFAULT target; a bare alias of `runtime`
FROM oven/bun:1.3.9-debian AS runtime

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

# --- Build targets -----------------------------------------------------------
# DEV: the same image with the devDependencies put BACK. `--production` above
# drops mocha and chai, and both are registered client libs
# (src/core/client_libs/registry.ts, `devOnly`) — without them the browser test
# harness at /dedalo/test/client/ loads nothing and every script 404s as a JSON
# error envelope ("MIME type ('application/json') is not executable"). `less`
# comes back too, so `bun run dev` (with the LESS watcher) works here.
#
# It is a LAYER ON TOP of the finished runtime stage, not a fork of it: there is
# exactly one copy of the OS packages, the source copy and the runtime settings,
# so a dev image can never drift from what production runs.
#
# Reinstalling needs to write into the root-owned node_modules, hence the
# root/bun sandwich; the chown keeps the tree owned by the user that runs it,
# and the cache root installed into is dropped in the SAME layer (a separate RUN
# would delete nothing — the bytes would already be committed).
#
#   docker compose -f docker-compose.simple.yml \
#                  -f deploy/docker-compose.qnap-dev.yml build
#
# DEV_MODE IS SEPARATE. This target only puts the bytes on disk; the SERVING
# guard (src/core/client_libs/serving.ts, `lib.devOnly === true && !isDevMode()`)
# still refuses a dev-only lib unless DEDALO_DEV_MODE=true, which the dev compose
# overlay sets. Both are required.
FROM runtime AS dev
USER root
RUN bun install --frozen-lockfile \
 && chown -R bun:bun /opt/dedalo/master_dedalo/node_modules \
 && rm -rf /root/.bun
USER bun

# PRODUCTION: the default target, because Docker builds the LAST stage when none
# is named — and that must never be `dev`. Keep this stage last, and keep it
# empty; `docker compose build` on the production/simple stacks names no target
# and lands here, inheriting every runtime setting (ENTRYPOINT, CMD, USER, ENV,
# EXPOSE) through the FROM.
#
# On BuildKit (the default since Docker 23) an untargeted build resolves the
# graph and never executes `dev`. A LEGACY builder — possible on an old Container
# Station — runs every stage in file order instead: the image is still correct,
# it just pays for the dev install on the way past.
FROM runtime AS production
