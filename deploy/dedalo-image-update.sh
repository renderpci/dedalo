#!/usr/bin/env bash
#
# IMAGE UPDATE — safe code updates for the Docker stacks, with health check and
# automatic rollback (the container sibling of the tree-swap pipeline in
# src/core/update/code_update.ts).
#
# WHY AN IMAGE SWAP, NOT A TREE SWAP: in the shipped stacks
# (docker-compose.yml / docker-compose.simple.yml + Dockerfile) the code tree
# lives INSIDE the image (WORKDIR /opt/dedalo/master_dedalo, COPY . .); only
# /private, the media tree and the socket are volumes. An in-container tree
# swap would land in the container's writable layer and be DISCARDED on the
# next `up -d`/recreation — so image installs update by replacing the IMAGE,
# and roll back by re-pinning the previous tag. That is atomic and complete:
# the old image is bit-identical to what ran before, dependencies included.
#
# TWO SOURCE BRANCHES, selected by --mode (or DEDALO_IMAGE_UPDATE_MODE):
#   pull   a registry is configured: `docker pull <image>:<new tag>`. This mode
#          requires the compose file to pin the service image through
#          `image: ${DEDALO_IMAGE}` (a local override of the shipped stacks,
#          which say `build: .` and are served by `build` mode below).
#   build  no registry (the default stacks `build: .`): checkout the release
#          ref in the local clone and `docker compose build` it, tagging the
#          running image `<rollback tag>` FIRST so the previous bytes survive
#          the rebuild and remain re-pinnable.
#
# Health = the compose healthcheck on the `dedalo` service (curl /health over
# the unix socket inside the container) — the same probe both stacks declare.
# On red: re-pin/re-checkout the previous version, `up -d`, re-check, and say
# plainly whether the rollback went green.
#
# Usage:
#   dedalo-image-update.sh --mode pull --image registry.example.org/dedalo \
#       --tag 7.0.1 [--compose-file docker-compose.yml] [--service dedalo]
#   dedalo-image-update.sh --mode build --ref v7.0.1 \
#       [--repo-dir /opt/dedalo/master_dedalo] [--compose-file docker-compose.simple.yml]

set -euo pipefail

MODE="${DEDALO_IMAGE_UPDATE_MODE:-}"
IMAGE="" TAG="" REF="" REPO_DIR="" COMPOSE_FILE="docker-compose.yml" SERVICE="dedalo"
while [ $# -gt 0 ]; do
	case "$1" in
		--mode) MODE="$2"; shift 2 ;;
		--image) IMAGE="$2"; shift 2 ;;
		--tag) TAG="$2"; shift 2 ;;
		--ref) REF="$2"; shift 2 ;;
		--repo-dir) REPO_DIR="$2"; shift 2 ;;
		--compose-file) COMPOSE_FILE="$2"; shift 2 ;;
		--service) SERVICE="$2"; shift 2 ;;
		*) echo "ERROR: unknown arg $1" >&2; exit 2 ;;
	esac
done
case "$MODE" in
	pull)
		[ -n "$IMAGE" ] && [ -n "$TAG" ] || { echo "Usage (pull): --mode pull --image <repo/name> --tag <new tag>" >&2; exit 2; }
		;;
	build)
		[ -n "$REF" ] || { echo "Usage (build): --mode build --ref <git ref>" >&2; exit 2; }
		REPO_DIR="${REPO_DIR:-$(pwd)}"
		;;
	*) echo "ERROR: --mode must be 'pull' or 'build'" >&2; exit 2 ;;
esac

# THE ENV FILE THE SIMPLE STACK'S TLS DECISION LIVES IN (P1-6 / OPS-02).
# `up -d dedalo` recreates ONLY the engine: nginx keeps running with whatever
# configuration it already has. Without this flag compose resolves the built-in
# defaults, so a TLS install's engine comes back with SESSION_COOKIE_SECURE
# unset-to-false while nginx is still serving HTTPS — the session cookie loses
# its Secure flag on a live TLS site, and nothing says so. Absent for the full
# stack (docker-compose.yml), which carries no such file and needs none.
ENV_FILE="${ENV_FILE:-.dedalo.env}"
ENV_FILE_ARGS=()
[ -f "$ENV_FILE" ] && ENV_FILE_ARGS=(--env-file "$ENV_FILE")
COMPOSE=(docker compose -f "$COMPOSE_FILE" "${ENV_FILE_ARGS[@]}")

health_wait() { # up to 60s for the compose healthcheck to report healthy
	for _ in $(seq 1 60); do
		state="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' \
			"$("${COMPOSE[@]}" ps -q "$SERVICE")" 2>/dev/null || echo unknown)"
		if [ "$state" = "healthy" ]; then return 0; fi
		sleep 2
	done
	return 1
}

if [ "$MODE" = "pull" ]; then
	# ---- registry branch ----------------------------------------------------
	# Resolve what runs NOW so the rollback identity is a fact, not a guess.
	CURRENT="$(docker inspect --format '{{.Config.Image}}' \
		"$("${COMPOSE[@]}" ps -q "$SERVICE")" 2>/dev/null || true)"
	[ -n "$CURRENT" ] || { echo "ERROR: service '$SERVICE' is not running — nothing to update from." >&2; exit 1; }
	echo "== image-update: $CURRENT -> $IMAGE:$TAG"

	docker pull "$IMAGE:$TAG"
	DEDALO_IMAGE="$IMAGE:$TAG" "${COMPOSE[@]}" up -d "$SERVICE"
	if health_wait; then
		echo "== image-update: GREEN at $IMAGE:$TAG"
		exit 0
	fi

	echo "== image-update: healthcheck never went green — ROLLING BACK to $CURRENT" >&2
	DEDALO_IMAGE="$CURRENT" "${COMPOSE[@]}" up -d "$SERVICE"
	if health_wait; then
		echo "== image-update: rollback healthy at $CURRENT (update FAILED)" >&2
	else
		echo "== image-update: ROLLBACK ALSO UNHEALTHY — manual intervention required" >&2
	fi
	exit 1
fi

# ---- build branch (no registry: the stacks say `build: .`) ------------------
cd "$REPO_DIR"
PREV_REF="$(git rev-parse HEAD)"
# `docker compose build` reuses the image NAME, so the previous bytes must be
# saved under a rollback tag BEFORE the rebuild replaces them. Capture the
# compose-derived image name NOW too — after a rollback retag, `up -d` must
# recreate the container from it without rebuilding.
CONTAINER_ID="$("${COMPOSE[@]}" ps -q "$SERVICE" 2>/dev/null || true)"
RUNNING_IMAGE="" ; IMAGE_NAME=""
if [ -n "$CONTAINER_ID" ]; then
	RUNNING_IMAGE="$(docker inspect --format '{{.Image}}' "$CONTAINER_ID")"
	IMAGE_NAME="$(docker inspect --format '{{.Config.Image}}' "$CONTAINER_ID")"
fi
ROLLBACK_TAG="dedalo:rollback_$(date +%Y%m%d%H%M%S)"
if [ -n "$RUNNING_IMAGE" ]; then
	docker tag "$RUNNING_IMAGE" "$ROLLBACK_TAG"
	echo "== image-update: previous image preserved as $ROLLBACK_TAG"
fi
echo "== image-update: build $PREV_REF -> $REF"

git fetch --all --tags --prune
git checkout --detach "$REF"
"${COMPOSE[@]}" build "$SERVICE"
"${COMPOSE[@]}" up -d "$SERVICE"
if health_wait; then
	echo "== image-update: GREEN at $REF"
	exit 0
fi

echo "== image-update: healthcheck never went green — ROLLING BACK to $PREV_REF" >&2
git checkout --detach "$PREV_REF"
if [ -n "$RUNNING_IMAGE" ]; then
	# Re-pin the preserved image under the compose-derived name: atomic, no
	# rebuild, dependencies included. --no-build so compose recreates from the
	# retagged image instead of rebuilding the broken ref's bytes back.
	docker tag "$ROLLBACK_TAG" "$IMAGE_NAME"
	"${COMPOSE[@]}" up -d --no-build "$SERVICE"
else
	# Nothing was running before; rebuild the previous ref instead.
	"${COMPOSE[@]}" build "$SERVICE"
	"${COMPOSE[@]}" up -d "$SERVICE"
fi
if health_wait; then
	echo "== image-update: rollback healthy at $PREV_REF (update FAILED)" >&2
else
	echo "== image-update: ROLLBACK ALSO UNHEALTHY — manual intervention required" >&2
fi
exit 1
