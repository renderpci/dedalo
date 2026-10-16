#!/usr/bin/env bash
#
# TLS ROTATION AND RENEWAL — issue, replace or renew the local certificate
# authority and the site certificate of an install (container OR native),
# without reinstalling anything.
#
# WHY THIS EXISTS (audit 2026-08-26, OPS-01). Until that change the container
# build context carried `deploy/certs/` into the image: `Dockerfile` was
# `COPY . .` and `.dockerignore` named neither the certificate directory nor
# `.dedalo.env`. Any image built on a host that ran the installer with the
# local-CA option therefore contains `dedalo-local-ca.key` — the private key of
# a certificate authority the operator was instructed to install into the
# Trusted Root store of EVERY computer that uses Dédalo. Whoever holds that key
# can mint a browser-trusted certificate for ANY hostname on all of those
# workstations. The build context is now deny-all and the COPY is narrowed
# (deploy/build_context.ts), but a key that has ALREADY travelled inside an
# image is compromised and stays compromised: it must be replaced, and the old
# CA must be REMOVED from every trust store it was installed in. That is what
# `--mode local-ca` on an existing install is for. See engineering/PRODUCTION.md §13.
#
# It is also the ONE generator of local-CA material, for BOTH install routes:
# the docker route's stack_tls step and the native (production) route's TLS
# step call it for the first issue, and the native route's renewal timer calls
# `--mode renew`, so the certificate an install gets, a rotation gets and a
# renewal gets are produced by the same code (no second generator anywhere —
# build_context_secret_tripwire H).
#
# THE AUTHORITY IS NAME-CONSTRAINED, AND ITS ROOT KEY DOES NOT SURVIVE THE ISSUE
# (2026-10-16). The authority workstations trust (`dedalo-local-ca.pem`) and
# the issuing authority under it (`dedalo-issuing-ca.pem`, whose key stays on
# the server to sign renewals) both carry
#   nameConstraints = critical, permitted;DNS:<each name>, permitted;IP:<each ip>/32,
#                     excluded;DNS:.<each name>   (exact names — see EXACT NAMES)
# (plus localhost / 127.0.0.1, which every leaf names) and
#   extendedKeyUsage = serverAuth
# (the name types the constraint does not list — e-mail, the subject DN — would
# otherwise stay open: see write_config). A leaked key on the server can then
# mint a certificate only for this install's own names and only for a web
# server — never for a bank, a mail provider, signed mail or signed code. Two tiers, not one, because constraints on a
# TRUST ANCHOR are OPTIONAL in RFC 5280 (§6.1: "implementations are free to
# process or ignore" anchor information) and client support is uneven:
#   - enforced on the anchor: OpenSSL (`openssl verify`, error 47 "permitted
#     subtree violation" — measured by the gate, not assumed), Firefox/NSS
#     (mozilla::pkix), Chromium/Chrome/Edge >= 112 on every platform (Edge's
#     EnforceLocalAnchorConstraintsEnabled policy page: "From Microsoft Edge
#     112, such constraints in certificates loaded from the platform
#     certificate store will now be enforced"; the opt-out was removed in 128);
#   - NOT reliably enforced on the anchor: Apple's system verifier (Safari,
#     curl linked against Secure Transport) — reported ignoring constraints on
#     a Keychain-trusted root (recursecenter/ca-tools README; alexsci.com
#     "name-non-constraint", 2023).
# Constraints on an INTERMEDIATE are mandatory path-validation processing
# (RFC 5280 §6.1.4 (g)), honoured by every verifier above, Apple's included —
# so the key that lives on the server is the issuing CA's, constrained where
# every client checks; the ROOT key is generated in a private staging
# directory, signs the issuing CA once, and is deleted before this script exits.
# Nobody — not this server, not a thief — can sign with the root again. The
# price: adding a name means a NEW authority (re-trusted on each workstation),
# because only the root could certify a wider issuing CA.
#
# EXACT NAMES, NOT SUBTREES. A DNS constraint alone permits the name AND every
# name below it (RFC 5280 §4.2.1.10: "zero or more labels" added on the left),
# so `permitted;DNS:museo.lan` would let a stolen issuing key certify
# `mail.museo.lan`, `nas.museo.lan`, `x.localhost`. Each DNS name is therefore
# also written as `excluded;DNS:.<name>`: a LEADING-DOT dNSName constraint
# matches only names BELOW it, never the name itself, and an excluded match
# overrides a permitted one — so the authority certifies exactly its list.
# The leading dot is outside RFC 5280's dNSName text (it defines it for URIs
# and mail), so every verifier we rely on was READ, not assumed (2026-10-16):
#   - OpenSSL x509/v3_ncons.c nc_dns, and LibreSSL: measured by the gate
#     (tls_local_ca_native A: a sub.<name> and an x.localhost leaf REFUSED,
#     the names themselves accepted);
#   - Firefox/NSS lib/mozpkix/lib/pkixnames.cpp: "a leading '.' is legal and
#     means the same thing as when the '.' is omitted, EXCEPT that a presented
#     identifier equal … to the name constraint is not matched";
#   - Chromium/Chrome/Edge (BoringSSL pki/name_constraints.cc DNSNameMatches):
#     "If dNSName constraint starts with a dot, only subdomains should match";
#     IsPermittedDNSName checks every excluded name first;
#   - Apple trustd trust/trustd/nameconstraints.c (SecDNSNameConstraintsMatch):
#     a leading-dot constraint skips the label check and needs a longer name;
#   - Windows CryptoAPI: no public source; Wine's crypt32 chain.c
#     dns_name_matches (its reimplementation) needs a strictly longer name.
# A verifier that ignored the dot rule would only fall back to the subtree
# behaviour above (never refuse the install's own name), because `.<name>` can
# never equal `<name>`. Hence a name may not lie under another listed name
# (`museo.lan` + `dedalo.museo.lan`): the exclusion would refuse the second —
# normalise_names refuses that list, and so does the installer's validator.
#
# Existing (pre-2026-10-16) single-tier, UNCONSTRAINED authorities keep
# working: `--mode renew` re-issues their leaf from `dedalo-local-ca.key` as
# before. The next `--mode local-ca` rotation replaces them with a constrained
# two-tier one (and the operator re-trusts, as for any rotation).
#
# USAGE
#   deploy/dedalo-tls-rotate.sh --mode local-ca --host dedalo.local [--host 192.168.1.20 …]
#   deploy/dedalo-tls-rotate.sh --mode renew [--force] [--renew-days 30]
#   deploy/dedalo-tls-rotate.sh --mode existing --cert /path/fullchain.pem --key /path/privkey.pem
#
#   --host <name|ipv4>     an address staff type in the browser; repeatable
#                          (--address is the same option). The first one is the
#                          certificate's subject; every one is in the SAN list
#                          and in the authority's permitted names.
#   --dir <path>           certificate directory (default: deploy/certs; REQUIRED
#                          with --reload systemd — the native layout names it)
#   --reload <how>         docker (default: `nginx -s reload` inside the stack),
#                          systemd (`systemctl reload <unit>` of the HOST web
#                          server — never docker), none
#   --unit <name>          the systemd unit with --reload systemd: nginx | apache2 | httpd
#   --compose-file <path>  stack to reload with --reload docker (default: docker-compose.simple.yml)
#   --no-reload            the same as --reload none (the gates and dry runs use this)
#   --renew-days <n>       renew: re-issue when the certificate expires within n days (default 30)
#   --force                renew: re-issue now, whatever the expiry
#   --quiet                no operator epilogue (the installer prints its own)
#   --key-group <group>    the site key root:<group> 0640 instead of root 0600 —
#                          applied on EVERY run (a renewal with nothing to renew
#                          included). For a host web server that loads the
#                          certificate in its unprivileged WORKERS: the native
#                          route's nginx catch-all picks a claimed IP address's
#                          certificate per handshake (ssl_certificate with
#                          variables). REMEMBERED in <dir>/dedalo-key-group, so
#                          a later run WITHOUT the flag (a rotation typed by
#                          hand, a renewal) keeps the access instead of putting
#                          the key back to 0600 and cutting the address off;
#                          delete that file to go back to 0600. Never given
#                          nor remembered: 0600, as always.
#
# EXIT: 0 done (or renew had nothing to do); 1 refused / failed, nothing
# changed; 3 the new certificate is in place but the web server could not be
# reloaded (a renewal timer or cron job must show that as a failure) — with
# --reload docker or systemd. The obligation is remembered: every later run,
# even one with nothing to renew, retries the reload and exits 3 until it works.
#
# WHAT IT DOES NOT DO: it never touches the database password, the engine's
# `/private/.env`, or a Let's Encrypt certificate (that one renews itself and
# its key never enters the build context — it lives in a named volume). The
# procedure for a rotated DB password is in engineering/PRODUCTION.md §13.
#
# Portable to bash 3.2 (macOS docker hosts) and bash 5: no associative arrays,
# and an array that may be empty is expanded as ${a[@]+"${a[@]}"} — bash < 4.4
# treats "${a[@]}" of an empty array as unbound under `set -u`.

set -euo pipefail

MODE='' CERT_IN='' KEY_IN='' QUIET='false' RELOAD='docker' UNIT='' FORCE='false'
RENEW_DAYS='30' CERT_DIR='' COMPOSE_FILE='docker-compose.simple.yml' KEY_GROUP=''
NAMES=()

# Lifetimes. 397 days: the leaf lifetime every current client accepts (Apple's
# limit for publicly-trusted leaves is 398; longer locally-trusted leaves are
# accepted today but are the first thing a platform tightens). The renewal
# timer re-issues it from the SAME authority, so a short leaf costs workstations
# nothing. The authorities live ten years; the issuing CA one day less than its
# root, so it never outlives what certifies it.
LEAF_DAYS=397
ROOT_DAYS=3650
ISSUING_DAYS=3649

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$HERE")"

fail() { printf '\033[31m✖ %s\033[0m\n' "$*" >&2; exit 1; }
say()  { [ "$QUIET" = 'true' ] || printf '%s\n' "$*"; }

# One cleanup for every staging directory this run creates.
CLEANUP=()
cleanup() {
	local path
	for path in ${CLEANUP[@]+"${CLEANUP[@]}"}; do rm -rf "$path"; done
}
trap cleanup EXIT

while [ $# -gt 0 ]; do
	case "$1" in
		--mode) MODE="${2-}"; shift 2 ;;
		--host|--address) NAMES+=("${2-}"); shift 2 ;;
		--cert) CERT_IN="${2-}"; shift 2 ;;
		--key) KEY_IN="${2-}"; shift 2 ;;
		--dir) CERT_DIR="${2-}"; shift 2 ;;
		--compose-file) COMPOSE_FILE="${2-}"; shift 2 ;;
		--reload) RELOAD="${2-}"; shift 2 ;;
		--unit) UNIT="${2-}"; shift 2 ;;
		--no-reload) RELOAD='none'; shift ;;
		--renew-days) RENEW_DAYS="${2-}"; shift 2 ;;
		--force) FORCE='true'; shift ;;
		--quiet) QUIET='true'; shift ;;
		--key-group) KEY_GROUP="${2-}"; shift 2 ;;
		*) fail "unknown argument: $1" ;;
	esac
done

# --- 0. Arguments -----------------------------------------------------------

case "$RELOAD" in
	docker|none) [ -z "$UNIT" ] || fail '--unit goes with --reload systemd only.' ;;
	systemd)
		# An allowlist, not a free string: the renewal timer runs this as root, and
		# the unit name reaches systemctl. Debian/Ubuntu ship apache2, EL httpd.
		case "$UNIT" in
			nginx|apache2|httpd) ;;
			*) fail '--reload systemd needs --unit nginx | apache2 | httpd (the host web server).' ;;
		esac
		[ -n "$CERT_DIR" ] || fail '--reload systemd needs --dir (the native install names its certificate directory).'
		# Checked BEFORE anything changes: without systemctl the reload below
		# would read as "not running" and a renewal would report success while
		# the web server kept serving the old certificate.
		command -v systemctl >/dev/null 2>&1 || fail '--reload systemd needs systemctl (this host has none).'
		;;
	*) fail '--reload is docker | systemd | none.' ;;
esac
[ -n "$CERT_DIR" ] || CERT_DIR="$REPO_ROOT/deploy/certs"

# A group NAME (useradd's default pattern): it reaches chgrp, run as root by
# the renewal timer — never a free string.
KEY_GROUP_PATTERN='^[a-z_][a-z0-9_-]*$'
if [ -n "$KEY_GROUP" ] && ! [[ "$KEY_GROUP" =~ $KEY_GROUP_PATTERN ]]; then
	fail "--key-group takes a group name: $KEY_GROUP"
fi

case "$RENEW_DAYS" in
	''|*[!0-9]*) fail '--renew-days takes a whole number of days.' ;;
esac
[ "$RENEW_DAYS" -lt "$LEAF_DAYS" ] || [ "$MODE" != 'renew' ] || [ "$FORCE" = 'true' ] \
	|| say "Note: --renew-days $RENEW_DAYS is not shorter than the $LEAF_DAYS-day certificate — every run re-issues."

# A dotted quad with every octet 0-255. IPv6 is REFUSED rather than half
# handled: the authority's IP constraint is written per address family, and a
# family the constraint does not list must stay refused (gate: an IPv6 leaf is
# rejected), so supporting it is a deliberate change, not a pattern tweak.
is_ipv4() {
	local value="$1" octet rest
	case "$value" in *[!0-9.]*|.*|*.|*..*) return 1 ;; esac
	rest="$value."
	local count=0
	while [ -n "$rest" ]; do
		octet="${rest%%.*}"
		rest="${rest#*.}"
		[ -n "$octet" ] || return 1
		[ "${#octet}" -le 3 ] || return 1
		[ "$((10#$octet))" -le 255 ] || return 1
		count=$((count + 1))
	done
	[ "$count" -eq 4 ]
}

# A host name: letters, digits, hyphens; labels 1-63, never starting or ending
# with a hyphen; 253 at most. No wildcard — a `*` in a SAN on a constrained
# authority would be a second way to widen it.
DNS_LABEL='[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?'
DNS_NAME="^${DNS_LABEL}(\\.${DNS_LABEL})*\$"
# A last label of digits only is never a host name (RFC 3696 §2): `300.1.1.1`
# is a mistyped address, and accepting it as a NAME would constrain the
# authority to a DNS name nobody can type instead of refusing.
is_dns_name() {
	[ "${#1}" -le 253 ] && [[ "$1" =~ $DNS_NAME ]] || return 1
	case "${1##*.}" in *[!0-9]*) return 0 ;; *) return 1 ;; esac
}

# Normalise and validate the requested names: lower case, deduplicated, in
# the order given (the first is the subject).
normalise_names() {
	local raw name seen out=()
	for raw in ${NAMES[@]+"${NAMES[@]}"}; do
		name="$(printf '%s' "$raw" | tr 'A-Z' 'a-z')"
		[ -n "$name" ] || fail '--host needs a value.'
		case "$name" in
			*:*) fail "IPv6 addresses are not supported for the local CA: $raw (use a name or an IPv4 address)." ;;
		esac
		if ! is_ipv4 "$name" && ! is_dns_name "$name"; then
			fail "Not a host name or IPv4 address: $raw"
		fi
		seen='false'
		local kept
		for kept in ${out[@]+"${out[@]}"}; do [ "$kept" != "$name" ] || seen='true'; done
		[ "$seen" = 'true' ] || out+=("$name")
	done
	# A name under another listed name (localhost included) cannot be served:
	# the authority excludes everything BELOW each DNS name (header, EXACT
	# NAMES), so the leaf would not verify. Refused before anything changes.
	local upper lower
	for upper in ${out[@]+"${out[@]}"} localhost; do
		is_ipv4 "$upper" && continue
		for lower in ${out[@]+"${out[@]}"}; do
			case "$lower" in
				*".$upper") fail "$lower lies under $upper: the local CA certifies each name exactly, never the names below it. Give staff names that are not inside one another." ;;
			esac
		done
	done
	NAMES=(${out[@]+"${out[@]}"})
}

case "$MODE" in
	local-ca)
		[ "${#NAMES[@]}" -gt 0 ] || fail 'local-ca mode needs --host (the name or IP staff type in the browser).'
		command -v openssl >/dev/null 2>&1 || fail 'openssl is required for the local-CA mode.'
		normalise_names
		;;
	renew)
		command -v openssl >/dev/null 2>&1 || fail 'openssl is required to renew.'
		normalise_names
		;;
	existing)
		[ -n "$CERT_IN" ] && [ -n "$KEY_IN" ] || fail 'existing mode needs --cert and --key.'
		[ -f "$CERT_IN" ] || fail "No such file: $CERT_IN"
		[ -f "$KEY_IN" ] || fail "No such file: $KEY_IN"
		;;
	*) fail 'Usage: --mode local-ca --host <name> [--host …] | --mode renew | --mode existing --cert <file> --key <file>' ;;
esac

STAMP="$(date -u '+%Y-%m-%dT%H%M%SZ')"
# The authority workstations trust (its key is deleted at issue; a legacy
# single-tier install still has dedalo-local-ca.key and renews from it).
CA_CRT="$CERT_DIR/dedalo-local-ca.pem"
LEGACY_CA_KEY="$CERT_DIR/dedalo-local-ca.key"
LEGACY_CA_SRL="$CERT_DIR/dedalo-local-ca.srl"
# The issuing authority: its key signs every leaf and every renewal.
ISSUING_KEY="$CERT_DIR/dedalo-issuing-ca.key"
ISSUING_CRT="$CERT_DIR/dedalo-issuing-ca.pem"
ISSUING_SRL="$CERT_DIR/dedalo-issuing-ca.srl"
# The names the authority was constrained to — what a renewal re-issues for.
NAMES_FILE="$CERT_DIR/dedalo-local-ca.names"
SITE_KEY="$CERT_DIR/privkey.pem"
SITE_CRT="$CERT_DIR/fullchain.pem"
# The site key's group, remembered from the run that gave --key-group (USAGE):
# the documented rotation command carries no such flag, and a rotation that
# put the key back to 0600 would leave nginx's workers unable to load it — the
# claimed IP address refused until the next timer run. Validated like the flag.
KEY_GROUP_FILE="$CERT_DIR/dedalo-key-group"
if [ -z "$KEY_GROUP" ] && [ -s "$KEY_GROUP_FILE" ]; then
	KEY_GROUP="$(head -n 1 "$KEY_GROUP_FILE")"
	[[ "$KEY_GROUP" =~ $KEY_GROUP_PATTERN ]] || fail "$KEY_GROUP_FILE does not hold a group name — fix or delete it."
fi

# The DIRECTORY permission is left alone on purpose: the shipped stacks
# bind-mount deploy/certs into the nginx container, and tightening a directory a
# running proxy reads is how a rotation takes a museum's HTTPS down. The KEY
# FILES carry the protection (600, below), which is what matters; a new
# directory is created under the caller's umask. A renewal never creates it:
# no directory means no authority, and that is a refusal, not an empty dir.
if [ "$MODE" != 'renew' ]; then mkdir -p "$CERT_DIR"; fi

# THE RELOAD OBLIGATION OUTLIVES THE RUN. Written before a run replaces the
# served files (unless the caller took the reload on, --reload none), removed
# only once the web server reloaded or was not running. Without it a failed
# reload is forgotten by the NEXT run: the leaf on disk is fresh, a renewal is
# a no-op that exits 0, the failed timer turns green, and the web server keeps
# serving the old leaf from memory until it expires. With it, every run retries
# the reload and exits 3 until it succeeds (gate: tls_local_ca_native D).
RELOAD_PENDING="$CERT_DIR/.dedalo-reload-pending"
mark_reload_pending() {
	[ "$RELOAD" = 'none' ] || : >"$RELOAD_PENDING"
}

# SWEEP STAGING LEFT BY A KILLED RUN. The EXIT trap removes this run's staging
# directory on every exit a shell can see — not on SIGKILL, an OOM kill or a
# power loss. An issue killed between creating the ROOT key and deleting it
# would leave that key in `.dedalo-tls.*` next to the certificates, and the
# root (pathlen 1) can sign a new, UNCONSTRAINED intermediate — which every
# workstation trusting the root would then honour. So every run removes them.
# Only directories older than ten minutes: a younger one may be a concurrent
# run's live staging (an issue takes seconds), and removing it mid-run could
# leave a key and a certificate that do not match (gate: tls_local_ca_native C).
if [ -d "$CERT_DIR" ]; then
	while IFS= read -r stale; do
		[ -n "$stale" ] || continue
		rm -rf "$stale"
		printf 'Removed a staging directory left by an interrupted run: %s\n' "$stale" >&2
	done <<EOF
$(find "$CERT_DIR" -mindepth 1 -maxdepth 1 -type d -name '.dedalo-tls.*' -mmin +10 2>/dev/null)
EOF
fi

# A staging directory INSIDE the certificate directory: same filesystem, so the
# final `mv` is a rename (atomic), and private from its first byte. Sets STAGE
# (not printed: a command substitution is a subshell, and the cleanup list it
# appended to would be lost with it — the directory would outlive the run).
STAGE=''
new_stage() {
	STAGE="$(umask 077 && mktemp -d "$CERT_DIR/.dedalo-tls.XXXXXX")" || fail "Could not create a staging directory in $CERT_DIR."
	CLEANUP+=("$STAGE")
}

# The site key's access: root 0600, or root:<KEY_GROUP> 0640 (--key-group).
# Applied to the STAGED key before it is moved in, so the served file never
# passes through a mode the web server's workers cannot read.
key_access() {
	if [ -n "$KEY_GROUP" ]; then
		chgrp "$KEY_GROUP" "$1" || fail "Could not give the group $KEY_GROUP the key $1."
		chmod 640 "$1"
	else
		chmod 600 "$1"
	fi
}

# Remember the group for the runs that will not repeat the flag (KEY_GROUP_FILE)
# — written only once the key carries it, so a refused run changes nothing.
remember_key_group() {
	if [ -n "$KEY_GROUP" ]; then
		printf '%s\n' "$KEY_GROUP" >"$KEY_GROUP_FILE"
		chmod 644 "$KEY_GROUP_FILE"
	fi
}

# The SAN list: every requested name + localhost + the loopback address.
# Browsers have ignored the legacy CN for years — a name missing from the SAN
# is rejected outright.
san_list() {
	local name out=''
	for name in "$@" localhost 127.0.0.1; do
		case ",$out," in *",DNS:$name,"*|*",IP:$name,"*) continue ;; esac
		if is_ipv4 "$name"; then out="$out${out:+,}IP:$name"; else out="$out${out:+,}DNS:$name"; fi
	done
	printf '%s' "$out"
}

# The authority's permitted subtrees: the same list. localhost and 127.0.0.1
# are ALWAYS present, so the DNS and the IP type are both constrained — a type
# with no permitted entry would be UNCONSTRAINED (RFC 5280 §4.2.1.10), and an
# IPv4 /32 also refuses every IPv6 address (address length mismatch).
constraint_list() {
	local name out='' excluded='' seen=','
	for name in "$@" localhost 127.0.0.1; do
		case "$seen" in *",$name,"*) continue ;; esac
		seen="$seen$name,"
		if is_ipv4 "$name"; then
			out="$out${out:+,}permitted;IP:$name/255.255.255.255"
		else
			out="$out${out:+,}permitted;DNS:$name"
			excluded="$excluded,excluded;DNS:.$name"
		fi
	done
	# The exclusions make each DNS name exact (no name below it — header,
	# EXACT NAMES); IP entries are /32, exact already.
	printf '%s%s' "$out" "$excluded"
}

# BOTH authorities carry `extendedKeyUsage = serverAuth`: name constraints
# cover only the name TYPES they list (DNS and IP here). Every other type —
# rfc822Name (e-mail), directoryName (the subject DN) — stays UNCONSTRAINED
# (RFC 5280 §4.2.1.10), so without an EKU limit a leaked issuing key could
# still mint an S/MIME certificate for any mailbox, or a code-signing one with
# any publisher name, and Windows trusts an imported root for every purpose.
# An EKU on a CA certificate restricts the chain beneath it in Windows
# CryptoAPI, NSS and Chrome's verifier (the documented behaviour of each, not
# measured here) and in OpenSSL for S/MIME (`-purpose smimesign` fails —
# measured by tls_local_ca_native A). OpenSSL's `-purpose codesign` checks the
# leaf only, so code signing is held by the CryptoAPI rule; the gate asserts
# both authorities' EKU is exactly serverAuth. The e-mail type is not closed
# separately: without the emailProtection purpose in the chain, no client
# accepts such a certificate for mail.
#
# One openssl configuration for the whole issue: the three extension profiles.
# The subject always comes from -subj; the [ dn ] section is empty and there is
# no `prompt = no` — with it, LibreSSL (macOS's /usr/bin/openssl) takes the
# subject from the config and IGNORES -subj (measured: every certificate came
# out as the placeholder name).
write_config() {
	local file="$1" san="$2" constraints="$3"
	{
		printf '[ req ]\ndistinguished_name = dn\n[ dn ]\n'
		if [ -n "$constraints" ]; then
			printf '[ v3_root ]\nbasicConstraints = critical,CA:TRUE,pathlen:1\nkeyUsage = critical,keyCertSign,cRLSign\nextendedKeyUsage = serverAuth\nsubjectKeyIdentifier = hash\nnameConstraints = critical,%s\n' "$constraints"
			printf '[ v3_issuing ]\nbasicConstraints = critical,CA:TRUE,pathlen:0\nkeyUsage = critical,keyCertSign,cRLSign\nextendedKeyUsage = serverAuth\nsubjectKeyIdentifier = hash\nauthorityKeyIdentifier = keyid:always\nnameConstraints = critical,%s\n' "$constraints"
		fi
		printf '[ v3_leaf ]\nbasicConstraints = critical,CA:FALSE\nkeyUsage = critical,digitalSignature,keyEncipherment\nextendedKeyUsage = serverAuth\nsubjectKeyIdentifier = hash\nauthorityKeyIdentifier = keyid,issuer\nsubjectAltName = %s\n' "$san"
	} >"$file"
}

# Issue a leaf for NAMES into <stage>/{privkey,leaf}.pem, signed by <ca crt> +
# <ca key>, serial file <srl>.
issue_leaf() {
	local stage="$1" ca_crt="$2" ca_key="$3" srl="$4" config="$5"
	openssl req -new -newkey rsa:2048 -nodes -keyout "$stage/privkey.pem" -out "$stage/leaf.csr" \
		-subj "/CN=${NAMES[0]}" -config "$config" 2>/dev/null \
		|| fail 'Could not create the server key.'
	openssl x509 -req -in "$stage/leaf.csr" -CA "$ca_crt" -CAkey "$ca_key" \
		-CAserial "$srl" -CAcreateserial -out "$stage/leaf.pem" -days "$LEAF_DAYS" -sha256 \
		-extfile "$config" -extensions v3_leaf 2>/dev/null \
		|| fail 'Could not sign the server certificate.'
}

# The chain must verify against the authority workstations trust — the outcome
# check, not a spelling check: with a constrained authority this is what
# refuses a name outside its list, BEFORE anything replaces a working
# certificate. And the key must be the certificate's.
verify_chain() {
	local chain="$1" key="$2" untrusted="$3" args
	args=(verify -purpose sslserver -CAfile "$CA_CRT")
	[ -z "$untrusted" ] || args+=(-untrusted "$untrusted")
	openssl "${args[@]}" "$chain" >/dev/null 2>&1 || return 1
	[ "$(openssl x509 -in "$chain" -noout -pubkey 2>/dev/null)" = "$(openssl pkey -in "$key" -pubout 2>/dev/null)" ]
}

# --- 1. Renew: a new leaf from the SAME authority ---------------------------
# Workstations never re-trust: the authority they trust is untouched. No
# archive — the replaced leaf has no value once its successor verifies, and a
# timer that archived a key a year would accumulate key material for nothing.
renew() {
	local ca_key srl untrusted='' stage config
	[ -s "$CA_CRT" ] || fail "No local CA in $CERT_DIR ($CA_CRT is missing) — there is nothing to renew from. Issue one with --mode local-ca."
	if [ -s "$ISSUING_KEY" ] && [ -s "$ISSUING_CRT" ]; then
		ca_key="$ISSUING_KEY"; srl="$ISSUING_SRL"; untrusted="$ISSUING_CRT"
	elif [ -s "$LEGACY_CA_KEY" ]; then
		# A pre-2026-10-16 single-tier, unconstrained authority: still renewable.
		ca_key="$LEGACY_CA_KEY"; srl="$LEGACY_CA_SRL"
	else
		fail "The local CA's signing key is not in $CERT_DIR — a renewal needs it. Issue a new authority with --mode local-ca."
	fi
	local signer="${untrusted:-$CA_CRT}"

	if [ "$FORCE" != 'true' ] && [ -s "$SITE_CRT" ] \
		&& openssl x509 -in "$SITE_CRT" -noout -checkend "$((RENEW_DAYS * 86400))" >/dev/null 2>&1; then
		# Nothing to re-issue — the key's access is still this run's to keep
		# (--key-group: an install that claims an IP address after the issue).
		if [ -n "$KEY_GROUP" ] && [ -f "$SITE_KEY" ]; then key_access "$SITE_KEY"; remember_key_group; fi
		if [ "$RELOAD" != 'none' ] && [ -f "$RELOAD_PENDING" ]; then
			# Nothing to re-issue, but an earlier run put this certificate on disk
			# and could not reload: the web server may still serve the old one.
			say "The certificate in $SITE_CRT is current, but an earlier run could not reload the web server — reloading now."
			return 0
		fi
		say "The certificate in $SITE_CRT is valid for more than $RENEW_DAYS days — nothing to do."
		exit 0
	fi

	# The authority must outlive the leaf it signs; past that it cannot renew,
	# only be replaced — said loudly, not papered over with a shorter leaf.
	for authority in "$CA_CRT" "$signer"; do
		openssl x509 -in "$authority" -noout -checkend "$((LEAF_DAYS * 86400))" >/dev/null 2>&1 \
			|| fail "The local CA ($authority) expires within $LEAF_DAYS days and cannot sign a full-length certificate. Rotate it: --mode local-ca (every workstation then trusts the new one)."
	done

	if [ "${#NAMES[@]}" -eq 0 ]; then
		[ -s "$NAMES_FILE" ] || fail "No names to renew for: pass --host (this authority predates $NAMES_FILE)."
		local line
		while IFS= read -r line || [ -n "$line" ]; do
			[ -z "$line" ] || NAMES+=("$line")
		done <"$NAMES_FILE"
		normalise_names
		[ "${#NAMES[@]}" -gt 0 ] || fail "$NAMES_FILE lists no names."
	fi

	new_stage
	stage="$STAGE"
	config="$stage/openssl.cnf"
	write_config "$config" "$(san_list "${NAMES[@]}")" ''
	# The serial file advances in staging too: a refused renewal leaves the
	# directory byte-identical (gate: tls_local_ca_native C).
	if [ -f "$srl" ]; then cp -p "$srl" "$stage/serial.srl"; fi
	(umask 077 && issue_leaf "$stage" "$signer" "$ca_key" "$stage/serial.srl" "$config")
	if [ -n "$untrusted" ]; then cat "$stage/leaf.pem" "$untrusted" >"$stage/fullchain.pem"; else cp "$stage/leaf.pem" "$stage/fullchain.pem"; fi
	verify_chain "$stage/fullchain.pem" "$stage/privkey.pem" "$untrusted" \
		|| fail "The renewed certificate does not verify against $CA_CRT — a name outside the authority's list? (${NAMES[*]}). Nothing was replaced. Adding a name needs a new authority: --mode local-ca."
	chmod 600 "$stage/serial.srl" "$ca_key"
	key_access "$stage/privkey.pem"
	chmod 644 "$stage/fullchain.pem"
	mark_reload_pending
	mv -f "$stage/serial.srl" "$srl"
	mv -f "$stage/privkey.pem" "$SITE_KEY"
	mv -f "$stage/fullchain.pem" "$SITE_CRT"
	say "Renewed $SITE_CRT for: ${NAMES[*]} (same authority — nothing to do on the workstations)."
}

# --- 2. Issue a new authority + leaf, or install the institution's files -----
issue() {
	local stage config root_key
	new_stage
	stage="$STAGE"
	config="$stage/openssl.cnf"
	root_key="$stage/root.key"
	write_config "$config" "$(san_list "${NAMES[@]}")" "$(constraint_list "${NAMES[@]}")"
	# THE SUBJECT CARRIES THE ISSUE STAMP. Two authorities both called "Dedalo
	# local CA" are indistinguishable in a Windows or macOS trust store, and an
	# operator rotating away from a compromised key MUST be able to tell which
	# entry to delete.
	(
		umask 077
		openssl req -x509 -new -newkey rsa:4096 -nodes -sha256 -days "$ROOT_DAYS" \
			-keyout "$root_key" -out "$stage/dedalo-local-ca.pem" \
			-subj "/CN=Dedalo local CA $STAMP" -config "$config" -extensions v3_root 2>/dev/null \
			|| fail 'Could not create the local CA.'
		openssl req -new -newkey rsa:4096 -nodes -keyout "$stage/dedalo-issuing-ca.key" \
			-out "$stage/issuing.csr" -subj "/CN=Dedalo issuing CA $STAMP" -config "$config" 2>/dev/null \
			|| fail 'Could not create the issuing CA key.'
		openssl x509 -req -in "$stage/issuing.csr" -CA "$stage/dedalo-local-ca.pem" -CAkey "$root_key" \
			-CAserial "$stage/root.srl" -CAcreateserial -out "$stage/dedalo-issuing-ca.pem" \
			-days "$ISSUING_DAYS" -sha256 -extfile "$config" -extensions v3_issuing 2>/dev/null \
			|| fail 'Could not sign the issuing CA.'
		# The root key has done its one job. Deleted now, not at exit: nothing
		# after this line may sign with it.
		rm -f "$root_key" "$stage/root.srl"
		issue_leaf "$stage" "$stage/dedalo-issuing-ca.pem" "$stage/dedalo-issuing-ca.key" \
			"$stage/dedalo-issuing-ca.srl" "$config"
	)
	[ ! -e "$root_key" ] || fail 'The root key was not deleted.'
	key_access "$stage/privkey.pem"
	cat "$stage/leaf.pem" "$stage/dedalo-issuing-ca.pem" >"$stage/fullchain.pem"
	printf '%s\n' "${NAMES[@]}" >"$stage/dedalo-local-ca.names"
	(
		CA_CRT="$stage/dedalo-local-ca.pem"
		verify_chain "$stage/fullchain.pem" "$stage/privkey.pem" "$stage/dedalo-issuing-ca.pem"
	) || fail 'The new certificate does not verify against the new authority — nothing was replaced.'
	ISSUED="$stage"
}

if [ "$MODE" = 'renew' ]; then
	renew
else
	ISSUED=''
	STAGED=''
	if [ "$MODE" = 'local-ca' ]; then
		# Everything is made and VERIFIED in staging before the working
		# certificate is touched: a failed issue leaves the install as it was.
		issue
	else
		# THE INPUT MAY BE THE DESTINATION. Re-running with
		# `--cert deploy/certs/fullchain.pem` is a natural thing to do, and the
		# archive step below MOVES the destination out of the way — which would
		# delete the source before it is read. Stage the inputs first.
		STAGED="$(mktemp -d "${TMPDIR:-/tmp}/dedalo-tls-rotate.XXXXXX")"
		CLEANUP+=("$STAGED")
		cp "$CERT_IN" "$STAGED/fullchain.pem" || fail "Could not read $CERT_IN."
		cp "$KEY_IN" "$STAGED/privkey.pem" || fail "Could not read $KEY_IN."
	fi

	# --- Archive whatever is there -----------------------------------------
	# NEVER overwrite key material in place: a rotation must leave the operator
	# able to put the working certificate back, and the OLD CA CERTIFICATE is
	# what identifies the entry to delete from every trust store. The archive
	# stays inside the certificate directory — gitignored, outside the build
	# context and outside every release archive.
	mark_reload_pending
	ARCHIVE=''
	for existing in "$LEGACY_CA_KEY" "$CA_CRT" "$LEGACY_CA_SRL" "$ISSUING_KEY" "$ISSUING_CRT" \
		"$ISSUING_SRL" "$NAMES_FILE" "$SITE_KEY" "$SITE_CRT"; do
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

	if [ "$MODE" = 'local-ca' ]; then
		for name in dedalo-local-ca.pem dedalo-issuing-ca.key dedalo-issuing-ca.pem dedalo-issuing-ca.srl \
			dedalo-local-ca.names privkey.pem fullchain.pem; do
			mv "$ISSUED/$name" "$CERT_DIR/$name"
		done
	else
		# Copied in rather than referenced, so a later start cannot break on a
		# path that moved.
		cp "$STAGED/fullchain.pem" "$SITE_CRT" || fail "Could not copy $CERT_IN to $SITE_CRT."
		(umask 077 && cp "$STAGED/privkey.pem" "$SITE_KEY") || fail "Could not copy $KEY_IN to $SITE_KEY."
	fi
fi

# Keys 600 (the site key 640 to --key-group), certificates and the names list 644 — the CA certificate has to be
# copied to every workstation, so a 600 there would be a support call, not
# security. `[ -f x ] && chmod …` as a bare statement returns non-zero when the
# file is absent, and `set -e` would exit on it — hence the if-forms.
key_access "$SITE_KEY"
remember_key_group
chmod 644 "$SITE_CRT"
for secret in "$ISSUING_KEY" "$LEGACY_CA_KEY" "$ISSUING_SRL" "$LEGACY_CA_SRL"; do
	if [ -f "$secret" ]; then chmod 600 "$secret"; fi
done
for public in "$CA_CRT" "$ISSUING_CRT" "$NAMES_FILE"; do
	if [ -f "$public" ]; then chmod 644 "$public"; fi
done

# --- 3. Reload the web server ----------------------------------------------
# A web server reads the certificate once, at start and on reload.
RELOAD_FAILED='false'
case "$RELOAD" in
	docker)
		# Only the shipped SIMPLE stack also reloads every 6 hours on its own; the
		# full stack keeps serving the old certificate until a reload, and an
		# operator rotating a COMPROMISED key needs it now either way. So a failed
		# reload is exit 3, as on the native route: a renewal run from cron (where
		# `docker` is often not on PATH) must not report success while the renewed
		# leaf sits on disk unserved. --env-file: the stack's
		# TLS decision lives in .dedalo.env, and a compose command without it
		# resolves the plain-HTTP defaults (P1-6/OPS-02).
		ENV_FILE_ARGS=()
		[ ! -f "$REPO_ROOT/.dedalo.env" ] || ENV_FILE_ARGS=(--env-file "$REPO_ROOT/.dedalo.env")
		if docker compose -f "$REPO_ROOT/$COMPOSE_FILE" ${ENV_FILE_ARGS[@]+"${ENV_FILE_ARGS[@]}"} exec -T nginx nginx -s reload >/dev/null 2>&1; then
			say 'nginx reloaded — the new certificate is being served.'
			rm -f "$RELOAD_PENDING"
		else
			RELOAD_FAILED='true'
			printf '\033[31m✖ The certificate is in place but nginx could not be reloaded from here (is the stack up, is docker on PATH?). Run, from %s:\033[0m\n' "$REPO_ROOT" >&2
			printf '    docker compose -f %s --env-file .dedalo.env exec nginx nginx -s reload\n' "$COMPOSE_FILE" >&2
		fi
		;;
	systemd)
		# The HOST web server (native route) — never docker. A server that is not
		# running reads the certificate when it starts (an install issues the
		# certificate before it configures the site): nothing to reload. A running
		# one that refuses the reload is a failure the timer must show.
		if ! systemctl is-active --quiet "$UNIT" 2>/dev/null; then
			say "$UNIT is not running — it reads the new certificate when it starts."
			rm -f "$RELOAD_PENDING"
		elif systemctl reload "$UNIT"; then
			say "$UNIT reloaded — the new certificate is being served."
			rm -f "$RELOAD_PENDING"
		else
			RELOAD_FAILED='true'
			printf '\033[31m✖ The certificate is in place but %s could not be reloaded. Run: systemctl reload %s\033[0m\n' "$UNIT" "$UNIT" >&2
		fi
		;;
	none) ;;
esac

# --- 4. Tell the operator what only they can do ----------------------------
if [ "$QUIET" != 'true' ] && [ "$MODE" != 'renew' ]; then
	echo
	if [ "$MODE" = 'local-ca' ]; then
		printf 'New local CA: %s\n' "$CA_CRT"
		openssl x509 -in "$CA_CRT" -noout -subject -fingerprint -sha256 2>/dev/null || true
		printf 'It can only certify exactly: %s (and localhost) — no name below them\n' "${NAMES[*]}"
		echo
		echo 'On EVERY computer that uses Dédalo, in this order:'
		echo '  1. install the NEW CA file above (Windows: double-click → Install'
		echo '     Certificate → Local Machine → Trusted Root Certification Authorities;'
		echo '     macOS: Keychain Access → System → Always Trust; Debian/Ubuntu: copy'
		echo '     it to /usr/local/share/ca-certificates/dedalo-local-ca.crt, then run'
		echo '     update-ca-certificates; Fedora/RHEL: copy it to'
		echo '     /etc/pki/ca-trust/source/anchors/, then run update-ca-trust;'
		echo '     Firefox keeps its own store: Settings → Privacy & Security →'
		echo '     Certificates → View Certificates → Authorities → Import);'
		echo '  2. DELETE any previous "Dedalo local CA" entry. Until you do, a'
		echo '     certificate signed with the old key is still trusted by that machine —'
		echo '     which is the whole reason for rotating.'
		printf 'Check from any computer: curl --cacert dedalo-local-ca.pem https://%s/\n' "${NAMES[0]}"
	else
		echo "Installed $SITE_CRT + $SITE_KEY."
		echo 'Revoke the previous certificate with the authority that issued it — a key'
		echo 'that travelled inside an image is compromised whether or not it is in use.'
	fi
	echo
fi

[ "$RELOAD_FAILED" = 'false' ] || exit 3
