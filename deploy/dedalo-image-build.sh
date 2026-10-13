#!/usr/bin/env bash
#
# LOCAL IMAGE BUILD — the one entry point for building the product image on this
# host from a CLEAN SNAPSHOT of a checkout's last commit (C3-46, owner 2026-10-14).
#
#   ./deploy/dedalo-image-build.sh <checkout> <repository:tag> [<docker CLI>]
#
# It runs dedalo_image_build (deploy/dedalo-image-lib.sh — read the rationale
# there): `git archive HEAD` extracted into <checkout>/.dedalo-install/image-context,
# `docker build --tag <repository:tag>` of that directory, the directory removed
# after. Committed files only: an uncommitted edit or an untracked file is never
# in the image, and the image reports the version it is tagged with (no `.dev`).
#
# CALLERS: the terminal installer's stack_image (src/core/install/host/stack/image.ts,
# as root with the docker CLI it found) and an operator building by hand. The image
# updater (deploy/dedalo-image-update.sh) calls the same library function directly:
# it sources the library BEFORE it checks out the release, so the builder that runs
# is the one that decided to build.
#
# Exit: 0 built, 1 failed, 2 usage, 3 refused (not a git checkout — a release tree
# is its own context, built by the installer directly).
# Gates: test/unit/install_sh_image_source.test.ts, test/unit/image_update_script_native.test.ts.

set -euo pipefail

if [ "$#" -lt 2 ] || [ "$#" -gt 3 ]; then
	printf 'Usage: %s <checkout> <repository:tag> [<docker CLI>]\n' "$0" >&2
	exit 2
fi

# shellcheck source=deploy/dedalo-image-lib.sh
. "$(cd "$(dirname "$0")" && pwd)/dedalo-image-lib.sh"

dedalo_image_build "$@"
