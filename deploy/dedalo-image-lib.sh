# shellcheck shell=bash
#
# DÉDALO IMAGE HOST LIBRARY — the functions every Docker-HOST tool shares
# (installer unification D2, 2026-10-09). SOURCED, never executed.
#
# WHY A SHARED LIBRARY. Three host programs make the same decisions about the
# same file: install.sh (where the image comes from, written once), the image
# updater deploy/dedalo-image-update.sh (pull or build, re-pin, roll back) and
# the opt-in host updater. Each one re-deriving "which compose file", "what is a
# version", "which registries are official" would drift the first time one of
# them is fixed — exactly how the old updater came to default to the full stack
# while install.sh installed the simple one. One library, one answer.
#
# THE .dedalo.env CONTRACT (host side only — never the engine's /private/.env):
#   DEDALO_COMPOSE_FILE   the stack: docker-compose.simple.yml | docker-compose.yml
#   DEDALO_IMAGE          the repository, no tag (localhost/dedalo for a local build)
#   DEDALO_VERSION        the pinned tag: X.Y.Z, or X.Y.Z-dev for a developer image
#   DEDALO_IMAGE_MODE     pull | build
#   DEDALO_IMAGE_VERIFY   cosign | none
# Writer: install.sh (the full stack: the docs/install/docker.md recipe). Readers:
# compose (`image: ${DEDALO_IMAGE}:${DEDALO_VERSION}`) and this library. The image
# updater is the ONE re-pinner, and it changes DEDALO_VERSION only.
#
# IT NEVER SOURCES .dedalo.env — it PARSES it (dedalo_env_get). Sourcing would
# execute whatever the file holds, with the privileges of whoever runs the host
# tool (root, for the host updater); a KEY=VALUE reader executes nothing.
#
# THE OFFICIAL REGISTRY LIST arrives through dedalo_registries_load, which RESETS
# every name deploy/image_registries.sh defines before sourcing that generated
# file: a signing identity or a registry inherited from the caller's environment
# can never stand in for the generated one.
#
# Bash 3.2 (macOS): no ${x,,}, no mapfile, no associative arrays; an EMPTY array
# is never expanded bare under `set -u`. Every function is `set -euo pipefail`
# safe and returns a status instead of exiting. Gates:
# test/unit/install_sh_image_source.test.ts, test/unit/image_update_script_native.test.ts.

# --- grammar ------------------------------------------------------------------

DEDALO_ENV_KEY_RE='^[A-Z_][A-Z0-9_]*$'
# A release tag (X.Y.Z) or a developer tag (X.Y.Z-dev) — the code server's names.
DEDALO_VERSION_RE='^[0-9]+\.[0-9]+\.[0-9]+(-dev)?$'
# isRepositoryReference (src/core/update/image_registries.ts), in ERE: an optional
# host[:port]/, then lowercase path components — and NO tag or digest.
DEDALO_REPO_HOST_RE='[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:[0-9]{1,5})?'
DEDALO_REPO_COMPONENT_RE='[a-z0-9]+([._-][a-z0-9]+)*'
DEDALO_REPOSITORY_RE="^(${DEDALO_REPO_HOST_RE}/)?${DEDALO_REPO_COMPONENT_RE}(/${DEDALO_REPO_COMPONENT_RE})*$"
DEDALO_DIGEST_RE='^sha256:[0-9a-f]{64}$'
# parseDeclaredTriple (src/core/update/code_build_plan.ts): whitespace-insensitive.
DEDALO_TRIPLE_RE='Object\.freeze\(\[[[:space:]]*[0-9]+[[:space:]]*,[[:space:]]*[0-9]+[[:space:]]*,[[:space:]]*[0-9]+[[:space:]]*,?[[:space:]]*\]\)'
# The stack file name DEDALO_COMPOSE_FILE may hold: a file in the stack directory.
DEDALO_COMPOSE_FILE_RE='^[A-Za-z0-9][A-Za-z0-9._-]*\.ya?ml$'
# The override that adds the build (deploy/compose.build.yml).
DEDALO_BUILD_OVERRIDE='deploy/compose.build.yml'
# The keys of the contract above, in the order install.sh writes them.
DEDALO_ENV_IMAGE_KEYS='DEDALO_COMPOSE_FILE DEDALO_IMAGE DEDALO_VERSION DEDALO_IMAGE_MODE DEDALO_IMAGE_VERIFY'

dedalo_version_grammar() {
	[[ "${1-}" =~ $DEDALO_VERSION_RE ]]
}

dedalo_repository_grammar() {
	local ref="${1-}"
	[ "${#ref}" -le 255 ] && [[ "$ref" =~ $DEDALO_REPOSITORY_RE ]]
}

dedalo_digest_grammar() {
	[[ "${1-}" =~ $DEDALO_DIGEST_RE ]]
}

# dedalo_version_cmp A B — prints -1, 0 or 1 over the numeric X.Y.Z triples
# (a -dev suffix is ignored here; the callers decide what an equal -dev means).
dedalo_version_cmp() {
	local a1='' a2='' a3='' b1='' b2='' b3=''
	dedalo_version_grammar "${1-}" && dedalo_version_grammar "${2-}" || return 2
	IFS=. read -r a1 a2 a3 <<<"${1%-dev}"
	IFS=. read -r b1 b2 b3 <<<"${2%-dev}"
	dedalo_triple_cmp "$a1" "$a2" "$a3" "$b1" "$b2" "$b3"
}

dedalo_triple_cmp() {
	local left=("$1" "$2" "$3") right=("$4" "$5" "$6") i=0
	while [ "$i" -lt 3 ]; do
		if ((10#${left[i]} > 10#${right[i]})); then echo 1; return 0; fi
		if ((10#${left[i]} < 10#${right[i]})); then echo -1; return 0; fi
		i=$((i + 1))
	done
	echo 0
}

# dedalo_repository_normalize REF — the comparable form (normalizeRepository):
# lowercase, and Docker Hub's implicit host made implicit (docker.io/x ≡ x).
dedalo_repository_normalize() {
	local lowered=''
	lowered="$(printf '%s' "${1-}" | tr '[:upper:]' '[:lower:]')"
	lowered="${lowered#index.docker.io/}"
	printf '%s' "${lowered#docker.io/}"
}

# --- the .dedalo.env file -----------------------------------------------------

# THE LINE RULES ARE COMPOSE'S (its dotenv parser, the subset an operator writes),
# because compose is the other reader of this file and the two must never disagree
# about which image runs: leading whitespace and an `export ` prefix are ignored; a
# value in single or double quotes is what lies between them (anything after the
# closing quote — a comment — is dropped); an UNQUOTED value ends at a `#` that
# follows whitespace (an inline comment), and its trailing whitespace is dropped.
# The LAST line assigning a key wins. Gate: install_sh_image_source (section B).

# dedalo_env_line_value KEY LINE — the value LINE assigns to KEY (status 0), or
# status 1 when LINE does not assign KEY.
dedalo_env_line_value() {
	local key="$1" line="${2%$'\r'}"
	line="${line#"${line%%[![:space:]]*}"}"
	case "$line" in export[[:space:]]*) line="${line#export}"; line="${line#"${line%%[![:space:]]*}"}" ;; esac
	case "$line" in "$key="*) ;; *) return 1 ;; esac
	dedalo_env_value_of "${line#*=}"
}

# dedalo_env_value_of RAW — the text after `KEY=`, read by the rules above.
dedalo_env_value_of() {
	local raw="${1#"${1%%[![:space:]]*}"}" quote=''
	quote="${raw:0:1}"
	case "$quote" in
		\" | \') dedalo_env_quoted "$quote" "${raw:1}" ;;
		*) printf '%s' "$raw" | sed -E 's/[[:space:]]+#.*$//; s/[[:space:]]+$//' ;;
	esac
}

# dedalo_env_quoted QUOTE REST — up to the closing QUOTE; an unterminated quote is
# kept literally (compose refuses such a file; this reader never guesses past it).
dedalo_env_quoted() {
	case "$2" in
		*"$1"*) printf '%s' "${2%%"$1"*}" ;;
		*) printf '%s%s' "$1" "$2" ;;
	esac
}

# dedalo_env_get FILE KEY — the value of the LAST line assigning KEY, read by the
# rules above. Prints nothing for an absent key or file; status 2 only for a
# malformed KEY.
dedalo_env_get() {
	local file="${1-}" key="${2-}" line='' value='' found=''
	[[ "$key" =~ $DEDALO_ENV_KEY_RE ]] || return 2
	[ -f "$file" ] || return 0
	while IFS= read -r line || [ -n "$line" ]; do
		case "$line" in *"$key"*) ;; *) continue ;; esac
		if found="$(dedalo_env_line_value "$key" "$line")"; then value="$found"; fi
	done <"$file"
	printf '%s' "$value"
}

# dedalo_env_set FILE KEY VALUE — rewrite FILE ATOMICALLY (a temp file in the same
# directory, then mv) with every line assigning KEY (by the rules above: indented,
# `export`-prefixed or commented ones too) replaced by `KEY=VALUE` and every other
# line byte-identical; KEY is appended when absent. umask 077: the file holds the
# database password. Refuses a value carrying a line break.
dedalo_env_set() {
	local file="${1-}" key="${2-}" value="${3-}" tmp='' line='' found='false'
	[[ "$key" =~ $DEDALO_ENV_KEY_RE ]] || return 2
	case "$value" in *$'\n'* | *$'\r'*) return 2 ;; esac
	[ -f "$file" ] || return 1
	tmp="$(umask 077 && mktemp "$(dirname "$file")/.dedalo-env.XXXXXX")" || return 1
	{
		while IFS= read -r line || [ -n "$line" ]; do
			if dedalo_env_assigns "$key" "$line"; then
				printf '%s=%s\n' "$key" "$value"
				found='true'
			else
				printf '%s\n' "$line"
			fi
		done <"$file"
		if [ "$found" = 'false' ]; then printf '%s=%s\n' "$key" "$value"; fi
	} >"$tmp" || { rm -f "$tmp"; return 1; }
	mv -f "$tmp" "$file"
}

# dedalo_env_assigns KEY LINE — status 0 when LINE assigns KEY.
dedalo_env_assigns() {
	case "$2" in *"$1"*) dedalo_env_line_value "$1" "$2" >/dev/null ;; *) return 1 ;; esac
}

# dedalo_env_isolate — forget any value of the contract's keys inherited from the
# caller's shell. Compose gives the SHELL precedence over --env-file, so an
# exported DEDALO_VERSION would silently outvote the pinned one.
dedalo_env_isolate() {
	unset DEDALO_COMPOSE_FILE DEDALO_IMAGE DEDALO_VERSION DEDALO_IMAGE_MODE DEDALO_IMAGE_VERIFY
}

# dedalo_env_problems FILE — one line per contract key that is missing or invalid
# (`KEY reason`); prints nothing when the file is complete.
dedalo_env_problems() {
	local file="${1-}" key='' value=''
	for key in $DEDALO_ENV_IMAGE_KEYS; do
		value="$(dedalo_env_get "$file" "$key")"
		if [ -z "$value" ]; then
			printf '%s missing\n' "$key"
		elif ! dedalo_env_value_valid "$key" "$value"; then
			printf '%s invalid\n' "$key"
		fi
	done
}

dedalo_env_value_valid() {
	case "$1" in
		DEDALO_COMPOSE_FILE) [[ "$2" =~ $DEDALO_COMPOSE_FILE_RE ]] ;;
		DEDALO_IMAGE) dedalo_repository_grammar "$2" ;;
		DEDALO_VERSION) dedalo_version_grammar "$2" ;;
		DEDALO_IMAGE_MODE) [ "$2" = 'pull' ] || [ "$2" = 'build' ] ;;
		DEDALO_IMAGE_VERIFY) [ "$2" = 'cosign' ] || [ "$2" = 'none' ] ;;
		*) return 1 ;;
	esac
}

# --- the checkout ---------------------------------------------------------------

# dedalo_checkout_version DIR — the X.Y.Z the checkout at DIR declares in
# src/core/update/version.ts: the FIRST Object.freeze([a, b, c]) triple, read
# whitespace- and line-break-insensitively — the same answer parseDeclaredTriple
# gives (gate: install_sh_image_source). Status 1 when unreadable or absent.
dedalo_checkout_version() {
	local file="${1-}/src/core/update/version.ts" found=''
	[ -r "$file" ] || return 1
	found="$(tr '\011\012\013\014\015' '     ' <"$file" | grep -oE "$DEDALO_TRIPLE_RE" | head -n 1)" || true
	[ -n "$found" ] || return 1
	found="$(printf '%s' "$found" | tr -cs '0-9' ' ')"
	# shellcheck disable=SC2086 # deliberate split: three numbers
	set -- $found
	[ "$#" -eq 3 ] || return 1
	printf '%s.%s.%s' "$1" "$2" "$3"
}

# --- compose --------------------------------------------------------------------

# dedalo_compose_args ENVFILE [plain|build] — the compose argv, one per line:
#   -f <DEDALO_COMPOSE_FILE> [-f deploy/compose.build.yml] --env-file <ENVFILE>
# The env file is MANDATORY and must exist: it carries the TLS decision and the
# image pin, and a compose command without it resolves the built-in defaults.
dedalo_compose_args() {
	local env_file="${1-}" variant="${2-plain}" stack=''
	[ -n "$env_file" ] && [ -f "$env_file" ] || return 1
	case "$env_file" in *$'\n'*) return 1 ;; esac
	stack="$(dedalo_env_get "$env_file" DEDALO_COMPOSE_FILE)"
	[[ "$stack" =~ $DEDALO_COMPOSE_FILE_RE ]] && [ -f "$stack" ] || return 1
	printf '%s\n' -f "$stack"
	case "$variant" in
		plain) : ;;
		build) printf '%s\n' -f "$DEDALO_BUILD_OVERRIDE" ;;
		*) return 2 ;;
	esac
	printf '%s\n' --env-file "$env_file"
}

# dedalo_compose ENVFILE plain|build ARGS… — `docker compose` with those argv.
dedalo_compose() {
	local env_file="${1-}" variant="${2-}" listed='' line=''
	local compose_argv=()
	shift 2 || return 2
	listed="$(dedalo_compose_args "$env_file" "$variant")" || return 1
	while IFS= read -r line; do compose_argv+=("$line"); done <<<"$listed"
	docker compose "${compose_argv[@]}" "$@"
}

# --- the official registries ----------------------------------------------------

# dedalo_registries_load FILE — reset, then source the GENERATED list
# (deploy/image_registries.sh). Status 1 when it is missing or inconsistent.
dedalo_registries_load() {
	local file="${1-}"
	DEDALO_REGISTRY_IDS=()
	DEDALO_REGISTRY_LABELS=()
	DEDALO_REGISTRY_ROLES=()
	DEDALO_REGISTRY_REPOSITORIES=()
	DEDALO_IMAGE_SIGNING_ISSUER=''
	DEDALO_IMAGE_SIGNING_IDENTITY_REGEXP=''
	[ -f "$file" ] || return 1
	# shellcheck source=deploy/image_registries.sh
	. "$file"
	dedalo_registries_consistent
}

dedalo_registries_consistent() {
	local count="${#DEDALO_REGISTRY_IDS[@]}"
	[ "${#DEDALO_REGISTRY_LABELS[@]}" -eq "$count" ] &&
		[ "${#DEDALO_REGISTRY_ROLES[@]}" -eq "$count" ] &&
		[ "${#DEDALO_REGISTRY_REPOSITORIES[@]}" -eq "$count" ]
}

dedalo_registry_count() {
	echo "${#DEDALO_REGISTRY_IDS[@]}"
}

# dedalo_offered_registries — one TAB-separated line per PROVISIONED official
# registry, in the generated order (primary first, then the mirrors):
#   <index> <id> <label> <role> <repository>
dedalo_offered_registries() {
	local i=0 count=''
	count="$(dedalo_registry_count)"
	while [ "$i" -lt "$count" ]; do
		printf '%s\t%s\t%s\t%s\t%s\n' "$i" "${DEDALO_REGISTRY_IDS[i]}" "${DEDALO_REGISTRY_LABELS[i]}" \
			"${DEDALO_REGISTRY_ROLES[i]}" "${DEDALO_REGISTRY_REPOSITORIES[i]}"
		i=$((i + 1))
	done
}

# dedalo_official_index REPOSITORY — the index of the official registry that
# repository IS (normalized), printed; status 1 for a repository of your own.
dedalo_official_index() {
	local wanted='' i=0 count=''
	wanted="$(dedalo_repository_normalize "${1-}")"
	count="$(dedalo_registry_count)"
	while [ "$i" -lt "$count" ]; do
		if [ "$(dedalo_repository_normalize "${DEDALO_REGISTRY_REPOSITORIES[i]}")" = "$wanted" ]; then
			echo "$i"
			return 0
		fi
		i=$((i + 1))
	done
	return 1
}

# dedalo_image_available REPOSITORY:TAG — 0 available, 1 absent, 2 unknown (no
# network, no permission, no tool). `docker manifest inspect` first, then
# `docker buildx imagetools inspect`; only a registry SAYING "not found" is absent.
dedalo_image_available() {
	local ref="${1-}" said='' absent='false'
	if said="$(docker manifest inspect "$ref" 2>&1 >/dev/null)"; then return 0; fi
	if dedalo_says_absent "$said"; then absent='true'; fi
	if said="$(docker buildx imagetools inspect "$ref" 2>&1 >/dev/null)"; then return 0; fi
	if dedalo_says_absent "$said"; then absent='true'; fi
	if [ "$absent" = 'true' ]; then return 1; fi
	return 2
}

dedalo_says_absent() {
	printf '%s' "${1-}" | grep -qiE 'no such manifest|manifest unknown|not found'
}

# dedalo_probe_registries VERSION — one availability code per official registry
# (dedalo_image_available over <repository>:VERSION), one per line, in order.
dedalo_probe_registries() {
	local version="${1-}" i=0 count='' code=0
	count="$(dedalo_registry_count)"
	while [ "$i" -lt "$count" ]; do
		code=0
		dedalo_image_available "${DEDALO_REGISTRY_REPOSITORIES[i]}:$version" || code=$?
		echo "$code"
		i=$((i + 1))
	done
}

# dedalo_default_source CODE… — the index of the first official registry whose
# code is 0 (available), else `build`: the published image when this version is
# published, a local build when it is not. Pure: the codes are its input.
dedalo_default_source() {
	local i=0 code=''
	for code in "$@"; do
		if [ "$code" = '0' ]; then
			echo "$i"
			return 0
		fi
		i=$((i + 1))
	done
	echo build
}

# --- the image's identity ---------------------------------------------------------

# dedalo_repo_digest REPOSITORY TAG — the registry digest (sha256:…) a pulled
# image carries for THAT repository; status 1 when it has none (a local build).
dedalo_repo_digest() {
	local wanted='' listed='' line='' digest=''
	wanted="$(dedalo_repository_normalize "${1-}")"
	listed="$(docker image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "${1-}:${2-}" 2>/dev/null)" || return 1
	while IFS= read -r line; do
		[ -n "$line" ] || continue
		if [ "$(dedalo_repository_normalize "${line%@*}")" = "$wanted" ]; then digest="${line##*@}"; fi
	done <<<"$listed"
	dedalo_digest_grammar "$digest" || return 1
	printf '%s' "$digest"
}

# dedalo_cosign_verify REPOSITORY@sha256:… — `cosign verify` against the OFFICIAL
# signing identity (the generated list). Status 1 when it does not verify, when
# cosign is missing, or when no identity was loaded: never "verified by default".
dedalo_cosign_verify() {
	local ref="${1-}"
	dedalo_digest_grammar "${ref##*@}" && dedalo_repository_grammar "${ref%@*}" || return 1
	[ -n "$DEDALO_IMAGE_SIGNING_ISSUER" ] && [ -n "$DEDALO_IMAGE_SIGNING_IDENTITY_REGEXP" ] || return 1
	command -v cosign >/dev/null 2>&1 || return 1
	cosign verify \
		--certificate-identity-regexp "$DEDALO_IMAGE_SIGNING_IDENTITY_REGEXP" \
		--certificate-oidc-issuer "$DEDALO_IMAGE_SIGNING_ISSUER" \
		"$ref" >/dev/null
}

# dedalo_image_version_label REPOSITORY TAG — the `org.opencontainers.image.version`
# label of the pulled image REPOSITORY:TAG (the release workflow stamps the tag it
# publishes under). The label lives in the image config, which the signed digest
# covers, so after a verify it is the signer's word, not the registry's.
dedalo_image_version_label() {
	docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.version"}}' "${1-}:${2-}" 2>/dev/null
}

# dedalo_verify_release REPOSITORY DIGEST TAG — the official signature on
# REPOSITORY@DIGEST AND the signed image declaring TAG as its version. A signature
# alone proves only that SOME official run built the bytes: a registry whose tag
# pointers someone else controls could name an older signed release (or a
# developer image) `:<newer version>` and walk an installation backwards past
# every version floor. Status 1 on either failure.
dedalo_verify_release() {
	local declared=''
	dedalo_cosign_verify "${1-}@${2-}" || return 1
	declared="$(dedalo_image_version_label "${1-}" "${3-}")" || return 1
	[ -n "$declared" ] && [ "$declared" = "${3-}" ]
}

# --- one run at a time ------------------------------------------------------------

# dedalo_lock_acquire DIR NAME — a portable lock (mkdir is atomic everywhere;
# macOS has no flock): DIR/.NAME.lock holding the holder's pid. A lock whose
# recorded pid is dead is stale and taken over; one with no pid yet is held.
dedalo_lock_acquire() {
	local lock="${1-}/.${2-}.lock" pid=''
	if mkdir "$lock" 2>/dev/null; then
		echo "$$" >"$lock/pid"
		return 0
	fi
	pid="$(cat "$lock/pid" 2>/dev/null || true)"
	if ! [[ "$pid" =~ ^[0-9]+$ ]] || dedalo_pid_alive "$pid"; then return 1; fi
	rm -rf "$lock"
	mkdir "$lock" 2>/dev/null || return 1
	echo "$$" >"$lock/pid"
}

dedalo_pid_alive() {
	kill -0 "$1" 2>/dev/null || ps -p "$1" >/dev/null 2>&1
}

# dedalo_lock_release DIR NAME — only the holder removes the lock.
dedalo_lock_release() {
	local lock="${1-}/.${2-}.lock"
	if [ "$(cat "$lock/pid" 2>/dev/null || true)" = "$$" ]; then rm -rf "$lock"; fi
}
