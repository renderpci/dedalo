#!/usr/bin/env bash
#
# IMAGE UPDATE — the code update of a Docker installation: replace the IMAGE,
# with a database backup before, a health check after, and an automatic rollback
# (the container sibling of the tree-swap pipeline in src/core/update/code_update.ts).
#
# WHY AN IMAGE SWAP, NOT A TREE SWAP. In the shipped stacks the code tree lives
# INSIDE the image; only /private, the media tree, the client and the socket are
# volumes. A tree swap inside the container would land in its writable layer and
# be DISCARDED at the next recreation — so an image install updates by replacing
# the image, and rolls back by re-pinning the previous one. That is atomic and
# complete: the old image is bit-identical to what ran before, dependencies
# included. The engine refuses the in-container swap and points here.
#
# Usage (from anywhere; it works in the stack directory — this checkout):
#   ./deploy/dedalo-image-update.sh --version <X.Y.Z | X.Y.Z-dev>
#       [--env-file .dedalo.env] [--outcome-file FILE] [--request-id UUID]
#       [--no-backup] [--health-timeout SECONDS (default 900)]
#       [--skip-version-check] [--ref <git ref> (build mode, -dev only)]
#
# EVERYTHING ELSE COMES FROM .dedalo.env (parsed through deploy/dedalo-image-lib.sh):
# the stack (DEDALO_COMPOSE_FILE), the repository (DEDALO_IMAGE), the pinned
# version (DEDALO_VERSION), pull or build (DEDALO_IMAGE_MODE) and whether a pull
# must carry Dédalo's signature (DEDALO_IMAGE_VERIFY). The retired flags --mode,
# --image and --tag (and DEDALO_IMAGE_UPDATE_MODE) let one run pull from a
# repository the installation never chose; now the source is the operator's
# recorded answer and nothing else.
#
# THE STEPS, in order — each refuses before the next one changes anything:
#    1. one run at a time (a mkdir lock in the stack directory);
#    2. .dedalo.env is complete, or the exact lines to add are printed (the
#       adoption path of an installation that predates the image pin);
#    3. the version is grammatical and moves FORWARD (equal only for -dev);
#    4. the RUNNING engine walks the version (scripts/ops/image_update_channel.ts
#       check-target: exit 0 ok, 3 refused + reason, anything else unavailable —
#       refused unless --skip-version-check, which the first update from an image
#       that predates that program needs);
#    5. a verified database dump through the stack's `backup` service, unless
#       --no-backup (a waiver the operator types, never the default);
#    6. the running image is tagged <DEDALO_IMAGE>:rollback-<UTC stamp>;
#    7. the new image: `docker pull` (+ `cosign verify` of its digest when
#       DEDALO_IMAGE_VERIFY=cosign), or the release checked out and built here
#       through deploy/compose.build.yml;
#    8. DEDALO_VERSION is re-pinned (the ONE key this script writes);
#    9. `up -d dedalo backup` — postgres and nginx are never touched;
#   10. the compose healthcheck: `healthy` is green; `starting` AND `unhealthy` keep
#       waiting until --health-timeout (boot migrations run BEFORE the socket binds,
#       so /health is red through them and Docker flips the state to `unhealthy`
#       ~2 min in — a state it recovers from on the first green probe); red is the
#       deadline, or the engine process restarting (a crash is not a slow boot);
#   11. green keeps only the newest rollback tag; red re-tags the rollback image
#       as the old version, re-pins it (re-checks out the old ref in build mode),
#       brings it back and waits again;
#   12. --outcome-file receives ONE JSON object; exit 0 only on green.
#
# THE OUTCOME (one object, every value from a closed set or a checked grammar —
# no quote or backslash can reach it; read by scripts/ops/image_update_channel.ts):
#   {"schema":1,"request_id":uuid|null,"from":"X.Y.Z","to":"X.Y.Z","mode":"pull"|"build"|null,
#    "image":"<repository>","status":"green"|"rolled_back"|"rollback_failed"|"refused"|"failed",
#    "detail":"healthy"|"health_timeout"|"unhealthy"|"pull_failed"|"verify_failed"|
#             "build_failed"|"backup_failed"|"version_refused"|"downgrade_refused"|
#             "not_running"|"env_incomplete"|"locked",
#    "backup":"/backups/db/…"|null,"digest":"sha256:…"|null,"started_at":ISO,"finished_at":ISO}
# `refused` changed nothing; `failed` tried and left the running stack as it was.
# A usage error (exit 2) writes no outcome.
#
# THREAT NOTE. The host decides the repository, the mode and every flag; a caller
# chooses only a version, and that version still has to walk forward, survive the
# engine's check, the backup and the health check. The engine never gets docker.
#
# The whole program is functions and `main "$@"; exit` on ONE line: bash reads a
# script as it runs, and build mode checks out another version of THIS file.

set -euo pipefail

# --- output -------------------------------------------------------------------

say() { printf '== image-update: %s\n' "$*" >&2; }

usage() {
	printf 'Usage: %s --version <X.Y.Z|X.Y.Z-dev> [--env-file F] [--outcome-file F] [--request-id UUID]\n' "$0" >&2
	printf '         [--no-backup] [--health-timeout SECONDS] [--skip-version-check] [--ref <git ref>]\n' >&2
	exit 2
}

# --- arguments ----------------------------------------------------------------

TARGET='' ENV_FILE='.dedalo.env' OUTCOME_FILE='' REQUEST_ID='' NO_BACKUP='false'
HEALTH_TIMEOUT='900' SKIP_VERSION_CHECK='false' GIT_REF=''
UUID_RE='^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
GIT_REF_RE='^[A-Za-z0-9._/][A-Za-z0-9._/-]{0,199}$'

parse_args() {
	while [ "$#" -gt 0 ]; do
		case "$1" in
			--version | --env-file | --outcome-file | --request-id | --health-timeout | --ref)
				[ "$#" -ge 2 ] || usage
				parse_value "$1" "$2"
				shift 2
				;;
			--no-backup) NO_BACKUP='true'; shift ;;
			--skip-version-check) SKIP_VERSION_CHECK='true'; shift ;;
			*) say "unknown argument: $1"; usage ;;
		esac
	done
	check_args
}

parse_value() {
	case "$1" in
		--version) TARGET="$2" ;;
		--env-file) ENV_FILE="$2" ;;
		--outcome-file) OUTCOME_FILE="$2" ;;
		--request-id) REQUEST_ID="$2" ;;
		--health-timeout) HEALTH_TIMEOUT="$2" ;;
		--ref) GIT_REF="$2" ;;
	esac
}

check_args() {
	[ -n "$TARGET" ] || usage
	if [ -n "$REQUEST_ID" ] && ! [[ "$REQUEST_ID" =~ $UUID_RE ]]; then say 'the request id is not a UUID'; usage; fi
	if ! [[ "$HEALTH_TIMEOUT" =~ ^[1-9][0-9]{0,5}$ ]]; then say 'the health timeout is a number of seconds'; usage; fi
	if [ -n "$GIT_REF" ] && ! [[ "$GIT_REF" =~ $GIT_REF_RE ]]; then say 'that is not a git ref'; usage; fi
	ENV_FILE="$(absolute_path "$ENV_FILE")"
	if [ -n "$OUTCOME_FILE" ]; then OUTCOME_FILE="$(absolute_path "$OUTCOME_FILE")"; fi
}

# Relative paths are the CALLER's, resolved before the script moves to the stack.
absolute_path() {
	case "$1" in
		/*) printf '%s' "$1" ;;
		*) printf '%s/%s' "$(pwd)" "$1" ;;
	esac
}

# --- the outcome ----------------------------------------------------------------

STARTED_AT='' FROM='' MODE='' IMAGE='' VERIFY='' BACKUP_PATH='' DIGEST='' STAMP=''
ROLLBACK_REF='' PREV_HEAD='' PREV_BRANCH=''
ISO_RE='^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$'
BACKUP_PATH_RE='^/[A-Za-z0-9._/+:-]+$'

now_iso() { date -u +%Y-%m-%dT%H:%M:%SZ; }

# json_value VALUE CHECK FALLBACK — "VALUE" when the CHECK function accepts it,
# else FALLBACK (null, or ""): nothing outside a checked grammar is ever written.
json_value() {
	if [ -n "$1" ] && "$2" "$1"; then printf '"%s"' "$1"; else printf '%s' "$3"; fi
}

uuid_grammar() { [[ "$1" =~ $UUID_RE ]]; }
mode_grammar() { [ "$1" = 'pull' ] || [ "$1" = 'build' ]; }
iso_grammar() { [[ "$1" =~ $ISO_RE ]]; }
backup_path_grammar() { [[ "$1" =~ $BACKUP_PATH_RE ]]; }

outcome_json() {
	local status="$1" detail="$2"
	printf '{"schema":1,"request_id":%s,"from":%s,"to":%s,"mode":%s,"image":%s,' \
		"$(json_value "$REQUEST_ID" uuid_grammar null)" \
		"$(json_value "$FROM" dedalo_version_grammar '""')" \
		"$(json_value "$TARGET" dedalo_version_grammar '""')" \
		"$(json_value "$MODE" mode_grammar null)" \
		"$(json_value "$IMAGE" dedalo_repository_grammar '""')"
	printf '"status":"%s","detail":"%s","backup":%s,"digest":%s,"started_at":%s,"finished_at":%s}\n' \
		"$status" "$detail" \
		"$(json_value "$BACKUP_PATH" backup_path_grammar null)" \
		"$(json_value "$DIGEST" dedalo_digest_grammar null)" \
		"$(json_value "$STARTED_AT" iso_grammar null)" \
		"$(json_value "$(now_iso)" iso_grammar null)"
}

write_outcome() {
	local tmp=''
	[ -n "$OUTCOME_FILE" ] || return 0
	tmp="$(mktemp "$(dirname "$OUTCOME_FILE")/.image-update-outcome.XXXXXX")" &&
		outcome_json "$1" "$2" >"$tmp" && mv -f "$tmp" "$OUTCOME_FILE" ||
		say "could not write the outcome to $OUTCOME_FILE"
}

# finish STATUS DETAIL [message] — write the outcome, print the verdict, exit.
finish() {
	local status="$1" detail="$2" verdict=''
	if [ -n "${3-}" ]; then say "$3"; fi
	write_outcome "$status" "$detail"
	verdict="$(printf '%s' "$status" | tr '[:lower:]_' '[:upper:] ')"
	say "$verdict ($detail): ${FROM:-?} -> $TARGET${IMAGE:+ ($IMAGE)}"
	if [ "$status" = 'green' ]; then exit 0; fi
	exit 1
}

# --- compose --------------------------------------------------------------------

dc() { dedalo_compose "$ENV_FILE" plain "$@"; }

running_container() { dc ps -q "$1" 2>/dev/null | head -n 1 || true; }

# --- 2. the env file ------------------------------------------------------------

read_env() {
	MODE="$(dedalo_env_get "$ENV_FILE" DEDALO_IMAGE_MODE)"
	IMAGE="$(dedalo_env_get "$ENV_FILE" DEDALO_IMAGE)"
	FROM="$(dedalo_env_get "$ENV_FILE" DEDALO_VERSION)"
	VERIFY="$(dedalo_env_get "$ENV_FILE" DEDALO_IMAGE_VERIFY)"
}

check_env() {
	local problems='' key='' why=''
	[ -f "$ENV_FILE" ] || finish refused env_incomplete "no $ENV_FILE here — run this from the stack directory, or name it with --env-file"
	problems="$(dedalo_env_problems "$ENV_FILE")"
	if [ -z "$problems" ] && ! [ -f "$(dedalo_env_get "$ENV_FILE" DEDALO_COMPOSE_FILE)" ]; then
		problems='DEDALO_COMPOSE_FILE names a file that is not in this directory'
	fi
	[ -n "$problems" ] || return 0
	say "$ENV_FILE does not say where this installation's image comes from:"
	while read -r key why; do
		say "  $key is $why"
	done <<<"$problems"
	# The lines to paste: bare KEY=value, no indentation, no inline comment — exactly
	# the shape both readers of the file (compose and this script) agree on.
	say 'Add (or correct) these lines in it:'
	while read -r key why; do
		printf '%s=%s\n' "$key" "$(suggested_value "$key")" >&2
	done <<<"$problems"
	say 'A local build (the values above) is right for an installation that built its image here; to pull, see docs/install/docker.md.'
	finish refused env_incomplete
}

suggested_value() {
	case "$1" in
		DEDALO_COMPOSE_FILE) echo 'docker-compose.simple.yml' ;;
		DEDALO_IMAGE) echo 'localhost/dedalo' ;;
		DEDALO_VERSION) dedalo_checkout_version . || echo '<the version this installation runs>' ;;
		DEDALO_IMAGE_MODE) echo 'build' ;;
		DEDALO_IMAGE_VERIFY) echo 'none' ;;
	esac
}

# --- 3. the version -------------------------------------------------------------

check_version() {
	local order=''
	dedalo_version_grammar "$TARGET" || finish refused version_refused "'$TARGET' is not a version (X.Y.Z, or X.Y.Z-dev)"
	if [ -n "$GIT_REF" ] && { [ "$MODE" != 'build' ] || [ "${TARGET%-dev}" = "$TARGET" ]; }; then
		finish refused version_refused '--ref names a developer build: build mode and a -dev version only'
	fi
	order="$(dedalo_version_cmp "$TARGET" "$FROM")"
	if [ "$order" = '-1' ]; then finish refused downgrade_refused "$TARGET is older than the pinned $FROM"; fi
	if [ "$order" = '0' ] && [ "${TARGET%-dev}" = "$TARGET" ]; then
		finish refused downgrade_refused "$TARGET is the pinned version — only a -dev image is re-installed at the same version"
	fi
}

# --- 4. the engine's own walk ---------------------------------------------------

check_with_engine() {
	local said='' code=0
	[ -n "$(running_container dedalo)" ] || finish refused not_running 'the dedalo service is not running — start it (up -d dedalo) and run this again'
	said="$(dc exec -T dedalo bun scripts/ops/image_update_channel.ts check-target "$TARGET" 2>/dev/null)" || code=$?
	case "$code" in
		0) return 0 ;;
		3) finish refused version_refused "the engine refuses $TARGET: $(printf '%s' "$said" | tr -cd 'a-z_' | head -c 64)" ;;
	esac
	if [ "$SKIP_VERSION_CHECK" = 'true' ]; then
		say 'the engine could not check the version walk — skipped (--skip-version-check)'
		return 0
	fi
	finish refused version_refused 'the running engine could not check this version (an image older than its update channel?). If it predates it, re-run with --skip-version-check'
}

# --- 5. the backup --------------------------------------------------------------

take_backup() {
	local said=''
	if [ "$NO_BACKUP" = 'true' ]; then
		say 'NO pre-update backup (--no-backup): a failed update can only roll the CODE back'
		return 0
	fi
	[ -n "$(dc ps -q --status running backup 2>/dev/null || true)" ] ||
		finish refused backup_failed 'the backup service is not running — start it (up -d backup), or waive the backup with --no-backup'
	say 'taking a verified database backup first…'
	said="$(dc exec -T backup /opt/dedalo/master_dedalo/deploy/dedalo-db-backup.sh \
		--label pre-image-update --dir /backups/db \
		--db-key DB_NAME --host-key DB_HOST --port-key DB_PORT \
		--user-key DB_USER --password-key DB_PASSWORD \
		--pg-dump pg_dump --pg-restore pg_restore)" || finish failed backup_failed 'the database backup failed — nothing was changed'
	BACKUP_PATH="$(printf '%s\n' "$said" | sed -n 's/^dedalo-db-backup: verified \([^ ]*\).*$/\1/p' | tail -n 1)"
	backup_path_grammar "$BACKUP_PATH" || finish failed backup_failed 'the backup reported no verified dump — nothing was changed'
	say "backup: $BACKUP_PATH"
}

# --- 6. the rollback anchor -----------------------------------------------------

anchor_rollback() {
	local container='' image_id=''
	container="$(running_container dedalo)"
	image_id="$(docker inspect --format '{{.Image}}' "$container" 2>/dev/null || true)"
	dedalo_digest_grammar "$image_id" || finish refused not_running 'could not read the image the engine runs — nothing was changed'
	STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
	ROLLBACK_REF="$IMAGE:rollback-$STAMP"
	docker tag "$image_id" "$ROLLBACK_REF" || finish failed not_running "could not tag the running image as $ROLLBACK_REF"
	say "the running image is kept as $ROLLBACK_REF"
}

# --- 7. the new image -----------------------------------------------------------

pull_image() {
	docker pull "$IMAGE:$TARGET" || finish failed pull_failed "could not pull $IMAGE:$TARGET"
	DIGEST="$(dedalo_repo_digest "$IMAGE" "$TARGET" || true)"
	[ "$VERIFY" = 'cosign' ] || return 0
	command -v cosign >/dev/null 2>&1 || finish failed verify_failed 'DEDALO_IMAGE_VERIFY=cosign but cosign is not installed on this host'
	[ -n "$DIGEST" ] && dedalo_verify_release "$IMAGE" "$DIGEST" "$TARGET" ||
		finish failed verify_failed "$IMAGE:$TARGET does not carry Dédalo's signature for version $TARGET"
	say "signature verified: $IMAGE@$DIGEST is version $TARGET"
}

build_ref() {
	local remotes=''
	if [ "${TARGET%-dev}" = "$TARGET" ]; then
		echo "v$TARGET"
	elif [ -n "$GIT_REF" ]; then
		echo "$GIT_REF"
	else
		remotes="$(git remote)"
		[ -n "$remotes" ] && [ "$(printf '%s\n' "$remotes" | wc -l | tr -d ' ')" = '1' ] || return 1
		echo "$remotes/master"
	fi
}

restore_checkout() {
	if [ -n "$PREV_BRANCH" ]; then
		git checkout -q "$PREV_BRANCH"
	else
		git checkout -q --detach "$PREV_HEAD"
	fi
}

build_image() {
	local ref='' declared=''
	[ -z "$(git status --porcelain --untracked-files=no)" ] ||
		finish refused build_failed 'this checkout has local changes to tracked files — commit or discard them first'
	PREV_HEAD="$(git rev-parse HEAD)"
	PREV_BRANCH="$(git symbolic-ref -q --short HEAD || true)"
	git fetch --all --tags --quiet || finish failed build_failed 'git fetch failed'
	ref="$(build_ref)" || finish refused version_refused 'a developer build needs ONE git remote, or --ref'
	git checkout -q --detach "$ref" || finish refused build_failed "could not check out $ref"
	declared="$(dedalo_checkout_version . || true)"
	if [ "$declared" != "${TARGET%-dev}" ]; then
		restore_checkout
		finish refused version_refused "$ref declares ${declared:-no version}, not ${TARGET%-dev}"
	fi
	if ! (export DEDALO_VERSION="$TARGET" && dedalo_compose "$ENV_FILE" build build dedalo); then
		restore_checkout
		finish failed build_failed "the build of $ref failed — the running stack is unchanged"
	fi
}

# --- 10. health -----------------------------------------------------------------

HEALTH_DETAIL=''

# health_wait — green on the first `healthy`. `unhealthy` is NOT final: Docker
# reports it after start_period + retries x interval (~2 min in both stacks) while
# boot migrations still run, and flips back on the first green probe, so only the
# deadline or a RESTART of the engine process (RestartCount > 0: it exited — a
# crash, never a slow boot) is red. At the deadline the detail is the last state
# seen: `unhealthy` (it answered red) or `health_timeout` (it never answered).
health_wait() {
	local attempts=$(((HEALTH_TIMEOUT + 4) / 5)) i=0 seen='' state=''
	while [ "$i" -lt "$attempts" ]; do
		seen="$(health_state)"
		state="${seen#* }"
		[ "$state" = 'healthy' ] && return 0
		if [[ "$seen" =~ ^[1-9][0-9]*\  ]]; then
			say "the engine process restarted (${seen%% *} time(s)) before it came up healthy"
			HEALTH_DETAIL='unhealthy'
			return 1
		fi
		sleep 5
		i=$((i + 1))
	done
	HEALTH_DETAIL='health_timeout'
	if [ "$state" = 'unhealthy' ]; then HEALTH_DETAIL='unhealthy'; fi
	return 1
}

# health_state — "<restart count> <health status>" of the engine container, or
# empty while there is none.
health_state() {
	local container=''
	container="$(running_container dedalo)"
	[ -n "$container" ] || return 0
	docker inspect --format '{{.RestartCount}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container" 2>/dev/null || true
}

# --- 11. green, or back ---------------------------------------------------------

prune_rollback_tags() {
	local tag=''
	for tag in $(docker image ls --format '{{.Tag}}' "$IMAGE" 2>/dev/null || true); do
		case "$tag" in
			"rollback-$STAMP") : ;;
			rollback-*) docker rmi "$IMAGE:$tag" >/dev/null 2>&1 || true ;;
		esac
	done
}

roll_back() {
	local failure="$1"
	say "the new version did not come up healthy ($failure) — ROLLING BACK to $FROM"
	docker tag "$ROLLBACK_REF" "$IMAGE:$FROM" || finish rollback_failed "$failure" "could not re-tag $ROLLBACK_REF"
	dedalo_env_set "$ENV_FILE" DEDALO_VERSION "$FROM" || finish rollback_failed "$failure" "could not re-pin DEDALO_VERSION=$FROM"
	if [ "$MODE" = 'build' ]; then restore_checkout || say 'could not restore the previous checkout'; fi
	if dc up -d --no-build dedalo backup && health_wait; then
		finish rolled_back "$failure" "back on $FROM, healthy — the update FAILED; the database backup is ${BACKUP_PATH:-not taken}"
	fi
	finish rollback_failed "$failure" "the rollback to $FROM is NOT healthy either — manual intervention required (backup: ${BACKUP_PATH:-not taken})"
}

# --- main -----------------------------------------------------------------------

main() {
	parse_args "$@"
	cd "$(dirname "$0")/.."
	# shellcheck source=deploy/dedalo-image-lib.sh
	. deploy/dedalo-image-lib.sh
	dedalo_registries_load deploy/image_registries.sh || say 'deploy/image_registries.sh is missing — no official signing identity loaded'
	dedalo_env_isolate
	STARTED_AT="$(now_iso)"
	read_env
	dedalo_lock_acquire "$(pwd)" dedalo-image-update ||
		finish refused locked "another image update is running (lock: $(pwd)/.dedalo-image-update.lock)"
	trap 'dedalo_lock_release "$(pwd)" dedalo-image-update' EXIT
	check_env
	check_version
	check_with_engine
	take_backup
	anchor_rollback
	if [ "$MODE" = 'pull' ]; then pull_image; else build_image; fi
	dedalo_env_set "$ENV_FILE" DEDALO_VERSION "$TARGET" || finish failed pull_failed "could not re-pin DEDALO_VERSION in $ENV_FILE"
	say "pinned DEDALO_VERSION=$TARGET; recreating dedalo and backup…"
	if dc up -d dedalo backup && health_wait; then
		prune_rollback_tags
		finish green healthy "healthy at $IMAGE:$TARGET (previous image kept as $ROLLBACK_REF)"
	fi
	roll_back "${HEALTH_DETAIL:-unhealthy}"
}

main "$@"; exit
