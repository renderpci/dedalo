#!/bin/sh
# Dédalo backup set — STORES 1 AND 2: a PostgreSQL dump that has been READ BACK
# before it is allowed to look like a backup.
#
# WHY IT EXISTS (P0-13, 2026-08-30). Two defects, one consequence.
#
# 1. THE UNIT NAMED KEYS THE INSTALLER DOES NOT WRITE. It read $DB_PASSWORD,
#    $DB_HOST, $DB_USER, $DB_NAME. Those are the TS-native spellings; the install
#    wizard writes the PHP-catalog ones — DEDALO_PASSWORD_CONN, DEDALO_HOSTNAME_CONN,
#    DEDALO_USERNAME_CONN, DEDALO_DATABASE_CONN (src/core/install/config_persist.ts,
#    which says so: "PHP key names are used so an operator migrating from PHP can
#    read them"). Both spellings are legitimate — src/config/env.ts resolves the PHP
#    name as a FALLBACK for the TS-native one — so this script resolves each key
#    exactly the way the engine's readEnv does: the TS-native name first, then its
#    PHP alias. On the wizard's own .env the old unit expanded four empty strings and
#    dumped as the wrong role, on the wrong host, into a file named `.`.
#
# 2. THE ARTIFACT WAS NEVER VERIFIED. `pg_dump > file` that dies at 60% leaves a
#    non-empty, truncated file that the maintenance panel lists, that
#    newestBackupMtimeMs() counts (src/core/area_maintenance/backup.ts), and that
#    satisfies backupFreshness() — the gate that turns "no recent backup" into a
#    REFUSAL to update the code. So the operator is told "ready to update" BECAUSE
#    a broken dump is fresh, and swaps the whole tree believing there is a way back.
#
# WHAT THIS DOES ABOUT IT, in order:
#
#   a. dumps to `<final name>.part`. Nothing under `*.part` matches the `*.backup`
#      suffix newestBackupMtimeMs scans, so a dump that is STILL RUNNING — or that
#      died with the machine — can never be the freshest "backup" on disk. That
#      corner is otherwise open by construction: a running dump always has the
#      newest mtime.
#   b. verifies the artifact by READING IT BACK: `pg_restore --list` (the archive
#      header and table of contents parse) and then a full `pg_restore --file
#      /dev/null` (every data block is decompressed to EOF). The listing alone is
#      NOT enough and this is the whole point: the TOC of a custom-format archive is
#      written near the FRONT, so a dump truncated during the data stream still
#      lists perfectly. Only reading it through catches the truncation.
#   c. renames into place only then. The rename is atomic within the directory, so
#      an artifact under the real name has always been read back.
#   d. removes the .part on any failure, and exits non-zero.
#
# This makes the nightly artifact a VERIFIED RESTORE POINT in the only sense a
# machine can check on its own: the bytes are a complete, readable archive.
# It does not prove the archive restores into a working catalogue — nothing but a
# real restore does. engineering/PRODUCTION.md §6 says to test one quarterly, and
# that instruction stands untouched by anything here.
#
# Usage (the nightly unit's ExecStart, and the same thing by hand):
#
#     dedalo-db-backup.sh --dir <directory> [--dir-key <KEY>] --label <label> \
#         --db-key <KEY> --host-key <KEY> --port-key <KEY> \
#         --user-key <KEY> --password-key <KEY> [--socket-key <KEY>] \
#         [--db <name>] [--pg-dump <bin>] [--pg-restore <bin>]
#
# The connection is given as the NAMES OF THE ENV KEYS to read, not as values.
# That is deliberate: the unit then reads as the mapping it is (store 1 uses the
# main DB keys, store 2 the DEDALO_RAG_DB_* ones), no secret is ever on a command
# line or in a systemd argv, and there is exactly one place — resolve_key below —
# that knows about the TS-native/PHP-alias pair. `--db` overrides the resolved
# database name for a caller that has one but no key.
#
# Exit 0 only when a verified artifact exists under its final name.
set -u

DIR=''
DIR_KEY=''
LABEL='timer'
DB_KEY=''
HOST_KEY=''
PORT_KEY=''
USER_KEY=''
PASSWORD_KEY=''
SOCKET_KEY=''
DB_OVERRIDE=''
PG_DUMP='pg_dump'
PG_RESTORE='pg_restore'

fail() {
	echo "dedalo-db-backup: $*" >&2
	exit 1
}

while [ "$#" -gt 0 ]; do
	case "$1" in
	--dir) DIR=${2:-}; shift 2 ;;
	--dir-key) DIR_KEY=${2:-}; shift 2 ;;
	--label) LABEL=${2:-}; shift 2 ;;
	--db-key) DB_KEY=${2:-}; shift 2 ;;
	--host-key) HOST_KEY=${2:-}; shift 2 ;;
	--port-key) PORT_KEY=${2:-}; shift 2 ;;
	--user-key) USER_KEY=${2:-}; shift 2 ;;
	--password-key) PASSWORD_KEY=${2:-}; shift 2 ;;
	--socket-key) SOCKET_KEY=${2:-}; shift 2 ;;
	--db) DB_OVERRIDE=${2:-}; shift 2 ;;
	--pg-dump) PG_DUMP=${2:-}; shift 2 ;;
	--pg-restore) PG_RESTORE=${2:-}; shift 2 ;;
	*) fail "unknown argument '$1'" ;;
	esac
done

# THE ALIAS TABLE — the TS-native key and the PHP-catalog key the install wizard
# actually writes. It is the subset of PHP_KEY_ALIASES (src/config/env.ts) that a
# backup needs, in the same direction and with the same precedence: the TS-native
# name WINS, the PHP name is the fallback. Held equal to env.ts by
# test/unit/operator_commands_tripwire.test.ts, so the two cannot drift.
# ALIAS <ts-native> <php-catalog>
alias_of() {
	case "$1" in
	DB_NAME) echo DEDALO_DATABASE_CONN ;;
	DB_HOST) echo DEDALO_HOSTNAME_CONN ;;
	DB_PORT) echo DEDALO_DB_PORT_CONN ;;
	DB_USER) echo DEDALO_USERNAME_CONN ;;
	DB_PASSWORD) echo DEDALO_PASSWORD_CONN ;;
	# Store 2's database name has a PHP spelling too, and readEnv honours it — so
	# this table covers every key the unit passes, not only the ones the wizard
	# writes. A .env carried over from the PHP engine resolves here exactly as it
	# does in the engine.
	DEDALO_RAG_DB_NAME) echo DEDALO_RAG_DB_DATABASE_CONN ;;
	*) echo '' ;;
	esac
}

# The value of one config key with the engine's own precedence. `eval` on a name
# that has been checked to be a plain identifier is the only way a POSIX shell can
# read a variable whose NAME is data.
value_of() {
	name=$1
	case "$name" in
	'' | *[!A-Za-z0-9_]*) fail "'$name' is not a config key name" ;;
	esac
	eval "printf '%s' \"\${$name:-}\""
}

resolve_key() {
	key=$1
	[ -n "$key" ] || return 0
	value=$(value_of "$key")
	if [ -z "$value" ]; then
		alias_name=$(alias_of "$key")
		[ -n "$alias_name" ] && value=$(value_of "$alias_name")
	fi
	printf '%s' "$value"
}

# DEDALO_BACKUP_DIR moves the dumps (src/core/area_maintenance/backup.ts
# getBackupDir: the key first, else <privateDir>/backups/db). The nightly job MUST
# follow it: the maintenance panel lists that directory, and the code updater's
# backupFreshness() scans it — a nightly dump written anywhere else is a backup the
# engine cannot see, which is the same as not having one.
if [ -n "$DIR_KEY" ]; then
	dir_value=$(value_of "$DIR_KEY")
	[ -n "$dir_value" ] && DIR=$dir_value
fi

[ -n "$DIR" ] || fail "--dir is required"

DB=$DB_OVERRIDE
[ -n "$DB" ] || DB=$(resolve_key "$DB_KEY")
# Store 2's database name legitimately has no value: DEDALO_RAG_DB_NAME unset means
# "the engine's default vector database". A backup may not invent a name — dumping
# a database nobody named is either a failure or, worse, a dump of the wrong one.
[ -n "$DB" ] || fail "no database name: neither --db nor the key '$DB_KEY' (nor its PHP alias) is set. Set it in ../private/.env, or drop this store's ExecStart line if the subsystem is not installed."

HOST=$(resolve_key "$HOST_KEY")
PORT=$(resolve_key "$PORT_KEY")
USER=$(resolve_key "$USER_KEY")
SOCKET=$(resolve_key "$SOCKET_KEY")
# A socket directory outranks host/port, which is the precedence the engine applies
# WHERE IT HONOURS ONE — src/ai/rag/vector_store.ts, for DEDALO_RAG_DB_SOCKET_CONN
# (store 2). The MATRIX connection has no such key in the TS engine: the wizard
# writes DEDALO_SOCKET_CONN but nothing reads it, so store 1 passes no --socket-key
# and connects exactly the way the engine does. pg_dump takes a directory in -h
# exactly as libpq does.
[ -n "$SOCKET" ] && HOST=$SOCKET
[ -n "$PORT" ] || PORT=5432

# The client must not be OLDER than the server (an older pg_dump refuses a newer
# server outright). DEDALO_PG_BIN_PATH is the key the engine's own resolvePgDump
# honours for exactly this; a bare binary name is resolved through it when set.
resolve_bin() {
	bin=$1
	case "$bin" in
	/*) printf '%s' "$bin"; return ;;
	esac
	if [ -n "${DEDALO_PG_BIN_PATH:-}" ]; then
		candidate="${DEDALO_PG_BIN_PATH%/}/$bin"
		if [ -x "$candidate" ]; then
			printf '%s' "$candidate"
			return
		fi
	fi
	printf '%s' "$bin"
}
PG_DUMP=$(resolve_bin "$PG_DUMP")
PG_RESTORE=$(resolve_bin "$PG_RESTORE")

command -v "$PG_DUMP" >/dev/null 2>&1 || fail "'$PG_DUMP' is not installed"
command -v "$PG_RESTORE" >/dev/null 2>&1 ||
	fail "'$PG_RESTORE' is not installed — it is what reads the dump back, and an unverified dump is not a backup"

mkdir -p "$DIR" || fail "cannot create the backup directory '$DIR'"
# The dump is a complete, unprotected copy of the catalogue (DEDALO_BACKUP_DIR's
# own documentation says so). 0700 on the directory is the least this can do about
# it; the file below is created 0600 by the umask this sets.
chmod 0700 "$DIR" 2>/dev/null || true
umask 077

# Remains of a run the machine did not survive. Only `*.part` — never anything
# under the final suffix, and never anything this script did not name. Retention of
# real dumps is deliberately NOT this script's business: the backup directory also
# holds artifacts an operator (and, in this repo, a frozen oracle snapshot) put
# there, and a backup job that deletes files is a backup job that can delete the
# wrong one.
find "$DIR" -maxdepth 1 -name '*.custom.backup.part' -mtime +1 -exec rm -f {} \; 2>/dev/null

STAMP=$(date '+%Y-%m-%d_%H%M%S')
# The naming the maintenance widget uses (src/core/area_maintenance/backup.ts):
# <Y-m-d_His>.<db>.postgresql_<label>.custom.backup — so the panel's list and the
# nightly job's output are one series, sorted by name as they are by time.
FINAL="$DIR/$STAMP.$DB.postgresql_$LABEL.custom.backup"
PART="$FINAL.part"

echo "dedalo-db-backup: dumping '$DB' from '${HOST:-<local socket>}:$PORT' as '${USER:-<current user>}' -> $FINAL"

# PGPASSWORD is EXPORTED, never passed as an argument: a command line is world
# readable in /proc on Linux, so a password on the argv of a nightly job is a
# password disclosed to every local account, every night.
PGPASSWORD=$(resolve_key "$PASSWORD_KEY")
export PGPASSWORD

set -- --format=custom --blobs --file="$PART"
[ -n "$HOST" ] && set -- "$@" --host="$HOST"
[ -n "$PORT" ] && set -- "$@" --port="$PORT"
[ -n "$USER" ] && set -- "$@" --username="$USER"

# NOT `if ! "$PG_DUMP" …`: inside such a branch `$?` is the status of the `!`
# itself (always 1), so the message would report a number pg_dump never returned.
"$PG_DUMP" "$@" "$DB"
code=$?
if [ "$code" -ne 0 ]; then
	rm -f "$PART"
	fail "pg_dump exited $code — no artifact was left behind (a half dump under a backup's name is worse than no backup)"
fi

if [ ! -s "$PART" ]; then
	rm -f "$PART"
	fail "pg_dump exited 0 but produced an empty file"
fi

# READ IT BACK. --list parses the header and the table of contents; the full read
# decompresses every data block to EOF, which is the only one of the two that sees
# a truncated data stream (the TOC sits near the front of a custom-format archive).
if ! "$PG_RESTORE" --list "$PART" > /dev/null; then
	rm -f "$PART"
	fail "the dump's table of contents does not parse — the artifact is NOT a restore point and was deleted"
fi
if ! "$PG_RESTORE" --file=/dev/null "$PART"; then
	rm -f "$PART"
	fail "the dump could not be read back end to end (truncated or corrupt) — the artifact is NOT a restore point and was deleted"
fi

mv "$PART" "$FINAL" || {
	rm -f "$PART"
	fail "could not put the verified dump under its final name '$FINAL'"
}

SIZE=$(wc -c < "$FINAL" | tr -d ' ')
echo "dedalo-db-backup: verified $FINAL ($SIZE bytes)"
