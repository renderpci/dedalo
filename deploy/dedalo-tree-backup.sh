#!/bin/sh
# Dédalo backup set — STORES 3 AND 4: a GENERATIONAL copy of one directory tree.
#
# WHY IT EXISTS (P0-13, 2026-08-30). The nightly media job was
#
#     rsync -a --delete "$MEDIA_PATH/" /opt/dedalo/backups/media/
#
# — ONE generation, mirrored, no retention, against the store
# engineering/PRODUCTION.md §6 calls "the source of truth every derivative rebuilds
# from". A mass deletion (a mis-run maintenance tool, a bad import, ransomware, an
# unmounted volume that makes the source look empty) is faithfully propagated into
# the only copy that exists within 24 hours, and a museum with ONE copy of an
# irreplaceable photograph then has none. `--delete` is not the villain by itself:
# the absence of yesterday is.
#
# So each run writes its OWN generation and the previous ones are left alone:
#
#     <destination>/2026-08-30_033000/     one run
#     <destination>/2026-08-29_033000/     the run before it
#     <destination>/latest -> 2026-08-30_033000
#
# Unchanged files are HARD LINKED to the previous generation (rsync --link-dest),
# so N generations of a media library that barely changes cost about one copy plus
# the changes. That is what makes retention affordable, which is what makes it get
# left switched on.
#
# RETENTION RULE — stated here because a retention rule that lives only in
# somebody's head is not a rule: KEEP THE 14 MOST RECENT GENERATIONS (--keep,
# default 14). Nightly, that is a fortnight in which a deletion can be noticed and
# undone. Older generations are removed after a successful run, never before one
# and never when the copy failed. Two consequences worth being explicit about:
# a deletion older than 14 runs IS eventually propagated (this is a backup, not an
# archive), and a restore of a partially damaged tree means picking the newest
# generation that predates the damage, which is why the directory names are dates.
#
# HARD LINKS ARE A LOAD-BEARING PROPERTY OF THE COPY, NOT OF THE DATA. Editing a
# file in a generation in place would silently edit it in every generation that
# shares the inode. Restore by COPYING OUT of a generation; never work inside one.
# (The engine never writes here at all — this destination is the backup's.)
#
# Usage (the nightly unit's ExecStart, and the same thing by hand):
#
#     dedalo-tree-backup.sh --dest <directory> --label <what> \
#         [--source <path> | --source-key <KEY>] [--keep <n>] [--exclude <pattern>]
#
# --source-key names an env key to read the source from (with the same TS-native →
# PHP-alias fallback the engine uses), so the unit reads as the mapping it is and
# the path is not duplicated into the unit file. An unresolvable source is a loud
# refusal, never a guess: for MEDIA_PATH there are two plausible defaults
# (<projectRoot>/media and <privateDir>/media, src/config/catalog/media.ts) and
# guessing the wrong one backs up an empty directory while reporting success.
#
# Exit 0 only when a complete new generation exists under its final name.
set -u

DEST=''
LABEL=''
SOURCE=''
SOURCE_KEY=''
KEEP=14
EXCLUDES=''

fail() {
	echo "dedalo-tree-backup${LABEL:+ [$LABEL]}: $*" >&2
	exit 1
}

while [ "$#" -gt 0 ]; do
	case "$1" in
	--dest) DEST=${2:-}; shift 2 ;;
	--label) LABEL=${2:-}; shift 2 ;;
	--source) SOURCE=${2:-}; shift 2 ;;
	--source-key) SOURCE_KEY=${2:-}; shift 2 ;;
	--keep) KEEP=${2:-}; shift 2 ;;
	--exclude) EXCLUDES="$EXCLUDES $2"; shift 2 ;;
	*) fail "unknown argument '$1'" ;;
	esac
done

# The same TS-native-then-PHP-alias precedence src/config/env.ts applies. MEDIA_PATH
# is the only key of this store's kind that has an alias; the table is kept next to
# the one in deploy/dedalo-db-backup.sh and both are held equal to env.ts by
# test/unit/operator_commands_tripwire.test.ts.
# ALIAS <ts-native> <php-catalog>
alias_of() {
	case "$1" in
	MEDIA_PATH) echo DEDALO_MEDIA_PATH ;;
	*) echo '' ;;
	esac
}

value_of() {
	name=$1
	case "$name" in
	'' | *[!A-Za-z0-9_]*) fail "'$name' is not a config key name" ;;
	esac
	eval "printf '%s' \"\${$name:-}\""
}

if [ -z "$SOURCE" ] && [ -n "$SOURCE_KEY" ]; then
	SOURCE=$(value_of "$SOURCE_KEY")
	if [ -z "$SOURCE" ]; then
		alias_name=$(alias_of "$SOURCE_KEY")
		[ -n "$alias_name" ] && SOURCE=$(value_of "$alias_name")
	fi
	[ -n "$SOURCE" ] || fail "neither '$SOURCE_KEY' nor its PHP alias is set, and this store's location cannot be guessed. Set $SOURCE_KEY in ../private/.env (it is append-only: add the line) to the directory the engine actually uses, and re-run."
fi

[ -n "$DEST" ] || fail "--dest is required"
[ -n "$SOURCE" ] || fail "--source or --source-key is required"
[ -d "$SOURCE" ] || fail "the source '$SOURCE' is not a directory — NOTHING was copied (an absent source and an empty backup look identical at restore time)"

case "$KEEP" in
'' | *[!0-9]*) fail "--keep must be a whole number, got '$KEEP'" ;;
esac
[ "$KEEP" -ge 1 ] || fail "--keep must be at least 1: a backup with no generation is not a backup"

command -v rsync >/dev/null 2>&1 || fail "rsync is not installed; refusing to half-copy a museum's data"

mkdir -p "$DEST" || fail "cannot create the destination '$DEST'"

# The newest existing generation, by name — the names are timestamps, so the
# lexical order IS the chronological one. It becomes --link-dest, and it is read
# before anything is written so a failed run cannot change what the next one links
# against.
previous=$(ls -1 "$DEST" 2>/dev/null | grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{6}$' | sort | tail -n 1)

STAMP=$(date '+%Y-%m-%d_%H%M%S')
TARGET="$DEST/$STAMP"
# A generation is built under a name that is NOT a generation name and moved into
# place when it is complete, so an interrupted run can never be mistaken for a
# finished one — not by the next run's --link-dest, not by the retention scan, and
# not by an operator restoring at 3am.
WORK="$DEST/.incomplete_$STAMP"

if [ -e "$TARGET" ]; then
	fail "generation '$TARGET' already exists — refusing to write over a copy that is already made"
fi

rm -rf "$WORK"

set -- --archive --delete --delete-excluded
for pattern in $EXCLUDES; do
	set -- "$@" --exclude="$pattern"
done
if [ -n "$previous" ]; then
	# Unchanged files become hard links into the previous generation instead of
	# copies. If the destination filesystem or the rsync build does not support it,
	# rsync still produces a COMPLETE generation — it just costs a full copy.
	set -- "$@" --link-dest="$DEST/$previous"
fi

echo "dedalo-tree-backup${LABEL:+ [$LABEL]}: $SOURCE -> $TARGET${previous:+ (linked against $previous)}"
rsync "$@" "$SOURCE/" "$WORK/"
code=$?
if [ "$code" -ne 0 ]; then
	# The incomplete tree is kept, under its .incomplete_ name: it is evidence, and
	# it is never mistaken for a generation. The next run removes its own.
	fail "rsync exited $code — '$WORK' is INCOMPLETE and was not promoted to a generation"
fi

mv "$WORK" "$TARGET" || fail "could not promote '$WORK' to '$TARGET'"

# `latest` is a convenience for the operator and for a restore recipe; the
# generations are the truth. ln -sfn replaces the link itself rather than writing
# through it into the directory it points at.
ln -sfn "$STAMP" "$DEST/latest" 2>/dev/null || true

# RETENTION, after a successful run only. It removes ONLY entries that match the
# generation name pattern exactly — never `latest`, never an .incomplete_ tree,
# never anything an operator left in this directory.
generations=$(ls -1 "$DEST" 2>/dev/null | grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{6}$' | sort)
count=$(printf '%s\n' "$generations" | grep -c '^[0-9]' || true)
if [ "$count" -gt "$KEEP" ]; then
	drop=$((count - KEEP))
	printf '%s\n' "$generations" | head -n "$drop" | while read -r old; do
		[ -n "$old" ] || continue
		echo "dedalo-tree-backup${LABEL:+ [$LABEL]}: retention: removing generation $old (keeping $KEEP)"
		rm -rf "$DEST/$old"
	done
fi

echo "dedalo-tree-backup${LABEL:+ [$LABEL]}: generation $STAMP complete"
