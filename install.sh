#!/usr/bin/env bash
#
# Dédalo v7 — guided one-command install (containers).
#
# Operator guide: docs/install/quickstart.md
#
# Asks the questions the installer needs, then builds the image, starts
# PostgreSQL, runs the headless installer and brings the stack up. When it
# finishes, Dédalo is installed and you log in — there is no browser wizard and
# therefore no unauthenticated install surface at any point.
#
# It drives docker-compose.simple.yml, which trades TLS and media access control
# away for simplicity. Read that file's header before using this on anything but
# a machine your own network reaches. For the full production stack, follow
# docs/install/docker.md instead — nothing here replaces it.
#
# Re-running is refused once the instance exists: the seed restore requires an
# empty database, so a second install is never a repair.

set -euo pipefail

readonly COMPOSE_FILE='docker-compose.simple.yml'
# NOT ".env": compose would read that for variable substitution, but so would the
# engine's own configuration loader from the container's working directory.
readonly ENV_FILE='.dedalo.env'
readonly PRIVATE_VOLUME='dedalo_private'

cd "$(dirname "$0")"

# --- Small helpers -----------------------------------------------------------

bold()  { printf '\033[1m%s\033[0m\n' "$*"; }
warn()  { printf '\033[33m%s\033[0m\n' "$*"; }
fail()  { printf '\033[31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

# ask <variable> <prompt> [default]
ask() {
	local __var="$1" __prompt="$2" __default="${3-}" __reply=''
	if [ -n "$__default" ]; then
		read -rp "$__prompt [$__default]: " __reply || true
		__reply="${__reply:-$__default}"
	else
		while [ -z "$__reply" ]; do
			read -rp "$__prompt: " __reply || true
		done
	fi
	printf -v "$__var" '%s' "$__reply"
}

# ask_secret <variable> <prompt> — never echoed, typed twice, must match.
ask_secret() {
	local __var="$1" __prompt="$2" __first='' __second=''
	while true; do
		read -rsp "$__prompt: " __first;        echo
		read -rsp "$__prompt (again): " __second; echo
		if [ -z "$__first" ]; then
			warn 'Empty password — try again.'
		elif [ "$__first" != "$__second" ]; then
			warn 'They do not match — try again.'
		else
			break
		fi
	done
	printf -v "$__var" '%s' "$__first"
}

# Lower-cased comparison the long way round: ${var,,} is bash 4, and macOS still
# ships bash 3.2.
confirm() {
	local reply='' lowered=''
	read -rp "$1 [y/N]: " reply || true
	lowered="$(printf '%s' "$reply" | tr '[:upper:]' '[:lower:]')"
	[ "$lowered" = 'y' ] || [ "$lowered" = 'yes' ]
}

random_password() {
	LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom 2>/dev/null | head -c 28 || true
}

compose() {
	docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

# --- Docker bootstrap --------------------------------------------------------
# Everything else this script does runs as YOU and touches only Docker volumes.
# The three helpers below are the exception: they need root, they add a package
# repository, and they change your group membership. That is why each one ASKS
# first and prints the exact command — on an institution's server, "it installed
# something as root" must never be a surprise.

run_as_root() {
	if [ "$(id -u)" = '0' ]; then
		"$@"
	elif command -v sudo >/dev/null 2>&1; then
		sudo "$@"
	else
		fail "This step needs root and there is no sudo here. Run as root: $*"
	fi
}

# usermod does NOT change the groups of the process that called it, so the new
# `docker` membership is invisible until a fresh login. Re-entering the script
# through `sg` gets it now, instead of ending the install with "log out and back
# in" — which would defeat the whole one-command idea. The guard variable makes
# a failed re-exec fail loudly rather than loop.
reexec_in_docker_group() {
	if [ "${DEDALO_INSTALL_DOCKER_BOOTSTRAPPED:-}" = '1' ]; then
		fail 'Still cannot reach the Docker daemon. Log out, log back in, and run ./install.sh again.'
	fi
	export DEDALO_INSTALL_DOCKER_BOOTSTRAPPED=1
	if command -v sg >/dev/null 2>&1; then
		bold 'Re-entering the script with your new docker group…'
		exec sg docker -c "$(printf '%q ' "$0" "$@")"
	fi
	fail 'You were added to the "docker" group. Log out, log back in, then run ./install.sh again.'
}

install_docker() {
	case "$(uname -s)" in
		Linux) : ;;
		Darwin) fail 'On macOS, install Docker Desktop (https://docs.docker.com/desktop/), start it, then run ./install.sh again.' ;;
		*) fail 'Automatic Docker installation is only supported on Linux. See https://docs.docker.com/engine/install/' ;;
	esac

	echo 'Docker is not installed.'
	echo
	echo 'This script can install it using Docker'"'"'s own convenience script, which'
	echo 'adds their package repository and installs the engine — AS ROOT:'
	echo
	echo '    curl -fsSL https://get.docker.com -o get-docker.sh'
	echo '    sudo sh get-docker.sh'
	echo
	echo 'If you would rather not run a downloaded script as root, install Docker'
	echo 'yourself (https://docs.docker.com/engine/install/) and run this again.'
	echo
	confirm 'Install Docker now?' \
		|| fail 'Stopped. Install Docker, then run ./install.sh again.'

	command -v curl >/dev/null 2>&1 || fail 'curl is needed to fetch the Docker installer.'
	# Downloaded to a file and then run, rather than piped into a shell: a
	# truncated download cannot half-execute, and you can read it first.
	local script='/tmp/dedalo_get-docker.sh'
	curl -fsSL https://get.docker.com -o "$script" || fail 'Could not download the Docker installer.'
	run_as_root sh "$script" || fail 'The Docker installer failed — see its output above.'
	rm -f "$script"
	run_as_root systemctl enable --now docker >/dev/null 2>&1 || true
}

ensure_docker() {
	if ! command -v docker >/dev/null 2>&1; then
		install_docker
	fi

	if ! docker info >/dev/null 2>&1; then
		# Two very different causes, and the fix differs: the daemon may be down,
		# or it may be running and simply unreachable by this user.
		if run_as_root docker info >/dev/null 2>&1; then
			warn 'Docker is running, but your user cannot reach it — you are not in the "docker" group.'
			confirm 'Add your user to the docker group?' \
				|| fail 'Stopped. Add yourself with: sudo usermod -aG docker "$USER"'
			run_as_root usermod -aG docker "$(id -un)"
			reexec_in_docker_group "$@"
		else
			warn 'The Docker daemon is not running.'
			confirm 'Start it now?' || fail 'Stopped. Start Docker, then run ./install.sh again.'
			run_as_root systemctl enable --now docker || fail 'Could not start the Docker daemon.'
			if ! docker info >/dev/null 2>&1; then
				run_as_root usermod -aG docker "$(id -un)"
				reexec_in_docker_group "$@"
			fi
		fi
	fi

	docker compose version >/dev/null 2>&1 \
		|| fail 'Docker Compose v2 or newer is required (the "docker compose" subcommand, not the old standalone docker-compose).'
}

# --- 1. Pre-flight -----------------------------------------------------------

bold 'Dédalo — guided install'
echo

# Every question below reads from the terminal; piped into a non-interactive
# shell it would spin forever on a required answer.
[ -t 0 ] || fail 'This script is interactive — run it from a terminal.'

ensure_docker "$@"

[ -f "$COMPOSE_FILE" ] \
	|| fail "$COMPOSE_FILE not found — run this script from the master_dedalo directory."

# Disk. Measured on a clean Ubuntu 26.04 box: the engine image is ~2.5 GB (the
# media toolchain and the PostgreSQL client dominate), postgres:18 ~0.7 GB,
# nginx:alpine ~0.1 GB, and the build itself parks a ~3 GB cache that is only
# reclaimable AFTERWARDS (`docker builder prune -af`). Add the seed restore on
# top and 8 GB free is the honest floor — below it the install dies mid-restore
# with `No space left on device`, which is a confusing way to learn this.
docker_root="$(docker info --format '{{.DockerRootDir}}' 2>/dev/null || echo /var/lib/docker)"
free_gib="$(df -BG --output=avail "$docker_root" 2>/dev/null | tail -1 | tr -dc '0-9')"
if [ -n "$free_gib" ] && [ "$free_gib" -lt 8 ]; then
	warn "Only ${free_gib} GiB free on $docker_root — the install needs about 8 GiB."
	warn 'Free some space (docker system prune -af) or point Docker at a bigger disk.'
	confirm 'Continue anyway?' || fail 'Stopped — not enough disk.'
fi

if docker volume inspect "$PRIVATE_VOLUME" >/dev/null 2>&1; then
	warn "This machine already has a Dédalo instance (docker volume '$PRIVATE_VOLUME')."
	warn 'Installing again is refused: the seed restore requires an empty database, so a'
	warn 'second install cannot repair a broken one. To start over, destroy the data first:'
	warn "    docker compose -f $COMPOSE_FILE down -v"
	exit 1
fi

# --- 2. Questions ------------------------------------------------------------

echo 'A few questions. Press Enter to accept the value in brackets.'
echo

ask ENTITY        'Short code for your institution (letters/digits, no spaces)' 'dedalo'
ask ENTITY_LABEL  'Full name, as shown on the login screen'                     "$ENTITY"
ask LANGS         'Working languages (comma-separated Dédalo codes)'            'lg-eng,lg-spa'
APP_LANG="${LANGS%%,*}"
ask HIERARCHIES   'Thesauri to install now (comma-separated, or "none")'        'none'
# `[ … ] && x=''` would return non-zero when the test fails, and `set -e` would
# exit the script on it. Same reason for the `if` around the flag append below.
if [ "$HIERARCHIES" = 'none' ]; then HIERARCHIES=''; fi
ask LOCALE        'Locale'                                                      'es-ES'
ask TIMEZONE      'Time zone (stamps every record timestamp)'                   'Europe/Madrid'
echo

bold 'Administrator password'
echo 'This is the "root" account — the one that can do everything. Store it safely.'
ask_secret ROOT_PASSWORD 'Password for root'
echo

# The database is on an internal container network and its port is never
# published, so nobody needs to type or remember this one.
DB_PASSWORD="$(random_password)"
[ -n "$DB_PASSWORD" ] || fail 'Could not generate a database password (/dev/urandom unavailable).'

# --- 3. The honesty check ----------------------------------------------------

echo
warn 'Before continuing, what this simple install does NOT do:'
warn '  • no HTTPS — passwords and sessions travel in clear text;'
warn '  • no media access control — anyone who can reach this server can read'
warn '    every image, document and recording in it, without logging in.'
echo 'Both are fine on a machine only your own network can reach.'
echo 'If this server is reachable from the internet, stop and follow'
echo 'docs/install/docker.md instead, which adds TLS and the media gate.'
echo
confirm 'Only your own network can reach this machine — continue?' \
	|| fail 'Stopped. See docs/install/docker.md for the full stack.'

# --- 4. Write the compose environment ---------------------------------------

umask 077
cat >"$ENV_FILE" <<ENV
# Written by install.sh — compose variable substitution only.
# The engine's own configuration lives in the 'private' volume, at /private/.env.
POSTGRES_DB=dedalo
POSTGRES_USER=dedalo
POSTGRES_PASSWORD=$DB_PASSWORD
ENV
umask 022
echo "Wrote $ENV_FILE (database credentials, readable only by you)."

# --- 5. Build and install ----------------------------------------------------

echo
bold 'Building the image (first run downloads the media toolchain — this is slow)…'
compose build

bold 'Starting PostgreSQL…'
compose up -d postgres

bold 'Waiting for the database…'
for _ in $(seq 1 60); do
	if compose exec -T postgres pg_isready -U dedalo -d dedalo >/dev/null 2>&1; then
		break
	fi
	sleep 2
done
compose exec -T postgres pg_isready -U dedalo -d dedalo >/dev/null 2>&1 \
	|| fail 'PostgreSQL did not become ready. Inspect it with: docker compose -f '"$COMPOSE_FILE"' logs postgres'

bold 'Installing Dédalo…'
# The root password travels in the ENVIRONMENT, never in argv: an argv is visible
# in `ps`. --media-path and --socket are persisted to /private/.env, so the file
# describes the deployment on its own.
install_args=(
	--db-name dedalo --db-user dedalo --db-password "$DB_PASSWORD" --db-host postgres
	--entity "$ENTITY" --entity-label "$ENTITY_LABEL"
	--locale "$LOCALE" --timezone "$TIMEZONE"
	--langs "$LANGS" --app-lang "$APP_LANG" --data-lang "$APP_LANG"
	--media-path /srv/dedalo/media
	--socket /run/dedalo/dedalo_ts.sock
)
if [ -n "$HIERARCHIES" ]; then install_args+=(--hierarchies "$HIERARCHIES"); fi

# Exported explicitly rather than as a `VAR=x compose …` prefix: `compose` is a
# shell function, and whether such a prefix reaches the child process is a corner
# of bash not worth betting the install on. `-e NAME` (no value) passes it
# through from this environment, so the password never appears in argv.
export DEDALO_INSTALL_ROOT_PASSWORD="$ROOT_PASSWORD"
compose run --rm -e DEDALO_INSTALL_ROOT_PASSWORD \
	dedalo bun run scripts/install.ts "${install_args[@]}" \
	|| fail 'The installer failed. Nothing was sealed; read the output above, then destroy the half-built instance with:
    docker compose -f '"$COMPOSE_FILE"' down -v'
unset DEDALO_INSTALL_ROOT_PASSWORD

# --- 6. Serve ----------------------------------------------------------------

bold 'Starting Dédalo…'
compose up -d

echo
bold '✔ Done.'
echo
echo "  Open   http://localhost/dedalo/core/page/"
echo '         (from another machine on your network, use this server'"'"'s address'
echo '          instead of localhost)'
echo '  Log in as "root" with the password you chose.'
echo
echo '  First things to do: create a normal administrator user and keep root for'
echo '  emergencies, then set up backups — docs/management/backup.md.'
echo
echo "  Logs:  docker compose -f $COMPOSE_FILE logs -f dedalo"
echo "  Stop:  docker compose -f $COMPOSE_FILE stop"
echo
