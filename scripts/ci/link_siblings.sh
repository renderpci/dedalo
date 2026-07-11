#!/usr/bin/env bash
#
# LINK SIBLINGS — plant the sibling paths a self-hosted CI checkout needs.
#
# The repo assumes three out-of-tree paths (all resolved relative to repo root):
#   ../private                 — config/.env (src/config/env.ts privateDir)
#   ../../v7/master_dedalo     — the READ-ONLY PHP oracle tree
#                                (test/unit/client_serving.test.ts byte-compares
#                                against it; scripts/sync_client.sh reads it)
#   client/dedalo/lib          — 118 MB vendored client libs (gitignored; the
#                                PHP tree's lib/ is the byte-identical source,
#                                see scripts/sync_client.sh:103)
#
# A GitHub Actions checkout lands in .../_work/<repo>/<repo>, so the siblings
# resolve inside runner-owned space — this script plants idempotent symlinks
# there to the real trees on this machine. Deliberately NOT sync_client.sh:
# rsyncing core/ over checked-out files could mask a divergence the
# client_serving byte-identity tripwire exists to catch.
#
# Overrides (for a future runner on another box):
#   DEDALO_CI_PRIVATE_DIR — real private dir (default: the dev tree's)
#   DEDALO_CI_PHP_ROOT    — real PHP oracle tree
#
# Usage: bash scripts/ci/link_siblings.sh   (idempotent; safe to re-run)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

PRIVATE_SRC="${DEDALO_CI_PRIVATE_DIR:-$HOME/Desktop/trabajos/dedalo/v7_ts/private}"
PHP_SRC="${DEDALO_CI_PHP_ROOT:-$HOME/Desktop/trabajos/dedalo/v7/master_dedalo}"

[ -r "$PRIVATE_SRC/.env" ] || { echo "ERROR: no readable .env at $PRIVATE_SRC" >&2; exit 1; }
[ -d "$PHP_SRC/core/page" ] || { echo "ERROR: PHP tree not found at $PHP_SRC" >&2; exit 1; }

link() { # link <target> <linkpath> — replace only if not already correct
	local target="$1" linkpath="$2"
	if [ "$(readlink "$linkpath" 2>/dev/null || true)" = "$target" ]; then
		echo "ok      $linkpath -> $target"
		return
	fi
	if [ -e "$linkpath" ] && [ ! -L "$linkpath" ]; then
		echo "ERROR: $linkpath exists and is not a symlink — refusing to replace a real path" >&2
		exit 1
	fi
	mkdir -p "$(dirname "$linkpath")"
	ln -sfn "$target" "$linkpath"
	echo "linked  $linkpath -> $target"
}

# ../private (skip when the checkout already sits next to a real private dir,
# e.g. when run from the dev tree itself)
if [ -d "$REPO_ROOT/../private" ] && [ ! -L "$REPO_ROOT/../private" ]; then
	echo "ok      $REPO_ROOT/../private is a real directory (dev tree) — leaving it"
else
	link "$PRIVATE_SRC" "$REPO_ROOT/../private"
fi

# ../../v7/master_dedalo (same guard: the dev layout already has the real tree)
if [ -d "$REPO_ROOT/../../v7/master_dedalo/core/page" ] && [ ! -L "$REPO_ROOT/../../v7/master_dedalo" ]; then
	echo "ok      $REPO_ROOT/../../v7/master_dedalo is the real PHP tree — leaving it"
else
	link "$PHP_SRC" "$REPO_ROOT/../../v7/master_dedalo"
fi

# client/dedalo/lib (gitignored; in the dev tree it is a real rsync'd dir)
if [ -d "$REPO_ROOT/client/dedalo/lib" ] && [ ! -L "$REPO_ROOT/client/dedalo/lib" ]; then
	echo "ok      client/dedalo/lib is a real directory (dev tree) — leaving it"
else
	link "$PHP_SRC/lib" "$REPO_ROOT/client/dedalo/lib"
fi

echo "== link_siblings: done"
