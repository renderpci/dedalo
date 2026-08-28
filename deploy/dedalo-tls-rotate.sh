#!/usr/bin/env bash
#
# TLS ROTATION — replace the local certificate authority and/or the site
# certificate of a container install, without reinstalling anything.
#
# WHY THIS EXISTS (audit 2026-08-26, OPS-01). Until this change the container
# build context carried `deploy/certs/` into the image: `Dockerfile` was
# `COPY . .` and `.dockerignore` named neither the certificate directory nor
# `.dedalo.env`. Any image built on a host that ran `./install.sh` with the
# local-CA option therefore contains `dedalo-local-ca.key` — the private key of
# a certificate authority the operator was instructed to install into the
# Trusted Root store of EVERY computer that uses Dédalo. Whoever holds that key
# can mint a browser-trusted certificate for ANY hostname on all of those
# workstations. The build context is now deny-all and the COPY is narrowed
# (deploy/build_context.ts), but a key that has ALREADY travelled inside an
# image is compromised and stays compromised: it must be replaced, and the old
# CA must be REMOVED from every trust store it was installed in. That is what
# this script is for. See engineering/PRODUCTION.md §13.
#
# It is also the ONE generator of local-CA material: `install.sh` calls it for
# the first issue, so the certificate an install gets and the certificate a
# rotation gets are produced by the same code.
#
# USAGE
#   deploy/dedalo-tls-rotate.sh --mode local-ca --host dedalo.local
#   deploy/dedalo-tls-rotate.sh --mode existing --cert /path/fullchain.pem --key /path/privkey.pem
#
#   --dir <path>           certificate directory (default: deploy/certs)
#   --compose-file <path>  stack to reload  (default: docker-compose.simple.yml)
#   --no-reload            do not touch Docker (the gate and dry runs use this)
#   --quiet                no operator epilogue (install.sh prints its own)
#
# WHAT IT DOES NOT DO: it never touches the database password, the engine's
# `/private/.env`, or a Let's Encrypt certificate (mode 1 renews itself and its
# key never enters the build context — it lives in a named volume). The
# procedure for a rotated DB password is in engineering/PRODUCTION.md §13.

set -euo pipefail

MODE='' HOST='' CERT_IN='' KEY_IN='' QUIET='false' RELOAD='true'
CERT_DIR='' COMPOSE_FILE='docker-compose.simple.yml'

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$HERE")"

fail() { printf '\033[31m✖ %s\033[0m\n' "$*" >&2; exit 1; }
say()  { [ "$QUIET" = 'true' ] || printf '%s\n' "$*"; }

while [ $# -gt 0 ]; do
	case "$1" in
		--mode) MODE="${2-}"; shift 2 ;;
		--host) HOST="${2-}"; shift 2 ;;
		--cert) CERT_IN="${2-}"; shift 2 ;;
		--key) KEY_IN="${2-}"; shift 2 ;;
		--dir) CERT_DIR="${2-}"; shift 2 ;;
		--compose-file) COMPOSE_FILE="${2-}"; shift 2 ;;
		--no-reload) RELOAD='false'; shift ;;
		--quiet) QUIET='true'; shift ;;
		*) fail "unknown argument: $1" ;;
	esac
done

[ -n "$CERT_DIR" ] || CERT_DIR="$REPO_ROOT/deploy/certs"

case "$MODE" in
	local-ca)
		[ -n "$HOST" ] || fail 'local-ca mode needs --host (the name or IP staff type in the browser).'
		command -v openssl >/dev/null 2>&1 || fail 'openssl is required for the local-CA mode.'
		;;
	existing)
		[ -n "$CERT_IN" ] && [ -n "$KEY_IN" ] || fail 'existing mode needs --cert and --key.'
		[ -f "$CERT_IN" ] || fail "No such file: $CERT_IN"
		[ -f "$KEY_IN" ] || fail "No such file: $KEY_IN"
		;;
	*) fail 'Usage: --mode local-ca --host <name> | --mode existing --cert <file> --key <file>' ;;
esac

# THE INPUT MAY BE THE DESTINATION. Re-running with `--cert deploy/certs/fullchain.pem`
# is a natural thing to do, and the archive step below MOVES the destination out
# of the way — which would delete the source before it is read and leave the
# install with no certificate at all. Stage the inputs first, then archive.
STAGED=''
if [ "$MODE" = 'existing' ]; then
	STAGED="$(mktemp -d "${TMPDIR:-/tmp}/dedalo-tls-rotate.XXXXXX")"
	trap 'rm -rf "$STAGED"' EXIT
	cp "$CERT_IN" "$STAGED/fullchain.pem" || fail "Could not read $CERT_IN."
	cp "$KEY_IN" "$STAGED/privkey.pem" || fail "Could not read $KEY_IN."
	CERT_IN="$STAGED/fullchain.pem"
	KEY_IN="$STAGED/privkey.pem"
fi

STAMP="$(date -u '+%Y-%m-%dT%H%M%SZ')"
CA_KEY="$CERT_DIR/dedalo-local-ca.key"
CA_CRT="$CERT_DIR/dedalo-local-ca.pem"
SITE_KEY="$CERT_DIR/privkey.pem"
SITE_CRT="$CERT_DIR/fullchain.pem"

# The DIRECTORY permission is left alone on purpose: the shipped stacks
# bind-mount deploy/certs into the nginx container, and tightening a directory a
# running proxy reads is how a rotation takes a museum's HTTPS down. The KEY
# FILES carry the protection (600, below), which is what matters.
mkdir -p "$CERT_DIR"

# --- 1. Archive whatever is there ------------------------------------------
# NEVER overwrite key material in place: a rotation that fails halfway must
# leave the operator able to put the working certificate back, and the OLD CA
# CERTIFICATE is what identifies the entry to delete from every trust store.
# The archive stays inside deploy/certs — gitignored, outside the build context
# and outside every release archive — so archiving moves nothing into a lane.
ARCHIVE=''
for existing in "$CA_KEY" "$CA_CRT" "$SITE_KEY" "$SITE_CRT" "$CERT_DIR/dedalo-local-ca.srl"; do
	[ -f "$existing" ] || continue
	if [ -z "$ARCHIVE" ]; then
		# The stamp has one-second resolution. Two rotations inside the same
		# second would land in the SAME directory and the second `mv` would
		# overwrite the first archive's files — losing key material silently,
		# which is the one thing this script must never do.
		ARCHIVE="$CERT_DIR/rotated-$STAMP"
		attempt=2
		while [ -e "$ARCHIVE" ]; do
			ARCHIVE="$CERT_DIR/rotated-$STAMP-$attempt"
			attempt=$((attempt + 1))
		done
		mkdir -p "$ARCHIVE"
		chmod 700 "$ARCHIVE"
	fi
	mv "$existing" "$ARCHIVE/"
done
[ -z "$ARCHIVE" ] || say "Previous material moved to $ARCHIVE (delete it once the new CA is distributed)."

# --- 2. Issue -------------------------------------------------------------
umask 077
if [ "$MODE" = 'local-ca' ]; then
	# The SAN covers the name, localhost and the loopback address: browsers have
	# ignored the legacy CN field for years, so a certificate without a matching
	# SAN entry is rejected outright.
	SAN="DNS:$HOST,DNS:localhost,IP:127.0.0.1"
	case "$HOST" in
		[0-9]*.[0-9]*.[0-9]*.[0-9]*) SAN="IP:$HOST,DNS:localhost,IP:127.0.0.1" ;;
	esac

	# THE SUBJECT CARRIES THE ISSUE STAMP. Two authorities both called "Dedalo
	# local CA" are indistinguishable in a Windows or macOS trust store, and an
	# operator rotating away from a compromised key MUST be able to tell which
	# entry to delete.
	CSR="$CERT_DIR/server.csr"
	openssl req -x509 -newkey rsa:4096 -sha256 -days 3650 -nodes \
		-keyout "$CA_KEY" -out "$CA_CRT" \
		-subj "/CN=Dedalo local CA $STAMP" 2>/dev/null \
		|| fail 'Could not create the local CA.'
	openssl req -newkey rsa:2048 -nodes -keyout "$SITE_KEY" -out "$CSR" \
		-subj "/CN=$HOST" 2>/dev/null \
		|| fail 'Could not create the server key.'
	# 825 days is the maximum leaf lifetime Apple platforms accept; longer and
	# Safari and iOS reject the certificate outright.
	openssl x509 -req -in "$CSR" -CA "$CA_CRT" -CAkey "$CA_KEY" -CAcreateserial \
		-out "$SITE_CRT" -days 825 -sha256 \
		-extfile <(printf 'subjectAltName=%s\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n' "$SAN") 2>/dev/null \
		|| fail 'Could not sign the server certificate.'
	rm -f "$CSR"
else
	# Copied in rather than referenced, so a later `docker compose up` cannot
	# break on a path that moved.
	cp "$CERT_IN" "$SITE_CRT" || fail "Could not copy $CERT_IN to $SITE_CRT."
	cp "$KEY_IN" "$SITE_KEY" || fail "Could not copy $KEY_IN to $SITE_KEY."
fi
umask 022

# `[ -f x ] && chmod …` as a bare statement returns non-zero when the file is
# absent, and `set -e` would exit the script on it — the same trap install.sh
# documents twice.
chmod 600 "$SITE_KEY"
chmod 644 "$SITE_CRT"
if [ -f "$CA_KEY" ]; then chmod 600 "$CA_KEY"; fi
if [ -f "$CA_CRT" ]; then chmod 644 "$CA_CRT"; fi

# --- 3. Reload the proxy ---------------------------------------------------
# nginx reads the certificate once, at start and on reload. The shipped stacks
# reload every 6 hours on their own, so a missed reload heals — but an operator
# rotating a COMPROMISED key needs it now, and needs to be told if it did not
# happen.
if [ "$RELOAD" = 'true' ]; then
	if docker compose -f "$REPO_ROOT/$COMPOSE_FILE" exec -T nginx nginx -s reload >/dev/null 2>&1; then
		say 'nginx reloaded — the new certificate is being served.'
	else
		say 'Could not reload nginx from here. Run it yourself when the stack is up:'
		say "    docker compose -f $COMPOSE_FILE exec nginx nginx -s reload"
	fi
fi

# --- 4. Tell the operator what only they can do ----------------------------
if [ "$QUIET" != 'true' ]; then
	echo
	if [ "$MODE" = 'local-ca' ]; then
		printf 'New local CA: %s\n' "$CA_CRT"
		openssl x509 -in "$CA_CRT" -noout -subject -fingerprint -sha256 2>/dev/null || true
		echo
		echo 'On EVERY computer that uses Dédalo, in this order:'
		echo '  1. install the NEW CA file above (Windows: double-click → Install'
		echo '     Certificate → Local Machine → Trusted Root Certification Authorities;'
		echo '     macOS: Keychain Access → System → Always Trust; Linux: copy to'
		echo '     /usr/local/share/ca-certificates/ as .crt then update-ca-certificates);'
		echo '  2. DELETE the previous "Dedalo local CA" entry. Until you do, a'
		echo '     certificate signed with the old key is still trusted by that machine —'
		echo '     which is the whole reason for rotating.'
	else
		echo "Installed $SITE_CRT + $SITE_KEY."
		echo 'Revoke the previous certificate with the authority that issued it — a key'
		echo 'that travelled inside an image is compromised whether or not it is in use.'
	fi
	echo
fi
