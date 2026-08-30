#!/bin/sh
# Dédalo backup set — STORE 5: the site-builder instances on this host.
#
# engineering/PRODUCTION.md §6 names the backup set. Stores 1–4 are the engine's
# (matrix DB, RAG DB, media originals, ../private/) and live as ExecStart lines in
# deploy/dedalo-backup.service. This is store 5, and it is a script rather than a
# fifth ExecStart line for one reason: it is the only member of the set whose SOURCES
# ARE NOT KNOWN UNTIL THE HOST IS READ. A host carries N museums, each declared under
# /etc/dedalo_sites/instances/<instance>/, each with its own roots and its own sites.
#
# WHERE THE PATHS COME FROM — and why not from a list in here.
#
# Every path this script copies is read out of the artifacts the PROVISIONER GENERATED
# for that instance:
#
#     <config>/<instance>/env         -> SITES_ROOT, AUDIT_DIR   (the daemon's own env)
#     <config>/<instance>/sites.json  -> every site's webspace   (the published site table)
#
# A hand-kept list of roots in this file would be a second derivation of the host layout,
# which is the defect engineering/SITE_BUILDER_INSTANCES.md §4 and the repo's
# site_builder_single_source_tripwire exist to prevent. Here it would fail in the worst
# direction there is: a museum's site quietly outside the backup. So the backup reads the
# same two files the daemon reads, and an instance whose artifacts are missing is REPORTED
# and skipped, never silently passed over.
#
# WHAT IS COPIED, per instance:
#
#   config/            the declaration and its secrets/ (root-owned; modes preserved)
#   workspaces/        SITES_ROOT — every site's source and its full git history
#   webspaces/<full source path, without its leading slash>
#                      the whole webspace: BOTH release stores (.releases/pre, .releases/web)
#                      AND the two served symlinks (pre, web). The links are copied as links,
#                      because "which release is live" is a fact that lives in a symlink and
#                      nowhere else, and a restore that loses it cannot be reconciled.
#   audit/             AUDIT_DIR — the append-only accountability trail.
#
# WHY A WEBSPACE'S DESTINATION MIRRORS ITS WHOLE SOURCE PATH.
#
# It used to be `webspaces/$(basename "$webspace")`, and a basename is not a name: two sites
# of ONE museum whose declared webspaces end in the same directory (…/srvA/site and
# …/srvB/site — `sites[].webspace` is a free path, so nothing prevents it) collapsed onto one
# destination. rsync then copied the first, and copied the second OVER it — one museum's
# published bytes silently replaced by another of its sites', and the script reported success
# and exited 0. Backing up less than was asked for is the one failure a backup may never have,
# and reporting it as done is worse than not running at all.
#
# The destination is therefore the SOURCE PATH ITSELF, minus its leading slash, which cannot
# collide because two different absolute paths are two different absolute paths. It also makes
# a restore self-describing: the tree under `webspaces/` is the host's own tree. And the
# collision is checked anyway, below, because a guard that depends on a naming scheme staying
# clever is a guard nobody will notice losing.
#
# The `.dedalo_site_instance` markers inside those roots are ordinary files and travel with
# them. That is load-bearing on restore: a root that comes back non-empty and UNMARKED is
# refused by the provisioner (SITE_BUILDER_INSTANCES.md §5), so a restore that drops
# dotfiles produces a host that will not converge. Never restore these trees with a tool
# that skips hidden entries.
#
# WHAT IS NOT COPIED: nothing generated. The unit, the vhosts, the rendered env and
# sites.json are functions of the declaration — `provision apply` rewrites all of them from
# the config/ directory above. Backing up a generated file would create a second, older
# answer to a question the declaration already answers.
#
# Usage (the nightly unit's ExecStart, and the same thing by hand):
#
#     deploy/dedalo-site-builder-backup.sh <destination> [<config dir>]
#
# Exit 0 when every declared instance was copied, 1 when any was skipped or failed. A host
# with NO instances declared is exit 0 and one line: this store is empty on most installs.
set -eu

DEST=${1:-}
CONFIG_DIR=${2:-/etc/dedalo_sites/instances}

if [ -z "$DEST" ]; then
	echo "dedalo-site-builder-backup: usage: $0 <destination> [<config dir>]" >&2
	exit 2
fi

command -v rsync >/dev/null 2>&1 || {
	echo "dedalo-site-builder-backup: rsync is not installed; refusing to half-copy a museum's data" >&2
	exit 2
}

if [ ! -d "$CONFIG_DIR" ]; then
	echo "dedalo-site-builder-backup: no site-builder instances on this host ($CONFIG_DIR does not exist)"
	exit 0
fi

status=0
found=0

# One generated `KEY="value"` line out of a rendered instance env. The renderer always
# quotes, always writes one key per line, and never repeats a key.
env_value() {
	sed -n "s/^$2=\"\\(.*\\)\"$/\\1/p" "$1" | tail -n 1
}

# Copy one tree, preserving ownership, modes and symlinks, and keeping the destination an
# exact mirror. Absence of the source is REPORTED, never silent: an empty backup directory
# and a missing source look identical at restore time, which is the worst moment to find out.
copy_tree() {
	src=$1
	dst=$2
	what=$3
	if [ ! -e "$src" ]; then
		echo "dedalo-site-builder-backup: $what: '$src' does not exist — NOT backed up" >&2
		status=1
		return
	fi
	mkdir -p "$dst"
	rsync -a --delete "$src/" "$dst/"
}

for manifest in "$CONFIG_DIR"/*/instance.json; do
	[ -e "$manifest" ] || continue
	found=$((found + 1))
	dir=$(dirname "$manifest")
	instance=$(basename "$dir")
	target="$DEST/$instance"

	# 1. The declaration and its credentials. Everything else on the host is derived from
	#    this directory, so it is restored FIRST and nothing else can be restored without it.
	copy_tree "$dir" "$target/config" "instance '$instance' config"

	envfile="$dir/env"
	if [ ! -f "$envfile" ]; then
		echo "dedalo-site-builder-backup: instance '$instance' has no rendered env ($envfile) — its roots cannot be read, so its workspaces and audit trail were NOT backed up. Run 'provision apply --instance $instance'." >&2
		status=1
		continue
	fi

	# 2. The workspaces root: every site's source and its git history.
	sites_root=$(env_value "$envfile" SITES_ROOT)
	if [ -n "$sites_root" ]; then
		copy_tree "$sites_root" "$target/workspaces" "instance '$instance' workspaces root"
	else
		echo "dedalo-site-builder-backup: instance '$instance' declares no SITES_ROOT — workspaces NOT backed up" >&2
		status=1
	fi

	# 3. The audit trail.
	audit_dir=$(env_value "$envfile" AUDIT_DIR)
	if [ -n "$audit_dir" ]; then
		copy_tree "$audit_dir" "$target/audit" "instance '$instance' audit directory"
	else
		echo "dedalo-site-builder-backup: instance '$instance' declares no AUDIT_DIR — the audit trail was NOT backed up" >&2
		status=1
	fi

	# 4. Every site's webspace — both release stores and both served links. The site table
	#    is the provisioner's published answer to "where is this site served from"; reading
	#    it here is what keeps this script from deriving that placement a second time.
	table="$dir/sites.json"
	if [ ! -f "$table" ]; then
		echo "dedalo-site-builder-backup: instance '$instance' has no site table ($table) — no webspace was backed up. Run 'provision apply --instance $instance'." >&2
		status=1
		continue
	fi
	# NOT a pipeline into `while read`: a pipeline's loop body runs in a SUBSHELL, so every
	# failure it recorded would be discarded and this script would exit 0 having skipped a
	# museum's published bytes. The list is captured first and walked in this shell.
	webspaces=$(sed -n 's/^[[:space:]]*"webspace": "\(.*\)",\{0,1\}$/\1/p' "$table")
	if [ -z "$webspaces" ]; then
		echo "dedalo-site-builder-backup: instance '$instance' declares no site yet — no webspace to copy"
	fi
	OLDIFS=$IFS
	IFS='
'
	seen=""
	for webspace in $webspaces; do
		IFS=$OLDIFS
		# The source path, minus its leading slash. Cannot collide; see the header.
		dst="$target/webspaces/${webspace#/}"
		# …and REFUSE rather than overwrite if it somehow does — a site table naming one
		# webspace twice, or a path that normalises onto another. Overwriting here is a
		# museum's published bytes lost inside a backup that reports success.
		case "$seen" in
		*"|$dst|"*)
			echo "dedalo-site-builder-backup: instance '$instance' declares the webspace destination '$dst' twice — one site's bytes would overwrite another's. NOT backed up; fix the site table." >&2
			status=1
			IFS='
'
			continue
			;;
		esac
		seen="$seen|$dst|"
		copy_tree "$webspace" "$dst" "instance '$instance' webspace"
		IFS='
'
	done
	IFS=$OLDIFS
done

if [ "$found" -eq 0 ]; then
	echo "dedalo-site-builder-backup: no site-builder instances declared under $CONFIG_DIR"
	exit 0
fi

echo "dedalo-site-builder-backup: $found instance(s) copied to $DEST"
exit $status
