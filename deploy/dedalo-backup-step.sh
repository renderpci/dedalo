#!/bin/sh
# Dédalo backup set — THE STEP RUNNER: run one store, record what happened, never
# let one store's failure cancel the others, and still FAIL THE UNIT at the end.
#
# WHY IT EXISTS (P0-13, 2026-08-30). deploy/dedalo-backup.service was a
# `Type=oneshot` unit with four plain ExecStart lines. systemd stops a oneshot at
# the FIRST failing ExecStart, so a database server that was down at 03:30 meant
# the media originals, ../private/ and every site-builder instance were not copied
# either — one refused connection silenced the whole backup set, on a store where
# the only symptom is discovered at restore time.
#
# The obvious repair — prefix every line with `-` so systemd ignores each exit
# status — is worse: the unit then always succeeds, `systemctl status` is green,
# and nothing anywhere says a store is missing. A backup that reports success it
# did not have is the failure mode this whole task exists to close.
#
# So: stores 1..n-1 run through `run`, whose exit status systemd is told to ignore
# (the `-` prefix), and the LAST store runs through `run --last`, which after its
# own store aggregates every recorded status and exits non-zero if ANY store
# failed. Every store runs; the unit's final verdict is the truth about all of
# them; and `OnFailure=` therefore fires exactly when at least one store did not
# make it. There is no sixth ExecStart line because the store table in
# engineering/PRODUCTION.md §6 and this unit are held EQUAL, step for step, by
# test/unit/operator_commands_tripwire.test.ts.
#
# Usage:
#     dedalo-backup-step.sh run [--last] <store> <command> [args...]
#     dedalo-backup-step.sh report
#
# <store> is a short identifier ([a-z0-9_]), one per store of the backup set; it
# is used as a file name and as the label in the summary line.
#
# Exit status:
#     run          the child's exit status (so the journal shows the real one)
#     run --last   0 only if every EXPECTED store recorded, and all succeeded
#     report       0 only if every EXPECTED store recorded, and all succeeded
#
# Where the per-run statuses live: $DEDALO_BACKUP_STATUS_DIR, else systemd's
# $RUNTIME_DIRECTORY (the unit declares RuntimeDirectory=dedalo-backup, which
# systemd creates before the first step and REMOVES when the unit stops — so one
# run can never read another run's leftovers), else /run/dedalo-backup.
#
# WHICH STORES WERE SUPPOSED TO RUN: $DEDALO_BACKUP_EXPECTED_STORES, a
# space-separated list the unit declares. Without it the aggregate can only see
# the stores that DID record a status — so a step whose ExecStart never ran at
# all (a typo in the unit, a missing script, a store commented out by mistake)
# is INVISIBLE, and a run that copied three stores of five reports "every store
# succeeded". That is the same silent success this file exists to remove, one
# level up: the `any -eq 0` guard below only catches a run where NOTHING
# recorded, never a partial one.
#
# Where the persistent verdict lives: $DEDALO_BACKUP_STATE_DIR (the unit sets it),
# as BACKUP_FAILED / LAST_OK. That directory is what an operator reads, and it
# survives the run — $RUNTIME_DIRECTORY deliberately does not.
#
# NO `set -e`: this script's entire job is to outlive a failing child.
set -u

fail() {
	echo "dedalo-backup-step: $*" >&2
	exit 2
}

status_dir() {
	if [ -n "${DEDALO_BACKUP_STATUS_DIR:-}" ]; then
		echo "$DEDALO_BACKUP_STATUS_DIR"
		return
	fi
	# $RUNTIME_DIRECTORY is a COLON-SEPARATED list when the unit declares several
	# directories; ours declares one, and taking the first entry is correct for
	# both shapes.
	if [ -n "${RUNTIME_DIRECTORY:-}" ]; then
		echo "${RUNTIME_DIRECTORY%%:*}"
		return
	fi
	echo /run/dedalo-backup
}

STATUS_DIR=$(status_dir)
STATE_DIR=${DEDALO_BACKUP_STATE_DIR:-}

mkdir -p "$STATUS_DIR" || fail "cannot create the status directory '$STATUS_DIR'"

# The persistent verdict. Written by `report` (and by deploy/dedalo-backup-alert.sh
# when the unit dies before reaching it). Failure to write it is REPORTED but does
# not change the exit status: the exit status is the contract, the marker is the
# operator's copy of it.
write_marker() {
	name=$1
	body=$2
	[ -n "$STATE_DIR" ] || return 0
	if ! mkdir -p "$STATE_DIR" 2>/dev/null; then
		echo "dedalo-backup-step: cannot create the state directory '$STATE_DIR' — the verdict is in this journal only" >&2
		return 0
	fi
	printf '%s\n' "$body" > "$STATE_DIR/$name" 2>/dev/null ||
		echo "dedalo-backup-step: cannot write '$STATE_DIR/$name' — the verdict is in this journal only" >&2
}

report() {
	any=0
	failed=0
	summary=''
	for file in "$STATUS_DIR"/*.status; do
		[ -e "$file" ] || continue
		any=1
		store=$(basename "$file" .status)
		code=$(cat "$file" 2>/dev/null || echo '?')
		summary="$summary  $store: exit $code
"
		[ "$code" = "0" ] || failed=1
	done

	# EXPECTED vs RECORDED. A store that recorded nothing did not run, and a
	# store that did not run was not copied.
	missing=''
	if [ -n "${DEDALO_BACKUP_EXPECTED_STORES:-}" ]; then
		for expected in $DEDALO_BACKUP_EXPECTED_STORES; do
			if [ ! -e "$STATUS_DIR/$expected.status" ]; then
				missing="$missing $expected"
				failed=1
			fi
		done
		if [ -n "$missing" ]; then
			summary="$summary  MISSING (never ran):$missing
"
		fi
	else
		# Not a failure — an older unit predates this variable, and a backup that
		# ran must not be voided by its runner being newer than its unit. But the
		# run's COMPLETENESS is unverified, and that must be said out loud rather
		# than inferred from a green summary.
		echo "dedalo-backup: WARNING — \$DEDALO_BACKUP_EXPECTED_STORES is unset, so this run cannot tell a store that SUCCEEDED from one that never ran. Declare it in the unit (Environment=DEDALO_BACKUP_EXPECTED_STORES=...)." >&2
	fi

	if [ "$any" -eq 0 ]; then
		# A run that recorded nothing is NOT a successful run. It means every step
		# was skipped, or the status directory moved — either way nothing is known
		# to have been copied, and "nothing is known" must never read as success.
		echo "dedalo-backup: NO STORE recorded a status in '$STATUS_DIR' — nothing is known to have been backed up" >&2
		write_marker BACKUP_FAILED "$(date '+%Y-%m-%d %H:%M:%S%z') dedalo-backup: no store recorded a status in '$STATUS_DIR'"
		return 1
	fi

	if [ "$failed" -eq 0 ]; then
		printf 'dedalo-backup: every store succeeded\n%s' "$summary"
		# Clearing the failure marker is what makes it TRUSTWORTHY: a marker that is
		# only ever created would still be sitting there months after the operator
		# fixed the problem, and would be ignored exactly like a stuck alarm.
		[ -n "$STATE_DIR" ] && rm -f "$STATE_DIR/BACKUP_FAILED"
		write_marker LAST_OK "$(date '+%Y-%m-%d %H:%M:%S%z') dedalo-backup: every store succeeded
$summary"
		return 0
	fi

	if [ -n "$missing" ]; then
		echo "dedalo-backup: STORE(S) NEVER RAN:$missing — expected by \$DEDALO_BACKUP_EXPECTED_STORES but no status was recorded" >&2
	fi
	printf 'dedalo-backup: AT LEAST ONE STORE FAILED — this run is NOT a restore point\n%s' "$summary" >&2
	write_marker BACKUP_FAILED "$(date '+%Y-%m-%d %H:%M:%S%z') dedalo-backup: at least one store FAILED — this run is not a restore point
$summary"
	return 1
}

verb=${1:-}
[ -n "$verb" ] || fail "usage: $0 run [--last] <store> <command> [args...] | $0 report"
shift

case "$verb" in
report)
	report
	exit $?
	;;
run) ;;
*)
	fail "unknown verb '$verb' (expected 'run' or 'report')"
	;;
esac

last=0
if [ "${1:-}" = "--last" ]; then
	last=1
	shift
fi

store=${1:-}
[ -n "$store" ] || fail "usage: $0 run [--last] <store> <command> [args...]"
shift
# The store name becomes a file name; refuse anything that is not plainly one
# rather than write a status file somewhere else entirely.
case "$store" in
*[!a-z0-9_]*) fail "store name '$store' is not [a-z0-9_]" ;;
esac
[ "$#" -gt 0 ] || fail "store '$store': no command given"

echo "dedalo-backup: store '$store' starting: $*"
"$@"
code=$?
echo "$code" > "$STATUS_DIR/$store.status"
if [ "$code" -eq 0 ]; then
	echo "dedalo-backup: store '$store' OK"
else
	# Loud, named, and on stderr — this line is what an operator greps for, and it
	# must survive even when the aggregate verdict below is never reached.
	echo "dedalo-backup: store '$store' FAILED (exit $code) — the remaining stores still run; the unit will fail at the end" >&2
fi

if [ "$last" -eq 1 ]; then
	report
	exit $?
fi

exit "$code"
