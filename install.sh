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
readonly TLS_TEMPLATE='deploy/nginx.simple-tls.conf.tpl'
readonly GENERATED_CONF='deploy/nginx.simple.generated.conf'
readonly CERT_DIR='deploy/certs'
# NOT ".env": compose would read that for variable substitution, but so would the
# engine's own configuration loader from the container's working directory.
readonly ENV_FILE='.dedalo.env'
readonly PRIVATE_VOLUME='dedalo_private'

cd "$(dirname "$0")"

# --wizard: set TLS up and start the stack, then stop and let the operator answer
# the install questions in the browser. Same TLS code either way — and TLS has to
# come FIRST in this mode, because the wizard sends the root password you are
# about to choose over the network.
WIZARD_MODE='false'
case "${1-}" in
	--wizard) WIZARD_MODE='true' ;;
	'') : ;;
	*) printf 'Usage: %s [--wizard]\n' "$0" >&2; exit 2 ;;
esac

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

# --- TLS ---------------------------------------------------------------------
# HTTPS is the DEFAULT here, and the reason is concrete: the login form and (in
# wizard mode) the root password you are about to set both cross the network. On
# plain HTTP anyone on the same switch reads them. The four modes below differ
# only in where the certificate comes from.
#
# Whichever mode runs, it must end having set: TLS_MODE, NGINX_CONF_NAME,
# COOKIE_SECURE, PUBLIC_URL — and, unless mode 4, written $GENERATED_CONF.

# generate_tls_conf <server_name> <cert_path_in_container> <key_path_in_container>
generate_tls_conf() {
	[ -f "$TLS_TEMPLATE" ] || fail "Missing $TLS_TEMPLATE"
	sed -e "s|@@SERVER_NAME@@|$1|g" \
	    -e "s|@@SSL_CERT@@|$2|g" \
	    -e "s|@@SSL_KEY@@|$3|g" \
	    "$TLS_TEMPLATE" > "$GENERATED_CONF" \
		|| fail "Could not write $GENERATED_CONF"
	NGINX_CONF_NAME="$(basename "$GENERATED_CONF")"
	COOKIE_SECURE='true'
}

# Mode 1 — Let's Encrypt. A real, publicly-trusted, auto-renewing certificate.
# Preconditions are strict and worth stating plainly rather than discovering
# through a failed challenge: the name must resolve publicly TO THIS MACHINE, and
# port 80 must be reachable from the internet. A LAN-only box cannot satisfy
# either, which is what mode 2 is for.
tls_letsencrypt() {
	echo
	echo 'Let'"'"'s Encrypt issues a free certificate that browsers trust, and renews it'
	echo 'automatically. For it to work, all of this must already be true:'
	echo
	echo '  • the domain name resolves, on the public internet, to THIS machine;'
	echo '  • port 80 on this machine is reachable from the internet;'
	echo '  • you can receive mail at the address you give (expiry warnings).'
	echo
	ask LE_DOMAIN 'Domain name (e.g. dedalo.museum.org)'
	ask LE_EMAIL  'Email address for expiry notices'

	local staging=''
	if confirm 'Do a dry run against the Let'"'"'s Encrypt STAGING server first? (recommended)'; then
		staging='--staging'
		warn 'Staging certificates are NOT trusted by browsers — this only proves the setup.'
	fi

	# Standalone, before nginx exists: certbot binds port 80 itself, so there is
	# no chicken-and-egg (nginx cannot start on 443 without the certificate it is
	# here to fetch). RENEWAL later goes through the running nginx via webroot,
	# so the proxy never has to stop — see the certbot service in the compose file.
	bold 'Requesting the certificate…'
	docker run --rm -p 80:80 \
		-v dedalo_letsencrypt:/etc/letsencrypt \
		-v dedalo_certbot_www:/var/www/certbot \
		certbot/certbot certonly --standalone $staging \
		-d "$LE_DOMAIN" --email "$LE_EMAIL" \
		--agree-tos --no-eff-email --non-interactive \
		|| fail 'Certificate request failed — read certbot'"'"'s output above.
Most often: the name does not point here, or port 80 is not reachable from outside.
You can re-run ./install.sh and pick another mode.'

	generate_tls_conf "$LE_DOMAIN" \
		"/etc/letsencrypt/live/$LE_DOMAIN/fullchain.pem" \
		"/etc/letsencrypt/live/$LE_DOMAIN/privkey.pem"
	COMPOSE_PROFILES='letsencrypt'
	PUBLIC_URL="https://$LE_DOMAIN/dedalo/core/page/"
}

# Mode 2 — a local certificate authority, for a LAN with no public name. Same
# idea as mkcert, done with openssl so nothing extra has to be installed. The
# certificate is real TLS; the CA is yours, so browsers only trust it on machines
# where you install the CA file. That distribution step cannot be automated from
# here, and pretending otherwise would be the dishonest part.
tls_local_ca() {
	command -v openssl >/dev/null 2>&1 || fail 'openssl is required for the local-CA mode.'
	echo
	ask LOCAL_HOST 'Name or IP staff will type in the browser (e.g. dedalo.local or 192.168.1.20)' "$(hostname -f 2>/dev/null || hostname)"

	mkdir -p "$CERT_DIR"
	local ca_key="$CERT_DIR/dedalo-local-ca.key" ca_crt="$CERT_DIR/dedalo-local-ca.pem"
	local key="$CERT_DIR/privkey.pem" csr="$CERT_DIR/server.csr" crt="$CERT_DIR/fullchain.pem"

	# A SAN covering the name, localhost and the loopback address: browsers have
	# ignored the legacy CN field for years, so a certificate without a matching
	# SAN entry is rejected outright.
	local san="DNS:$LOCAL_HOST,DNS:localhost,IP:127.0.0.1"
	case "$LOCAL_HOST" in
		[0-9]*.[0-9]*.[0-9]*.[0-9]*) san="IP:$LOCAL_HOST,DNS:localhost,IP:127.0.0.1" ;;
	esac

	bold 'Creating a local certificate authority and a server certificate…'
	openssl req -x509 -newkey rsa:4096 -sha256 -days 3650 -nodes \
		-keyout "$ca_key" -out "$ca_crt" \
		-subj "/CN=Dedalo local CA" 2>/dev/null \
		|| fail 'Could not create the local CA.'
	openssl req -newkey rsa:2048 -nodes -keyout "$key" -out "$csr" \
		-subj "/CN=$LOCAL_HOST" 2>/dev/null \
		|| fail 'Could not create the server key.'
	# 825 days is the maximum leaf lifetime Apple platforms accept; longer and
	# Safari and iOS reject the certificate outright.
	openssl x509 -req -in "$csr" -CA "$ca_crt" -CAkey "$ca_key" -CAcreateserial \
		-out "$crt" -days 825 -sha256 \
		-extfile <(printf 'subjectAltName=%s\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n' "$san") 2>/dev/null \
		|| fail 'Could not sign the server certificate.'
	rm -f "$csr"
	chmod 600 "$ca_key" "$key"

	generate_tls_conf '_' '/etc/dedalo/certs/fullchain.pem' '/etc/dedalo/certs/privkey.pem'
	PUBLIC_URL="https://$LOCAL_HOST/dedalo/core/page/"
	LOCAL_CA_FILE="$ca_crt"
}

# Mode 3 — you already have a certificate (institutional CA, a wildcard, a cert
# your IT department issues). Copied in rather than referenced, so a later
# `docker compose up` cannot break on a path that moved.
tls_existing() {
	echo
	ask EXIST_CRT 'Path to the full-chain certificate (.pem/.crt)'
	ask EXIST_KEY 'Path to the private key (.pem/.key)'
	[ -f "$EXIST_CRT" ] || fail "No such file: $EXIST_CRT"
	[ -f "$EXIST_KEY" ] || fail "No such file: $EXIST_KEY"
	ask EXIST_NAME 'Domain name on that certificate (or _ for any)' '_'

	mkdir -p "$CERT_DIR"
	cp "$EXIST_CRT" "$CERT_DIR/fullchain.pem" || fail 'Could not copy the certificate.'
	cp "$EXIST_KEY" "$CERT_DIR/privkey.pem"   || fail 'Could not copy the key.'
	chmod 600 "$CERT_DIR/privkey.pem"

	generate_tls_conf "$EXIST_NAME" '/etc/dedalo/certs/fullchain.pem' '/etc/dedalo/certs/privkey.pem'
	# `[ … ] && x=…` as the last command of a function returns non-zero when the
	# test fails, and `set -e` would exit the whole script on it.
	if [ "$EXIST_NAME" = '_' ]; then
		PUBLIC_URL='https://<this-machine>/dedalo/core/page/'
	else
		PUBLIC_URL="https://$EXIST_NAME/dedalo/core/page/"
	fi
}

# Mode 4 — no HTTPS. Kept because it is genuinely right for a throwaway trial on
# a laptop, and because forcing a certificate on someone evaluating the software
# would just make them give up. It is never right for real records.
tls_none() {
	echo
	warn 'Without HTTPS, passwords and session cookies cross the network in clear text.'
	warn 'Anyone on the same network can read them, and the browser will not warn you.'
	confirm 'Really continue with no HTTPS?' \
		|| fail 'Stopped. Re-run ./install.sh and choose a certificate option.'
	NGINX_CONF_NAME='nginx.simple.conf'
	COOKIE_SECURE='false'
	PUBLIC_URL='http://localhost/dedalo/core/page/'
}

choose_tls() {
	echo
	bold 'How will people reach this Dédalo?'
	echo
	echo '  1) A public domain name        → Let'"'"'s Encrypt: trusted, auto-renewing   [recommended]'
	echo '  2) Only our local network      → a local certificate authority'
	echo '  3) I already have a certificate → point me at the files'
	echo '  4) No HTTPS, internal test only → not for real records'
	echo
	local choice=''
	while true; do
		read -rp 'Choose [1]: ' choice || true
		case "${choice:-1}" in
			1) TLS_MODE='letsencrypt'; tls_letsencrypt; break ;;
			2) TLS_MODE='local-ca';    tls_local_ca;    break ;;
			3) TLS_MODE='existing';    tls_existing;    break ;;
			4) TLS_MODE='none';        tls_none;        break ;;
			*) warn 'Enter 1, 2, 3 or 4.' ;;
		esac
	done
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

# TLS first: it is the decision with the widest consequences, and mode 1 fails
# fast (a bad domain is discovered now, not after you have typed everything).
choose_tls

if [ "$WIZARD_MODE" = 'true' ]; then
	echo
	echo 'Wizard mode: the remaining questions are asked in the browser instead.'
fi

echo
if [ "$WIZARD_MODE" != 'true' ]; then
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
fi   # end of the terminal-only questions

# The database is on an internal container network and its port is never
# published, so nobody needs to type or remember this one.
DB_PASSWORD="$(random_password)"
[ -n "$DB_PASSWORD" ] || fail 'Could not generate a database password (/dev/urandom unavailable).'

# --- 3. The honesty check ----------------------------------------------------

echo
warn 'One thing this simple install does NOT do, whatever you chose above:'
warn '  • no media access control — anyone who can reach this server can read'
warn '    every image, document and recording in it, without logging in.'
echo
echo 'TLS protects those files in transit; it does not decide who may fetch them.'
echo 'That is fine for a collection that is public anyway, or an internal'
echo 'instance. For a restricted fonds, an embargoed deposit or personal data,'
echo 'use docs/install/docker.md instead — it adds the engine-enforced media gate.'
echo
confirm 'Understood — continue?' \
	|| fail 'Stopped. See docs/install/docker.md for the full stack.'

# --- 4. Write the compose environment ---------------------------------------

umask 077
cat >"$ENV_FILE" <<ENV
# Written by install.sh — compose variable substitution only.
# The engine's own configuration lives in the 'private' volume, at /private/.env.
POSTGRES_DB=dedalo
POSTGRES_USER=dedalo
POSTGRES_PASSWORD=$DB_PASSWORD
# TLS mode chosen at install time: $TLS_MODE
DEDALO_NGINX_CONF=$NGINX_CONF_NAME
SESSION_COOKIE_SECURE=$COOKIE_SECURE
COMPOSE_PROFILES=${COMPOSE_PROFILES:-}
ENV
umask 022
echo "Wrote $ENV_FILE (database credentials, readable only by you)."

# Exported as well as written to the env file: which of the two Compose reads for
# profile selection has varied between versions, and the renewal service simply
# not starting would be a silent failure discovered 90 days later.
if [ -n "${COMPOSE_PROFILES:-}" ]; then export COMPOSE_PROFILES; fi

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

if [ "$WIZARD_MODE" = 'true' ]; then
	bold 'Starting Dédalo for the browser wizard…'
	compose up -d
	echo
	bold '✔ Ready for the wizard.'
	echo
	echo "  Open   $PUBLIC_URL"
	echo
	echo '  Nothing is configured yet, so Dédalo serves the install wizard instead'
	echo '  of a login form. At its DATABASE step, enter:'
	echo
	echo '      Host      postgres'
	echo '      Port      5432'
	echo '      Database  dedalo'
	echo '      User      dedalo'
	echo "      Password  $DB_PASSWORD"
	echo
	echo '  (That password was generated for this install and is also in'
	echo "   $ENV_FILE. You never need it again after the wizard.)"
	echo
	echo '  At "Save config" the engine restarts itself — that is expected. Leave'
	echo '  the tab open; the wizard resumes on its own.'
	echo
	if [ "$TLS_MODE" = 'local-ca' ]; then
		warn '  Install the CA file on this computer FIRST, or the browser will refuse'
		warn "  the connection: $(pwd)/$LOCAL_CA_FILE"
		echo
	fi
	echo "  Logs:  docker compose -f $COMPOSE_FILE --env-file $ENV_FILE logs -f dedalo"
	echo
	exit 0
fi

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
echo "  Open   $PUBLIC_URL"
echo '  Log in as "root" with the password you chose.'
echo

case "$TLS_MODE" in
	local-ca)
		bold '  One more step, on every computer that will use Dédalo:'
		echo "  install this certificate authority file, or the browser will warn"
		echo '  about the site every time:'
		echo
		echo "      $(pwd)/$LOCAL_CA_FILE"
		echo
		echo '  Windows: double-click → Install Certificate → Local Machine →'
		echo '           Trusted Root Certification Authorities.'
		echo '  macOS:   double-click → Keychain Access → System → set to "Always Trust".'
		echo '  Linux:   copy to /usr/local/share/ca-certificates/ (rename to .crt)'
		echo '           and run: sudo update-ca-certificates'
		echo
		echo '  Until you do, the connection is still encrypted — the browser simply'
		echo '  cannot vouch for who is on the other end.'
		echo
		;;
	letsencrypt)
		echo '  The certificate renews itself: the certbot service checks twice a day'
		echo '  and nginx picks up a renewal within six hours. Nothing to schedule.'
		echo
		;;
	none)
		warn '  No HTTPS: passwords cross the network in clear text. Re-run'
		warn '  ./install.sh and choose option 1 or 2 when this stops being a test.'
		echo
		;;
esac

echo '  First things to do: create a normal administrator user and keep root for'
echo '  emergencies, then set up backups — docs/management/backup.md.'
echo
echo "  Logs:  docker compose -f $COMPOSE_FILE logs -f dedalo"
echo "  Stop:  docker compose -f $COMPOSE_FILE stop"
echo
