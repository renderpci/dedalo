#!/bin/sh
# Dédalo — THE NGINX MEDIA RULES, BROUGHT INTO ROOT'S CONFIGURATION SAFELY.
#
# WHY IT EXISTS (terminal installer phase 4, 2026-10-12). The engine GENERATES
# its media gate (src/core/media/protection.ts) into MEDIA_PATH:
#     dedalo_media_protection.nginx.conf       (server scope)
#     dedalo_media_protection_map.nginx.conf   (http scope)
# MEDIA_PATH is the instance user's. nginx's master runs as ROOT and parses
# every include — so including those files in place lets the instance user
# write root-parsed configuration: a `log_format` + `access_log /etc/…` turns
# into a root file write, a `server { … }` takes over another site's name, and a
# map include is host-wide. The web-facing engine must never hold that.
#
# So nginx includes ROOT-OWNED COPIES under /etc/nginx/dedalo/<instance>/, and
# this script makes them: it reads each generated file into a root-only
# temporary copy FIRST (a file swapped after a check cannot slip through), then
# accepts it only when EVERY line is one of the fixed forms the generator
# writes — location blocks, deny/return 404, the publication-marker `if (-f …)`
# tests on THIS instance's marker store, `set $dd_pass`, add_header, mp4, and in
# the map file exactly the three Dédalo maps with the auth-key sanitizer pinned
# byte for byte (a looser one could make `$dedalo_auth_key` a path and open
# another instance's media). Anything else — include, *_log, log_format, server,
# alias, root, proxy_*, an unbalanced quote — refuses the WHOLE copy, nothing
# installed. The map's values may not contain `/` (no value can become a path).
#
# Usage:
#   dedalo-media-rules.sh --source <MEDIA_PATH> --dest /etc/nginx/dedalo/<i>
#       [--reload <nginx binary> <service>]
#
# --reload (the operator's refresh after the engine regenerated its rules, e.g.
# a media access mode change): after the copy, `<nginx> -t`; a failing test puts
# the previous copies back and exits 1; a passing one reloads <service> (which
# applies EVERY pending change of nginx's configuration, not only these files).
# Without --reload (the installer's host_web_site) the caller tests and reloads.
#
# Exit: 0 copied (and reloaded); 1 refused or failed — nothing half-installed;
# 2 usage.
#
# Runs as ROOT from the root-owned /opt/dedalo/instances/<i>/bin (F2). POSIX sh
# + grep -E (the gate drives it on the developer's machine too).
set -u

SOURCE=""
DEST=""
NGINX=""
SERVICE=""
while [ $# -gt 0 ]; do
	case "$1" in
		--source) SOURCE="$2"; shift 2 ;;
		--dest) DEST="$2"; shift 2 ;;
		--reload) NGINX="$2"; SERVICE="$3"; shift 3 ;;
		*) echo "dedalo-media-rules: unknown argument $1" >&2; exit 2 ;;
	esac
done
[ -n "$SOURCE" ] && [ -n "$DEST" ] || { echo "dedalo-media-rules: --source and --dest are required" >&2; exit 2; }

refuse() {
	echo "dedalo-media-rules: REFUSED — $*; nothing was installed" >&2
	exit 1
}

case "$SOURCE" in
	/*) ;;
	*) refuse "--source must be an absolute path" ;;
esac
case "$SOURCE" in
	*[!A-Za-z0-9/._-]*) refuse "--source '$SOURCE' holds characters outside [A-Za-z0-9/._-]" ;;
esac

# The source root as a literal inside an ERE (only `.` needs escaping, given the charset above).
ROOT_RE=$(printf '%s' "${SOURCE%/}" | sed 's/\./\\./g')

SERVER_FILE="dedalo_media_protection.nginx.conf"
MAP_FILE="dedalo_media_protection_map.nginx.conf"
SERVER_COPY="media_protection.conf"
MAP_COPY="media_protection_map.conf"

# A quoted nginx string: no bare quote, a backslash escapes one character.
Q='"([^"\\]|\\.)*"'
# A quoted map value: no slash (never a path), no backslash.
V='"[^"/\\]*"'
# A bare token: no whitespace, quote, brace or semicolon.
T='[^"[:space:]{};]+'
# An ERE-escaped dollar: nginx variable names in the patterns below are spelled
# "${DL}name" — never a bare dollar-name, which would read as a shell expansion.
DL='\$'
# A marker path under THIS instance's store: literal chars and ${var}/$var.
P="${ROOT_RE}/\\.publication/(auth|pub)/([A-Za-z0-9_.-]|\\\$\\{?[a-z_]+\\}?)+"

server_lines() {
	grep -Evx \
		-e '' \
		-e '#.*' \
		-e '\}' \
		-e "location (\\^~ |~ |~\\* |= )?($Q|$T) \\{" \
		-e "location \\^~ $T \\{ deny all; return 404; \\}" \
		-e 'deny all;' \
		-e 'return 404;' \
		-e "set ${DL}dd_pass [01];" \
		-e "if \\(!?-f $P\\)[[:space:]]+\\{ (set ${DL}dd_pass 1|return 404); \\}" \
		-e "if \\(${DL}dd_pass = 0\\) \\{ return 404; \\}" \
		-e "add_header [A-Za-z][A-Za-z-]* ($Q|\\\$[a-z_]+) always;" \
		-e 'mp4;([[:space:]]+#.*)?'
}

map_lines() {
	grep -Evx \
		-e '' \
		-e '#.*' \
		-e '\}' \
		-e "map ${DL}cookie_dedalo_media_auth ${DL}dedalo_auth_key \\{" \
		-e "map ${DL}uri ${DL}dedalo_svg_disposition \\{" \
		-e "map ${DL}uri ${DL}dedalo_svg_csp \\{" \
		-e "\"~\\^\\(\\?<h>\\[a-f0-9\\]\\{128\\}\\)${DL}\"[[:space:]]+${DL}h;" \
		-e "\"~([^\"\\\\]|\\\\.)*\"[[:space:]]+$V;" \
		-e "default[[:space:]]+$V;"
}

# validate <copy> <server|map> <source> — every line one of the fixed forms (trimmed).
validate() {
	trimmed=$(sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' "$1")
	if [ "$2" = server ]; then
		bad=$(printf '%s\n' "$trimmed" | server_lines | head -n 3)
	else
		bad=$(printf '%s\n' "$trimmed" | map_lines | head -n 3)
		# The auth-key sanitizer is the ONLY line that may hand out a capture.
		count=$(printf '%s\n' "$trimmed" | grep -c "${DL}h;\$")
		[ "$count" = 1 ] || bad="the auth-key map must hand out exactly one capture (found $count)"
	fi
	[ -z "$bad" ] || refuse "$3 is not a Dédalo media rule file — first offending line(s): $bad"
}

umask 077
WORK=$(mktemp -d "${TMPDIR:-/tmp}/dedalo-media-rules.XXXXXX") || refuse "no temporary directory"
trap 'rm -rf "$WORK"' EXIT

# take <generated name> <copy name> <kind> — read once into WORK, then validate the copy.
take() {
	src="$SOURCE/$1"
	[ -L "$src" ] && refuse "$src is a symbolic link"
	[ -f "$src" ] || refuse "$src is missing or not a regular file (has the engine booted with the media gate on?)"
	cat -- "$src" > "$WORK/$2" || refuse "cannot read $src"
	[ -L "$src" ] && refuse "$src became a symbolic link while it was read"
	validate "$WORK/$2" "$3" "$src"
}

take "$SERVER_FILE" "$SERVER_COPY" server
take "$MAP_FILE" "$MAP_COPY" map

[ -L "$DEST" ] && refuse "$DEST is a symbolic link"
mkdir -p "$DEST" || refuse "cannot create $DEST"
chmod 0755 "$DEST"

# Keep the previous copies (a failed --reload test puts them back).
for name in "$SERVER_COPY" "$MAP_COPY"; do
	if [ -f "$DEST/$name" ]; then cp -p "$DEST/$name" "$WORK/$name.previous"; fi
done

install_copy() { # install_copy <name> — atomic: write beside, then rename
	chmod 0644 "$WORK/$1"
	cp "$WORK/$1" "$DEST/.$1.new" && mv -f "$DEST/.$1.new" "$DEST/$1"
}
install_copy "$SERVER_COPY" || refuse "cannot install $DEST/$SERVER_COPY"
install_copy "$MAP_COPY" || refuse "cannot install $DEST/$MAP_COPY"
echo "dedalo-media-rules: $DEST/{$SERVER_COPY,$MAP_COPY} copied from $SOURCE (validated)"

[ -n "$NGINX" ] || exit 0

if ! "$NGINX" -t; then
	for name in "$SERVER_COPY" "$MAP_COPY"; do
		if [ -f "$WORK/$name.previous" ]; then
			cp -p "$WORK/$name.previous" "$DEST/$name"
		else
			rm -f "$DEST/$name"
		fi
	done
	echo "dedalo-media-rules: the nginx configuration test FAILED — the previous copies are back; nothing reloaded" >&2
	exit 1
fi
systemctl reload "$SERVICE" || { echo "dedalo-media-rules: reload of $SERVICE failed" >&2; exit 1; }
echo "dedalo-media-rules: $SERVICE reloaded"
